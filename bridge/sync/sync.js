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
  log(`${label} conectado`);
  return client;
}

async function ensureCloudSchema(cloud) {
  const schemaSql = fs.readFileSync(SCHEMA_PATH, "utf8");
  await cloud.query(schemaSql);
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
    cloud = await connect(DASHBOARD_DB_URL, "cloud dashboard");

    await ensureCloudSchema(cloud);

    await cloud.query("BEGIN");
    for (const table of TABLES) {
      counts[table.name] = await syncTable(local, cloud, table);
    }
    await cloud.query("COMMIT");

    log("Sync completado");
    return { ok: true, counts };
  } catch (error) {
    if (cloud) {
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
