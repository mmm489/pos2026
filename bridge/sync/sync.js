/**
 * Hi Cream POS — Sync local PostgreSQL → Neon (cloud)
 *
 * Sube pedidos y cierres de caja no sincronizados a Neon.
 * Se ejecuta cada 5 minutos desde sync-runner.js
 */

const { Client } = require("pg");
const { neon } = require("@neondatabase/serverless");

const LOCAL_DB_URL = process.env.LOCAL_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/hicream";
const NEON_DB_URL = process.env.NEON_DATABASE_URL;

function log(msg) {
  console.log(`[${new Date().toISOString()}] [Sync] ${msg}`);
}

async function getLocalClient() {
  const client = new Client({ connectionString: LOCAL_DB_URL });
  await client.connect();
  return client;
}

async function syncOrders(local, neonSql) {
  // Get unsynced orders
  const { rows: orders } = await local.query(
    `SELECT id, order_number, status, total, payment_method, employee_id, created_at, completed_at
     FROM pos.orders WHERE synced = false ORDER BY created_at ASC LIMIT 100`
  );

  if (orders.length === 0) return 0;

  for (const order of orders) {
    // Get order items
    const { rows: items } = await local.query(
      `SELECT product_id, qty, unit_price, notes FROM pos.order_items WHERE order_id = $1`,
      [order.id]
    );

    // Insert order into Neon
    const empId = order.employee_id || null;
    const completedAt = order.completed_at || null;
    const result = await neonSql`
      INSERT INTO pos.orders (order_number, status, total, payment_method, employee_id, created_at, completed_at, synced)
      VALUES (${order.order_number}, ${order.status}, ${order.total}, ${order.payment_method}, ${empId}, ${order.created_at}, ${completedAt}, true)
      ON CONFLICT DO NOTHING
      RETURNING id
    `;

    if (result.length > 0) {
      const neonOrderId = result[0].id;

      // Insert items
      for (const item of items) {
        const itemNotes = item.notes || null;
        await neonSql`
          INSERT INTO pos.order_items (order_id, product_id, qty, unit_price, notes)
          VALUES (${neonOrderId}, ${item.product_id}, ${item.qty}, ${item.unit_price}, ${itemNotes})
        `;
      }
    }

    // Mark as synced locally
    await local.query(`UPDATE pos.orders SET synced = true WHERE id = $1`, [order.id]);
  }

  return orders.length;
}

async function syncCashClosings(local, neonSql) {
  const { rows: closings } = await local.query(
    `SELECT id, employee_id, opened_at, closed_at, total_cash, total_card, total_sales, ticket_count, notes
     FROM pos.cash_closings WHERE synced = false ORDER BY closed_at ASC LIMIT 50`
  );

  if (closings.length === 0) return 0;

  for (const c of closings) {
    const empId = c.employee_id || null;
    const closingNotes = c.notes || null;
    await neonSql`
      INSERT INTO pos.cash_closings (employee_id, opened_at, closed_at, total_cash, total_card, total_sales, ticket_count, notes, synced)
      VALUES (${empId}, ${c.opened_at}, ${c.closed_at}, ${c.total_cash}, ${c.total_card}, ${c.total_sales}, ${c.ticket_count}, ${closingNotes}, true)
      ON CONFLICT DO NOTHING
    `;

    await local.query(`UPDATE pos.cash_closings SET synced = true WHERE id = $1`, [c.id]);
  }

  return closings.length;
}

async function syncProducts(local, neonSql) {
  // Sync categories and products from local to Neon (in case they were edited locally)
  const { rows: categories } = await local.query(
    `SELECT id, name, sort_order, color FROM pos.categories ORDER BY id`
  );

  for (const cat of categories) {
    await neonSql`
      INSERT INTO pos.categories (id, name, sort_order, color)
      VALUES (${cat.id}, ${cat.name}, ${cat.sort_order}, ${cat.color})
      ON CONFLICT (id) DO UPDATE SET name = ${cat.name}, sort_order = ${cat.sort_order}, color = ${cat.color}
    `;
  }

  const { rows: products } = await local.query(
    `SELECT id, name, category_id, price, image_url, active, sort_order FROM pos.products ORDER BY id`
  );

  for (const p of products) {
    const imgUrl = p.image_url || null;
    await neonSql`
      INSERT INTO pos.products (id, name, category_id, price, image_url, active, sort_order)
      VALUES (${p.id}, ${p.name}, ${p.category_id}, ${p.price}, ${imgUrl}, ${p.active}, ${p.sort_order})
      ON CONFLICT (id) DO UPDATE SET name = ${p.name}, price = ${p.price}, active = ${p.active}, sort_order = ${p.sort_order}
    `;
  }

  // Sync employees
  const { rows: employees } = await local.query(
    `SELECT id, name, pin, role, active FROM pos.employees ORDER BY id`
  );

  for (const e of employees) {
    await neonSql`
      INSERT INTO pos.employees (id, name, pin, role, active)
      VALUES (${e.id}, ${e.name}, ${e.pin}, ${e.role}, ${e.active})
      ON CONFLICT (id) DO UPDATE SET name = ${e.name}, role = ${e.role}, active = ${e.active}
    `;
  }
}

async function runSync() {
  if (!NEON_DB_URL) {
    log("NEON_DATABASE_URL no configurada — sync desactivado");
    return;
  }

  let local;
  try {
    local = await getLocalClient();
    const neonSql = neon(NEON_DB_URL);

    // Test Neon connection
    await neonSql`SELECT 1`;

    const orderCount = await syncOrders(local, neonSql);
    const closingCount = await syncCashClosings(local, neonSql);
    await syncProducts(local, neonSql);

    if (orderCount > 0 || closingCount > 0) {
      log(`Sincronizado: ${orderCount} pedidos, ${closingCount} cierres`);
    } else {
      log("Todo sincronizado, nada nuevo");
    }
  } catch (err) {
    if (err.message && (err.message.includes("ENOTFOUND") || err.message.includes("ETIMEDOUT") || err.message.includes("fetch"))) {
      log("Sin internet — se reintentara en 5 min");
    } else {
      log(`Error: ${err.message}`);
    }
  } finally {
    if (local) await local.end();
  }
}

module.exports = { runSync };

// Si se ejecuta directamente: node sync.js
if (require.main === module) {
  runSync().then(() => process.exit(0));
}
