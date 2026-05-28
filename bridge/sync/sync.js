/**
 * Hi Cream POS - reporting sync
 *
 * Copies the local POS database into a cloud Postgres database used only by
 * the Vercel dashboard. The local POS remains the source of truth and this
 * script never writes to the local database.
 */

require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { neon } = require("@neondatabase/serverless");
const { Client } = require("pg");

const LOCAL_DB_URL =
  process.env.LOCAL_DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/hicream";

const DASHBOARD_DB_URL =
  process.env.DASHBOARD_DATABASE_URL ||
  process.env.DASHBOARD_SYNC_DATABASE_URL ||
  "";

const BATCH_SIZE = Number(process.env.DASHBOARD_SYNC_BATCH_SIZE || 500);
const SCHEMA_PATH = path.resolve(__dirname, "../scripts/dashboard-cloud-schema.sql");
const DASHBOARD_DRIVER = process.env.DASHBOARD_SYNC_DRIVER || "";

const TABLES = [
  {
    name: "categories",
    columns: ["id", "name", "sort_order", "color"],
    orderBy: "id",
  },
  {
    name: "business",
    columns: [
      "id",
      "name",
      "trade_name",
      "nif",
      "address",
      "city",
      "postal_code",
      "province",
      "phone",
      "invoice_series",
      "next_invoice_number",
      "next_z_number",
    ],
    orderBy: "id",
  },
  {
    name: "employees",
    columns: ["id", "name", "role", "active"],
    orderBy: "id",
  },
  {
    name: "products",
    columns: ["id", "name", "category_id", "price", "vat_rate", "image_url", "active", "sort_order"],
    orderBy: "id",
  },
  {
    name: "orders",
    columns: [
      "id",
      "order_number",
      "invoice_number",
      "status",
      "total",
      "total_base",
      "total_vat",
      "payment_method",
      "employee_id",
      "table_number",
      "created_at",
      "completed_at",
      "cancelled_at",
      "cancellation_reason",
      "cancelled_by",
      "card_reference",
      "card_authorization",
      "card_receipt_text",
      "refund_reference",
      "refund_at",
      "synced",
    ],
    orderBy: "id",
  },
  {
    name: "order_items",
    columns: [
      "id",
      "order_id",
      "product_id",
      "qty",
      "unit_price",
      "vat_rate",
      "notes",
      "kds_ready",
      "kds_ready_at",
    ],
    orderBy: "id",
  },
  {
    name: "kds_events",
    columns: ["id", "order_id", "event_type", "timestamp"],
    orderBy: "id",
  },
  {
    name: "cash_closings",
    columns: [
      "id",
      "employee_id",
      "opened_at",
      "closed_at",
      "total_cash",
      "total_card",
      "total_sales",
      "ticket_count",
      "notes",
      "synced",
      "z_number",
      "z_label",
      "total_base",
      "total_vat",
      "vat_breakdown",
      "first_invoice",
      "last_invoice",
      "cancelled_count",
      "total_refunded",
      "card_count",
      "cash_count",
      "business_snapshot",
    ],
    orderBy: "id",
  },
  {
    name: "card_transactions",
    columns: [
      "id",
      "order_id",
      "operation",
      "amount",
      "reference",
      "original_reference",
      "success",
      "response_code",
      "authorization_code",
      "error_message",
      "request",
      "response",
      "duration_ms",
      "created_at",
    ],
    orderBy: "id",
    optional: true,
  },
];

function log(message) {
  console.log(`[${new Date().toISOString()}] [DashboardSync] ${message}`);
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function columnList(columns) {
  return columns.map(quoteIdent).join(", ");
}

function placeholders(columns, offset = 0) {
  return columns.map((_, index) => `$${offset + index + 1}`).join(", ");
}

function updateAssignments(columns, keyColumn = "id") {
  return columns
    .filter((column) => column !== keyColumn)
    .map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`)
    .join(", ");
}

async function connect(url, label) {
  const client = new Client({ connectionString: url });
  await client.connect();
  client.supportsTransactions = true;
  log(`${label} conectado`);
  return client;
}

function shouldUseNeonHttp(url) {
  const requestedDriver = DASHBOARD_DRIVER.toLowerCase();
  if (requestedDriver === "pg") return false;
  if (requestedDriver === "neon-http") return true;

  try {
    const hostname = new URL(url).hostname;
    return hostname.endsWith(".neon.tech") || hostname.includes(".neon.tech");
  } catch {
    return false;
  }
}

async function connectDashboard(url) {
  if (!shouldUseNeonHttp(url)) {
    return connect(url, "cloud dashboard");
  }

  const sql = neon(url, { fullResults: true });
  await sql.query("select 1", []);
  log("cloud dashboard conectado via Neon HTTPS");

  return {
    supportsTransactions: false,
    query(queryText, params = []) {
      return sql.query(queryText, params);
    },
    async end() {
      // The Neon HTTP client does not keep a local socket open.
    },
  };
}

function splitSqlStatements(sql) {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function ensureCloudSchema(cloud) {
  const schemaSql = fs.readFileSync(SCHEMA_PATH, "utf8");
  for (const statement of splitSqlStatements(schemaSql)) {
    await cloud.query(statement);
  }
}

function asPayload(value) {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
}

function cleanText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function nextLocalId(local, tableName) {
  const result = await local.query(`SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM pos.${quoteIdent(tableName)}`);
  return Number(result.rows[0]?.next_id || 1);
}

async function applyCategoryChange(local, change) {
  const payload = asPayload(change.payload);
  const name = cleanText(payload.name);
  const sortOrder = cleanNumber(payload.sort_order, 0);
  const color = cleanText(payload.color, "#64748b");

  if (!name) throw new Error("Categoria sin nombre");

  if (change.action === "create") {
    const id = await nextLocalId(local, "categories");
    await local.query(
      `INSERT INTO pos.categories (id, name, sort_order, color) VALUES ($1, $2, $3, $4)`,
      [id, name, sortOrder, color],
    );
    return id;
  }

  if (change.action === "update") {
    const id = Number(change.entity_id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Categoria sin id");
    const result = await local.query(
      `UPDATE pos.categories SET name = $1, sort_order = $2, color = $3 WHERE id = $4 RETURNING id`,
      [name, sortOrder, color, id],
    );
    if (!result.rowCount) throw new Error(`Categoria ${id} no encontrada`);
    return id;
  }

  throw new Error(`Accion de categoria no soportada: ${change.action}`);
}

async function applyProductChange(local, change) {
  const payload = asPayload(change.payload);

  if (change.action === "deactivate") {
    const id = Number(change.entity_id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Producto sin id");
    const result = await local.query(`UPDATE pos.products SET active = FALSE WHERE id = $1 RETURNING id`, [id]);
    if (!result.rowCount) throw new Error(`Producto ${id} no encontrado`);
    return id;
  }

  const name = cleanText(payload.name);
  const categoryId = cleanNumber(payload.category_id, NaN);
  const price = cleanNumber(payload.price, NaN);
  const vatRate = cleanNumber(payload.vat_rate, 10);
  const imageUrl = payload.image_url ? String(payload.image_url) : null;
  const active = payload.active == null ? true : Boolean(payload.active);
  const sortOrder = cleanNumber(payload.sort_order, 0);

  if (!name) throw new Error("Producto sin nombre");
  if (!Number.isInteger(categoryId) || categoryId <= 0) throw new Error("Producto sin categoria valida");
  if (!Number.isFinite(price) || price < 0) throw new Error("Producto sin precio valido");

  const category = await local.query(`SELECT id FROM pos.categories WHERE id = $1`, [categoryId]);
  if (!category.rowCount) throw new Error(`Categoria ${categoryId} no existe en el POS`);

  if (change.action === "create") {
    const id = await nextLocalId(local, "products");
    await local.query(
      `INSERT INTO pos.products (id, name, category_id, price, vat_rate, image_url, active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, name, categoryId, price, vatRate, imageUrl, active, sortOrder],
    );
    return id;
  }

  if (change.action === "update") {
    const id = Number(change.entity_id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Producto sin id");
    const result = await local.query(
      `UPDATE pos.products
       SET name = $1, category_id = $2, price = $3, vat_rate = $4, image_url = $5, active = $6, sort_order = $7
       WHERE id = $8
       RETURNING id`,
      [name, categoryId, price, vatRate, imageUrl, active, sortOrder, id],
    );
    if (!result.rowCount) throw new Error(`Producto ${id} no encontrado`);
    return id;
  }

  throw new Error(`Accion de producto no soportada: ${change.action}`);
}

async function applyCatalogChange(local, change) {
  if (change.entity_type === "category") return applyCategoryChange(local, change);
  if (change.entity_type === "product") return applyProductChange(local, change);
  throw new Error(`Entidad no soportada: ${change.entity_type}`);
}

async function markCatalogChangeApplied(cloud, changeId, appliedEntityId) {
  await cloud.query(
    `UPDATE pos.catalog_change_queue
     SET status = 'applied', applied_at = NOW(), applied_entity_id = $2, error_message = NULL
     WHERE id = $1`,
    [changeId, appliedEntityId],
  );
}

async function markCatalogChangeError(cloud, changeId, error) {
  await cloud.query(
    `UPDATE pos.catalog_change_queue
     SET status = 'error', error_message = $2
     WHERE id = $1`,
    [changeId, String(error?.message || error).slice(0, 500)],
  );
}

async function applyPendingCatalogChanges(local, cloud) {
  const pending = await cloud.query(
    `SELECT id, entity_type, action, entity_id, payload
     FROM pos.catalog_change_queue
     WHERE status = 'pending'
     ORDER BY requested_at ASC
     LIMIT 50`,
  );

  if (!pending.rows.length) return 0;

  let applied = 0;
  for (const change of pending.rows) {
    try {
      await local.query("BEGIN");
      const appliedEntityId = await applyCatalogChange(local, change);
      await local.query("COMMIT");
      await markCatalogChangeApplied(cloud, change.id, appliedEntityId);
      applied += 1;
      log(`catalog_change ${change.id}: aplicado (${change.entity_type} ${appliedEntityId})`);
    } catch (error) {
      try {
        await local.query("ROLLBACK");
      } catch {
        // Ignore rollback failures.
      }
      await markCatalogChangeError(cloud, change.id, error);
      log(`catalog_change ${change.id}: error ${String(error?.message || error)}`);
    }
  }

  log(`catalog_change_queue: ${applied}/${pending.rows.length} cambios aplicados`);
  return applied;
}

async function tableExists(local, tableName) {
  const result = await local.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'pos' AND table_name = $1
     ) AS exists`,
    [tableName],
  );
  return Boolean(result.rows[0]?.exists);
}

async function fetchRows(local, table) {
  const query = `
    SELECT ${columnList(table.columns)}
    FROM pos.${quoteIdent(table.name)}
    ORDER BY ${quoteIdent(table.orderBy)}
  `;
  const result = await local.query(query);
  return result.rows;
}

async function upsertBatch(cloud, table, rows) {
  if (!rows.length) return 0;

  const columns = table.columns;
  const values = [];
  const rowPlaceholders = rows.map((row, rowIndex) => {
    const offset = rowIndex * columns.length;
    for (const column of columns) values.push(row[column]);
    return `(${placeholders(columns, offset)})`;
  });

  const updates = updateAssignments(columns);
  const sql = `
    INSERT INTO pos.${quoteIdent(table.name)} (${columnList(columns)})
    VALUES ${rowPlaceholders.join(", ")}
    ON CONFLICT (id) DO UPDATE SET ${updates}
  `;
  await cloud.query(sql, values);
  return rows.length;
}

async function syncTable(local, cloud, table) {
  if (table.optional && !(await tableExists(local, table.name))) {
    log(`${table.name}: tabla opcional no existe, saltada`);
    return 0;
  }

  const rows = await fetchRows(local, table);
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    await upsertBatch(cloud, table, rows.slice(index, index + BATCH_SIZE));
  }
  log(`${table.name}: ${rows.length} filas sincronizadas`);
  return rows.length;
}

async function runSync() {
  if (!DASHBOARD_DB_URL) {
    log("DASHBOARD_DATABASE_URL no configurada - sync desactivado");
    return { ok: false, reason: "missing-dashboard-database-url" };
  }

  let local;
  let cloud;
  const counts = {};

  try {
    local = await connect(LOCAL_DB_URL, "local POS");
    cloud = await connectDashboard(DASHBOARD_DB_URL);

    await ensureCloudSchema(cloud);
    await applyPendingCatalogChanges(local, cloud);

    if (cloud.supportsTransactions) await cloud.query("BEGIN");
    for (const table of TABLES) {
      counts[table.name] = await syncTable(local, cloud, table);
    }
    if (cloud.supportsTransactions) await cloud.query("COMMIT");

    log("Sync completado");
    return { ok: true, counts };
  } catch (error) {
    if (cloud?.supportsTransactions) {
      try {
        await cloud.query("ROLLBACK");
      } catch {
        // Ignore rollback failures.
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOTFOUND") || message.includes("ETIMEDOUT") || message.includes("ECONNREFUSED")) {
      log("Sin conexion cloud - se reintentara en la siguiente ejecucion");
    } else {
      log(`Error: ${message}`);
    }
    return { ok: false, error: message };
  } finally {
    if (cloud) await cloud.end();
    if (local) await local.end();
  }
}

module.exports = { runSync };

if (require.main === module) {
  runSync().then((result) => {
    process.exit(result.ok ? 0 : 1);
  });
}
