/**
 * Hi Cream POS - reporting sync
 *
 * Copies the local POS database into a cloud Postgres database used by the
 * Vercel dashboard. The local POS remains the source of truth. The only
 * cloud-to-local writes are approved catalog changes, schedule cache data,
 * and approved time-clock corrections.
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
      "cookies_invoice_series",
      "next_cookies_invoice_number",
      "rectifying_invoice_series",
      "next_rectifying_invoice_number",
      "next_z_number",
    ],
    orderBy: "id",
  },
  {
    name: "employees",
    columns: [
      "id",
      "name",
      "pin",
      "role",
      "active",
      "can_access_cashlogy",
      "can_access_supplier_payments",
      "can_access_products",
      "can_post_sale_lookup",
      "can_refund_sales",
    ],
    orderBy: "id",
  },
  {
    name: "products",
    columns: ["id", "name", "category_id", "price", "vat_rate", "image_url", "active", "sort_order"],
    orderBy: "id",
  },
  {
    name: "modifier_groups",
    columns: ["id", "name", "description", "sort_order", "active"],
    orderBy: "id",
    optional: true,
  },
  {
    name: "modifier_group_categories",
    columns: ["group_id", "category_id", "sort_order"],
    orderBy: "group_id",
    keyColumns: ["group_id", "category_id"],
    optional: true,
  },
  {
    name: "product_modifier_groups",
    columns: ["product_id", "group_id", "included_count", "extra_price"],
    orderBy: "product_id",
    keyColumns: ["product_id"],
    optional: true,
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
      "business_unit",
      "service_type",
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
      "cashless_peripheral_id",
      "cashless_operation_id",
      "cashless_transaction_number",
      "cashless_amount",
      "card_payment_status",
      "payment_attempt_id",
      "card_payment_error",
      "refund_reference",
      "refund_at",
      "synced",
    ],
    orderBy: "id",
    where: "payment_method <> 'parked' AND (payment_method <> 'card' OR invoice_number IS NOT NULL)",
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
    where: `EXISTS (
      SELECT 1
      FROM pos.orders o
      WHERE o.id = pos.order_items.order_id
        AND o.payment_method <> 'parked'
        AND (o.payment_method <> 'card' OR o.invoice_number IS NOT NULL)
    )`,
  },
  {
    name: "kds_events",
    columns: ["id", "order_id", "event_type", "timestamp"],
    orderBy: "id",
    where: `EXISTS (
      SELECT 1
      FROM pos.orders o
      WHERE o.id = pos.kds_events.order_id
        AND o.payment_method <> 'parked'
        AND (o.payment_method <> 'card' OR o.invoice_number IS NOT NULL)
    )`,
  },
  {
    name: "refunds",
    columns: [
      "id",
      "order_id",
      "client_request_id",
      "rectifying_invoice_number",
      "status",
      "amount",
      "total_base",
      "total_vat",
      "reason",
      "employee_id",
      "original_transaction_number",
      "provider_transaction_id",
      "provider_reference",
      "provider_authorization",
      "provider_response_code",
      "receipt_text",
      "error_message",
      "requested_at",
      "completed_at",
      "updated_at",
      "synced",
    ],
    orderBy: "id",
    optional: true,
  },
  {
    name: "refund_items",
    columns: [
      "id",
      "refund_id",
      "order_item_id",
      "product_id",
      "product_name",
      "qty",
      "unit_price",
      "vat_rate",
      "notes",
    ],
    orderBy: "id",
    optional: true,
  },
  {
    name: "post_sale_audit",
    columns: [
      "id",
      "order_id",
      "refund_id",
      "employee_id",
      "action",
      "details",
      "created_at",
      "synced",
    ],
    jsonColumns: ["details"],
    orderBy: "id",
    optional: true,
    where: `order_id IS NULL OR EXISTS (
      SELECT 1
      FROM pos.orders o
      WHERE o.id = pos.post_sale_audit.order_id
        AND o.payment_method <> 'parked'
        AND (o.payment_method <> 'card' OR o.invoice_number IS NOT NULL)
    )`,
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
      "supplier_payments_total",
      "supplier_payments_count",
      "expected_cash_after_supplier_payments",
      "supplier_payments_snapshot",
    ],
    jsonColumns: ["vat_breakdown", "business_snapshot", "supplier_payments_snapshot"],
    orderBy: "id",
  },
  {
    name: "supplier_payments",
    columns: [
      "id",
      "supplier_name",
      "amount",
      "reason",
      "employee_id",
      "status",
      "cashlogy_result",
      "error_message",
      "created_at",
      "dispensed_at",
      "synced",
    ],
    jsonColumns: ["cashlogy_result"],
    orderBy: "id",
    optional: true,
  },
  {
    name: "cashlogy_state_snapshots",
    columns: [
      "id",
      "captured_at",
      "ok",
      "online",
      "total_amount",
      "total",
      "status",
      "peripherals",
      "model",
      "accounting",
      "errors",
      "denominations",
      "error_message",
      "synced",
    ],
    jsonColumns: ["status", "peripherals", "model", "accounting", "errors", "denominations"],
    orderBy: "captured_at",
    optional: true,
    keyColumns: ["id"],
  },
  {
    name: "time_clock_sessions",
    columns: [
      "id",
      "employee_id",
      "business_date",
      "clock_in_at",
      "clock_out_at",
      "status",
      "source",
      "device_name",
      "created_at",
      "updated_at",
      "synced",
    ],
    orderBy: "id",
    optional: true,
  },
  {
    name: "time_clock_audit",
    columns: [
      "id",
      "session_id",
      "employee_id",
      "action",
      "previous_data",
      "new_data",
      "reason",
      "changed_by",
      "created_at",
      "synced",
    ],
    jsonColumns: ["previous_data", "new_data"],
    orderBy: "id",
    optional: true,
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
    jsonColumns: ["request", "response"],
    orderBy: "id",
    optional: true,
    where: `order_id IS NULL OR EXISTS (
      SELECT 1
      FROM pos.orders o
      WHERE o.id = pos.card_transactions.order_id
        AND o.payment_method <> 'parked'
        AND (o.payment_method <> 'card' OR o.invoice_number IS NOT NULL)
    )`,
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

function updateAssignments(columns, keyColumns = ["id"]) {
  const keys = new Set(Array.isArray(keyColumns) ? keyColumns : [keyColumns]);
  return columns
    .filter((column) => !keys.has(column))
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

async function ensureEmployeeAccessSchema(db) {
  await db.query(`
    ALTER TABLE pos.employees
    ADD COLUMN IF NOT EXISTS can_access_cashlogy BOOLEAN NOT NULL DEFAULT true
  `);
  await db.query(`
    ALTER TABLE pos.employees
    ADD COLUMN IF NOT EXISTS can_access_supplier_payments BOOLEAN NOT NULL DEFAULT true
  `);
  await db.query(`
    ALTER TABLE pos.employees
    ADD COLUMN IF NOT EXISTS can_access_products BOOLEAN NOT NULL DEFAULT false
  `);
  await db.query(`
    ALTER TABLE pos.employees
    ADD COLUMN IF NOT EXISTS can_post_sale_lookup BOOLEAN NOT NULL DEFAULT true
  `);
  await db.query(`
    ALTER TABLE pos.employees
    ADD COLUMN IF NOT EXISTS can_refund_sales BOOLEAN NOT NULL DEFAULT false
  `);
  await db.query(`
    UPDATE pos.employees
    SET can_access_products = true,
        can_access_cashlogy = true,
        can_access_supplier_payments = true,
        can_post_sale_lookup = true,
        can_refund_sales = true
    WHERE role = 'admin'
  `);
}

async function ensureOrderBusinessUnitSchema(db) {
  await db.query(`
    ALTER TABLE pos.orders
    ADD COLUMN IF NOT EXISTS business_unit VARCHAR(20) NOT NULL DEFAULT 'hicream'
  `);
  await db.query(`
    ALTER TABLE pos.orders
    ADD COLUMN IF NOT EXISTS service_type VARCHAR(20) NOT NULL DEFAULT 'dine_in'
  `);
  await db.query(`ALTER TABLE pos.orders DROP CONSTRAINT IF EXISTS orders_service_type_check`);
  await db.query(`
    ALTER TABLE pos.orders
    ADD CONSTRAINT orders_service_type_check
    CHECK (service_type IN ('dine_in', 'takeaway'))
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_orders_business_unit
    ON pos.orders(business_unit)
  `);
  await db.query(`
    ALTER TABLE pos.business
    ADD COLUMN IF NOT EXISTS cookies_invoice_series VARCHAR(10) NOT NULL DEFAULT 'C'
  `);
  await db.query(`
    ALTER TABLE pos.business
    ADD COLUMN IF NOT EXISTS next_cookies_invoice_number INTEGER NOT NULL DEFAULT 1
  `);
  await db.query(`
    ALTER TABLE pos.business
    ADD COLUMN IF NOT EXISTS rectifying_invoice_series VARCHAR(10) NOT NULL DEFAULT 'R'
  `);
  await db.query(`
    ALTER TABLE pos.business
    ADD COLUMN IF NOT EXISTS next_rectifying_invoice_number INTEGER NOT NULL DEFAULT 1
  `);
  await db.query(`ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS cashless_peripheral_id VARCHAR(120)`);
  await db.query(`ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS cashless_operation_id VARCHAR(120)`);
  await db.query(`ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS cashless_transaction_number VARCHAR(120)`);
  await db.query(`ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS cashless_amount NUMERIC(10,2)`);
  await db.query(`ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS card_payment_status VARCHAR(24) NOT NULL DEFAULT 'not_applicable'`);
  await db.query(`ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS payment_attempt_id UUID`);
  await db.query(`ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS card_payment_error TEXT`);
}

async function ensureLocalModifierSchema(local) {
  await local.query(`
    CREATE TABLE IF NOT EXISTS pos.modifier_groups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true
    )
  `);
  await local.query(`
    CREATE TABLE IF NOT EXISTS pos.modifier_group_categories (
      group_id INTEGER NOT NULL REFERENCES pos.modifier_groups(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES pos.categories(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (group_id, category_id)
    )
  `);
  await local.query(`
    CREATE TABLE IF NOT EXISTS pos.product_modifier_groups (
      product_id INTEGER PRIMARY KEY REFERENCES pos.products(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES pos.modifier_groups(id) ON DELETE SET NULL,
      included_count INTEGER NOT NULL DEFAULT 0,
      extra_price NUMERIC(8,2) NOT NULL DEFAULT 0
    )
  `);
  await local.query(`
    ALTER TABLE pos.product_modifier_groups
    ADD COLUMN IF NOT EXISTS included_count INTEGER NOT NULL DEFAULT 0
  `);
  await local.query(`
    ALTER TABLE pos.product_modifier_groups
    ADD COLUMN IF NOT EXISTS extra_price NUMERIC(8,2) NOT NULL DEFAULT 0
  `);
  await local.query(`
    CREATE INDEX IF NOT EXISTS idx_product_modifier_groups_group
    ON pos.product_modifier_groups(group_id)
  `);
}

async function ensureLocalSupplierPaymentSchema(local) {
  await local.query(`
    CREATE TABLE IF NOT EXISTS pos.supplier_payments (
      id SERIAL PRIMARY KEY,
      supplier_name VARCHAR(160) NOT NULL,
      amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
      reason TEXT,
      employee_id INTEGER REFERENCES pos.employees(id),
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'dispensed', 'error', 'cancelled')),
      cashlogy_result JSONB,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      dispensed_at TIMESTAMPTZ,
      synced BOOLEAN NOT NULL DEFAULT false
    )
  `);
  await local.query(`
    CREATE INDEX IF NOT EXISTS idx_supplier_payments_created
    ON pos.supplier_payments(created_at DESC)
  `);
  await local.query(`
    CREATE INDEX IF NOT EXISTS idx_supplier_payments_status
    ON pos.supplier_payments(status, created_at DESC)
  `);
  await local.query(`
    ALTER TABLE pos.cash_closings
    ADD COLUMN IF NOT EXISTS supplier_payments_total NUMERIC(10,2) NOT NULL DEFAULT 0
  `);
  await local.query(`
    ALTER TABLE pos.cash_closings
    ADD COLUMN IF NOT EXISTS supplier_payments_count INTEGER NOT NULL DEFAULT 0
  `);
  await local.query(`
    ALTER TABLE pos.cash_closings
    ADD COLUMN IF NOT EXISTS expected_cash_after_supplier_payments NUMERIC(10,2) NOT NULL DEFAULT 0
  `);
  await local.query(`
    ALTER TABLE pos.cash_closings
    ADD COLUMN IF NOT EXISTS supplier_payments_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
}

async function ensureLocalCashlogyStateSnapshotSchema(local) {
  await local.query(`
    CREATE TABLE IF NOT EXISTS pos.cashlogy_state_snapshots (
      id TEXT PRIMARY KEY,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ok BOOLEAN NOT NULL DEFAULT false,
      online BOOLEAN NOT NULL DEFAULT false,
      total_amount INTEGER NOT NULL DEFAULT 0,
      total NUMERIC(10,2) NOT NULL DEFAULT 0,
      status JSONB NOT NULL DEFAULT '{}'::jsonb,
      peripherals JSONB NOT NULL DEFAULT '{}'::jsonb,
      model JSONB NOT NULL DEFAULT '{}'::jsonb,
      accounting JSONB NOT NULL DEFAULT '{}'::jsonb,
      errors JSONB NOT NULL DEFAULT '{}'::jsonb,
      denominations JSONB NOT NULL DEFAULT '[]'::jsonb,
      error_message TEXT,
      synced BOOLEAN NOT NULL DEFAULT false
    )
  `);
  await local.query(`
    CREATE INDEX IF NOT EXISTS idx_cashlogy_state_snapshots_captured
    ON pos.cashlogy_state_snapshots(captured_at DESC)
  `);
  await local.query(`
    CREATE INDEX IF NOT EXISTS idx_cashlogy_state_snapshots_synced
    ON pos.cashlogy_state_snapshots(synced)
  `);
}

async function ensureLocalTimeClockSchema(local) {
  await local.query(`
    CREATE TABLE IF NOT EXISTS pos.time_clock_sessions (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES pos.employees(id),
      business_date DATE NOT NULL,
      clock_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      clock_out_at TIMESTAMPTZ,
      status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      source VARCHAR(40) NOT NULL DEFAULT 'pos',
      device_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      synced BOOLEAN NOT NULL DEFAULT false,
      CHECK (clock_out_at IS NULL OR clock_out_at >= clock_in_at)
    )
  `);
  await local.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_time_clock_one_open_per_employee
    ON pos.time_clock_sessions(employee_id)
    WHERE status = 'open'
  `);
  await local.query(`
    CREATE INDEX IF NOT EXISTS idx_time_clock_sessions_business_date
    ON pos.time_clock_sessions(business_date DESC)
  `);
  await local.query(`
    CREATE INDEX IF NOT EXISTS idx_time_clock_sessions_employee
    ON pos.time_clock_sessions(employee_id, business_date DESC)
  `);
  await local.query(`
    CREATE INDEX IF NOT EXISTS idx_time_clock_sessions_synced
    ON pos.time_clock_sessions(synced)
  `);
  await local.query(`
    CREATE TABLE IF NOT EXISTS pos.time_clock_audit (
      id SERIAL PRIMARY KEY,
      session_id INTEGER REFERENCES pos.time_clock_sessions(id) ON DELETE SET NULL,
      employee_id INTEGER REFERENCES pos.employees(id),
      action VARCHAR(40) NOT NULL,
      previous_data JSONB,
      new_data JSONB,
      reason TEXT,
      changed_by INTEGER REFERENCES pos.employees(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      synced BOOLEAN NOT NULL DEFAULT false
    )
  `);
  await local.query(`
    CREATE INDEX IF NOT EXISTS idx_time_clock_audit_session
    ON pos.time_clock_audit(session_id, created_at DESC)
  `);
  await local.query(`
    CREATE INDEX IF NOT EXISTS idx_time_clock_audit_synced
    ON pos.time_clock_audit(synced)
  `);
  await local.query(`
    CREATE TABLE IF NOT EXISTS pos.employee_operational_schedule_cache (
      id TEXT PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES pos.employees(id) ON DELETE CASCADE,
      business_date DATE NOT NULL,
      shift_start VARCHAR(5) NOT NULL,
      shift_end VARCHAR(5) NOT NULL,
      share_token TEXT,
      cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await local.query(`
    CREATE INDEX IF NOT EXISTS idx_employee_operational_schedule_cache_lookup
    ON pos.employee_operational_schedule_cache(employee_id, business_date, shift_start)
  `);
  await local.query(`
    CREATE TABLE IF NOT EXISTS pos.time_clock_correction_applied (
      request_id TEXT PRIMARY KEY,
      session_id INTEGER REFERENCES pos.time_clock_sessions(id) ON DELETE SET NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function closeExpiredTimeClockSessions(local) {
  const result = await local.query(`
    WITH expired AS (
      SELECT s.id,
             s.employee_id,
             to_jsonb(s) AS previous_data,
             ((s.clock_in_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '2 hours')::date
               AS corrected_business_date,
             (
               (
                 ((s.clock_in_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '2 hours')::date
                 + 1
                 + TIME '02:00'
               ) AT TIME ZONE 'Europe/Madrid'
             ) AS cutoff_at
      FROM pos.time_clock_sessions s
      WHERE s.status = 'open'
    ),
    updated AS (
      UPDATE pos.time_clock_sessions s
      SET business_date = e.corrected_business_date,
          clock_out_at = e.cutoff_at,
          status = 'closed',
          source = 'auto_cutoff_pending',
          updated_at = NOW(),
          synced = FALSE
      FROM expired e
      WHERE s.id = e.id
        AND s.status = 'open'
        AND NOW() >= e.cutoff_at
      RETURNING s.id AS session_id, s.employee_id, to_jsonb(s) AS new_data
    )
    INSERT INTO pos.time_clock_audit (
      session_id, employee_id, action, previous_data, new_data, reason, synced
    )
    SELECT u.session_id,
           u.employee_id,
           'auto_cutoff_pending',
           e.previous_data,
           u.new_data,
           'Tancament provisional automatic al tall laboral de les 02:00. Sortida pendent de revisio.',
           FALSE
    FROM updated u
    JOIN expired e ON e.id = u.session_id
    RETURNING session_id
  `);
  if (result.rowCount) {
    log(`time_clock_auto_cutoff: ${result.rowCount} jornades pendents de revisio`);
  }
  return result.rowCount || 0;
}

async function refreshOperationalScheduleCache(local, cloud) {
  const result = await cloud.query(
    `SELECT s.id, s.employee_id, s.business_date, s.shift_start, s.shift_end, l.token AS share_token
     FROM employee_schedule_shifts s
     LEFT JOIN employee_schedule_links l ON l.employee_id = s.employee_id
     WHERE s.schedule_kind = 'contractual'
       AND s.business_date BETWEEN
         ((NOW() AT TIME ZONE 'Europe/Madrid')::date - INTERVAL '2 days')::date
         AND ((NOW() AT TIME ZONE 'Europe/Madrid')::date + INTERVAL '21 days')::date
     ORDER BY s.business_date, s.shift_start`,
  );

  await local.query("BEGIN");
  try {
    await local.query(
      `DELETE FROM pos.employee_operational_schedule_cache
       WHERE business_date BETWEEN
         ((NOW() AT TIME ZONE 'Europe/Madrid')::date - INTERVAL '2 days')::date
         AND ((NOW() AT TIME ZONE 'Europe/Madrid')::date + INTERVAL '21 days')::date`,
    );
    let saved = 0;
    for (const row of result.rows) {
      const employeeId = Number(row.employee_id);
      if (!Number.isInteger(employeeId) || employeeId <= 0) continue;
      const employee = await local.query(
        `SELECT id FROM pos.employees WHERE id = $1 AND active = TRUE LIMIT 1`,
        [employeeId],
      );
      if (!employee.rowCount) continue;
      await local.query(
        `INSERT INTO pos.employee_operational_schedule_cache (
           id, employee_id, business_date, shift_start, shift_end, share_token, cached_at
         )
         VALUES ($1, $2, $3::date, $4, $5, $6, NOW())
         ON CONFLICT (id) DO UPDATE SET
           employee_id = EXCLUDED.employee_id,
           business_date = EXCLUDED.business_date,
           shift_start = EXCLUDED.shift_start,
           shift_end = EXCLUDED.shift_end,
           share_token = EXCLUDED.share_token,
           cached_at = NOW()`,
        [
          String(row.id),
          employeeId,
          row.business_date,
          String(row.shift_start),
          String(row.shift_end),
          row.share_token == null ? null : String(row.share_token),
        ],
      );
      saved += 1;
    }
    await local.query("COMMIT");
    log(`employee_operational_schedule_cache: ${saved} turnos`);
    return saved;
  } catch (error) {
    await local.query("ROLLBACK");
    throw error;
  }
}

async function applyTimeClockCorrection(local, request) {
  const alreadyApplied = await local.query(
    `SELECT session_id FROM pos.time_clock_correction_applied WHERE request_id = $1 LIMIT 1`,
    [request.id],
  );
  if (alreadyApplied.rows[0]) return alreadyApplied.rows[0].session_id;

  const employeeId = Number(request.employee_id);
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    throw new Error("Empleado no valido");
  }
  const employee = await local.query(
    `SELECT id FROM pos.employees WHERE id = $1 AND active = TRUE LIMIT 1`,
    [employeeId],
  );
  if (!employee.rowCount) throw new Error(`Empleado ${employeeId} no encontrado en el POS`);

  let session;
  let previousData = null;
  if (request.request_type === "clock_in") {
    const open = await local.query(
      `SELECT * FROM pos.time_clock_sessions WHERE employee_id = $1 AND status = 'open' LIMIT 1`,
      [employeeId],
    );
    if (open.rowCount) throw new Error("El empleado ya tiene una jornada abierta");
    session = await local.query(
      `INSERT INTO pos.time_clock_sessions (
         employee_id, business_date, clock_in_at, status, source, device_name, synced
       )
       VALUES ($1, $2::date, $3, 'open', 'employee_correction', 'horari-link', FALSE)
       RETURNING *`,
      [employeeId, request.business_date, request.requested_clock_in_at],
    );
  } else if (request.request_type === "clock_out") {
    const open = request.schedule_starts_at
      ? await local.query(
        `SELECT * FROM pos.time_clock_sessions
         WHERE employee_id = $1
           AND business_date = $2::date
           AND (status = 'open' OR source = 'auto_cutoff_pending')
         ORDER BY ABS(EXTRACT(EPOCH FROM (clock_in_at - $3::timestamptz))) ASC
         LIMIT 1`,
        [employeeId, request.business_date, request.schedule_starts_at],
      )
      : await local.query(
        `SELECT * FROM pos.time_clock_sessions
         WHERE employee_id = $1
           AND business_date = $2::date
           AND (status = 'open' OR source = 'auto_cutoff_pending')
         ORDER BY clock_in_at DESC
         LIMIT 1`,
        [employeeId, request.business_date],
      );
    if (!open.rowCount) throw new Error("No hay una jornada abierta o pendiente para aplicar la salida");
    previousData = open.rows[0];
    const clockInAt = new Date(previousData.clock_in_at);
    let requestedClockOutAt = new Date(request.requested_clock_out_at);
    if (requestedClockOutAt.getTime() < clockInAt.getTime()) {
      const nextDayClockOutAt = new Date(requestedClockOutAt.getTime() + 24 * 60 * 60 * 1000);
      const maximumReasonableShiftEnd = clockInAt.getTime() + 36 * 60 * 60 * 1000;
      if (
        nextDayClockOutAt.getTime() >= clockInAt.getTime()
        && nextDayClockOutAt.getTime() <= maximumReasonableShiftEnd
      ) {
        requestedClockOutAt = nextDayClockOutAt;
      }
    }
    if (requestedClockOutAt.getTime() < clockInAt.getTime()) {
      throw new Error("La salida solicitada es anterior a la entrada");
    }
    session = await local.query(
      `UPDATE pos.time_clock_sessions
       SET clock_out_at = $2,
           status = 'closed',
           source = 'employee_correction',
           updated_at = NOW(),
           synced = FALSE
       WHERE id = $1
       RETURNING *`,
      [previousData.id, requestedClockOutAt],
    );
  } else if (request.request_type === "full_session") {
    const existing = await local.query(
      `SELECT id FROM pos.time_clock_sessions
       WHERE employee_id = $1
         AND clock_in_at < $3::timestamptz
         AND COALESCE(clock_out_at, 'infinity'::timestamptz) > $2::timestamptz
       LIMIT 1`,
      [
        employeeId,
        request.requested_clock_in_at,
        request.requested_clock_out_at,
      ],
    );
    if (existing.rowCount) throw new Error("Ya existe un fichaje que se solapa con ese turno");
    session = await local.query(
      `INSERT INTO pos.time_clock_sessions (
         employee_id, business_date, clock_in_at, clock_out_at,
         status, source, device_name, synced
       )
       VALUES ($1, $2::date, $3, $4, 'closed', 'employee_correction', 'horari-link', FALSE)
       RETURNING *`,
      [
        employeeId,
        request.business_date,
        request.requested_clock_in_at,
        request.requested_clock_out_at,
      ],
    );
  } else {
    throw new Error(`Tipo de correccion no soportado: ${request.request_type}`);
  }

  const saved = session.rows[0];
  await local.query(
    `INSERT INTO pos.time_clock_audit (
       session_id, employee_id, action, previous_data, new_data, reason, synced
     )
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, FALSE)`,
    [
      saved.id,
      employeeId,
      `approved_${request.request_type}`,
      previousData ? JSON.stringify(previousData) : null,
      JSON.stringify(saved),
      `Solicitud ${request.id}: ${request.reason}`,
    ],
  );
  await local.query(
    `INSERT INTO pos.time_clock_correction_applied (request_id, session_id)
     VALUES ($1, $2)
     ON CONFLICT (request_id) DO NOTHING`,
    [request.id, saved.id],
  );
  return saved.id;
}

async function applyApprovedTimeClockCorrections(local, cloud) {
  const pending = await cloud.query(
    `SELECT r.*,
            CASE
              WHEN s.id IS NULL THEN NULL
              ELSE (s.business_date + s.shift_start::time) AT TIME ZONE 'Europe/Madrid'
            END AS schedule_starts_at
     FROM time_clock_correction_requests r
     LEFT JOIN employee_schedule_shifts s ON s.id = r.schedule_shift_id
     WHERE r.status = 'approved' AND r.applied_at IS NULL
     ORDER BY r.reviewed_at ASC, r.created_at ASC
     LIMIT 50`,
  );
  let applied = 0;
  for (const request of pending.rows) {
    try {
      await local.query("BEGIN");
      const sessionId = await applyTimeClockCorrection(local, request);
      await local.query("COMMIT");
      await cloud.query(
        `UPDATE time_clock_correction_requests
         SET status = 'applied', applied_at = NOW(), apply_error = NULL, updated_at = NOW()
         WHERE id = $1`,
        [request.id],
      );
      applied += 1;
      log(`time_clock_correction ${request.id}: aplicada en sesion ${sessionId}`);
    } catch (error) {
      try {
        await local.query("ROLLBACK");
      } catch {
        // Ignore rollback failures.
      }
      const message = String(error?.message || error).slice(0, 500);
      await cloud.query(
        `UPDATE time_clock_correction_requests
         SET status = 'failed', apply_error = $2, updated_at = NOW()
         WHERE id = $1`,
        [request.id, message],
      );
      log(`time_clock_correction ${request.id}: error ${message}`);
    }
  }
  if (pending.rows.length) {
    log(`time_clock_corrections: ${applied}/${pending.rows.length} aplicadas`);
  }
  return applied;
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

function cleanInteger(value, fallback = 0) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function cleanMoney(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : fallback;
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
  const modifierGroupId = cleanNumber(payload.modifier_group_id, NaN);
  const modifierIncludedCount = cleanInteger(payload.modifier_included_count, 0);
  const modifierExtraPrice = cleanMoney(payload.modifier_extra_price, 0);
  const active = payload.active == null ? true : Boolean(payload.active);
  const sortOrder = cleanNumber(payload.sort_order, 0);

  if (!name) throw new Error("Producto sin nombre");
  if (!Number.isInteger(categoryId) || categoryId <= 0) throw new Error("Producto sin categoria valida");
  if (!Number.isFinite(price) || price < 0) throw new Error("Producto sin precio valido");

  const category = await local.query(`SELECT id FROM pos.categories WHERE id = $1`, [categoryId]);
  if (!category.rowCount) throw new Error(`Categoria ${categoryId} no existe en el POS`);
  if (Number.isInteger(modifierGroupId) && modifierGroupId > 0) {
    const group = await local.query(`SELECT id FROM pos.modifier_groups WHERE id = $1 AND active = TRUE`, [modifierGroupId]);
    if (!group.rowCount) throw new Error(`Pagina de toppings ${modifierGroupId} no existe en el POS`);
  }

  if (change.action === "create") {
    const id = await nextLocalId(local, "products");
    await local.query(
      `INSERT INTO pos.products (id, name, category_id, price, vat_rate, image_url, active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, name, categoryId, price, vatRate, imageUrl, active, sortOrder],
    );
    await setProductModifierGroup(local, id, modifierGroupId, modifierIncludedCount, modifierExtraPrice);
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
    await setProductModifierGroup(local, id, modifierGroupId, modifierIncludedCount, modifierExtraPrice);
    return id;
  }

  throw new Error(`Accion de producto no soportada: ${change.action}`);
}

async function replaceModifierGroupCategories(local, groupId, categoryIds) {
  await local.query(`DELETE FROM pos.modifier_group_categories WHERE group_id = $1`, [groupId]);
  const uniqueIds = Array.from(
    new Set((Array.isArray(categoryIds) ? categoryIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0)),
  );
  for (let index = 0; index < uniqueIds.length; index += 1) {
    const categoryId = uniqueIds[index];
    const category = await local.query(`SELECT id FROM pos.categories WHERE id = $1`, [categoryId]);
    if (!category.rowCount) throw new Error(`Categoria ${categoryId} no existe en el POS`);
    await local.query(
      `INSERT INTO pos.modifier_group_categories (group_id, category_id, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (group_id, category_id) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
      [groupId, categoryId, index],
    );
  }
}

async function setProductModifierGroup(local, productId, groupId, includedCount = 0, extraPrice = 0) {
  if (!Number.isInteger(groupId) || groupId <= 0) {
    await local.query(`DELETE FROM pos.product_modifier_groups WHERE product_id = $1`, [productId]);
    return;
  }
  await local.query(
    `INSERT INTO pos.product_modifier_groups (product_id, group_id, included_count, extra_price)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (product_id) DO UPDATE SET
       group_id = EXCLUDED.group_id,
       included_count = EXCLUDED.included_count,
       extra_price = EXCLUDED.extra_price`,
    [productId, groupId, cleanInteger(includedCount, 0), cleanMoney(extraPrice, 0)],
  );
}

async function applyModifierGroupChange(local, change) {
  const payload = asPayload(change.payload);

  if (change.action === "deactivate") {
    const id = Number(change.entity_id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Pagina de toppings sin id");
    const result = await local.query(`UPDATE pos.modifier_groups SET active = FALSE WHERE id = $1 RETURNING id`, [id]);
    if (!result.rowCount) throw new Error(`Pagina de toppings ${id} no encontrada`);
    return id;
  }

  const name = cleanText(payload.name);
  const description = payload.description ? String(payload.description) : null;
  const sortOrder = cleanNumber(payload.sort_order, 0);
  const active = payload.active == null ? true : Boolean(payload.active);

  if (!name) throw new Error("Pagina de toppings sin nombre");

  if (change.action === "create") {
    const id = await nextLocalId(local, "modifier_groups");
    await local.query(
      `INSERT INTO pos.modifier_groups (id, name, description, sort_order, active)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, name, description, sortOrder, active],
    );
    await replaceModifierGroupCategories(local, id, payload.category_ids);
    return id;
  }

  if (change.action === "update") {
    const id = Number(change.entity_id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Pagina de toppings sin id");
    const result = await local.query(
      `UPDATE pos.modifier_groups
       SET name = $1, description = $2, sort_order = $3, active = $4
       WHERE id = $5
       RETURNING id`,
      [name, description, sortOrder, active, id],
    );
    if (!result.rowCount) throw new Error(`Pagina de toppings ${id} no encontrada`);
    await replaceModifierGroupCategories(local, id, payload.category_ids);
    return id;
  }

  throw new Error(`Accion de pagina de toppings no soportada: ${change.action}`);
}

function cleanEmployeePin(value, required = false) {
  if (value == null || value === "") {
    if (required) throw new Error("Empleado sin PIN");
    return null;
  }
  const pin = String(value).trim();
  if (!/^\d{4}$/.test(pin)) throw new Error("El PIN del empleado debe tener 4 numeros");
  return pin;
}

function employeeAccessFromPayload(payload, role) {
  const isAdmin = role === "admin";
  return {
    canAccessCashlogy:
      payload.can_access_cashlogy == null ? isAdmin : Boolean(payload.can_access_cashlogy),
    canAccessSupplierPayments:
      payload.can_access_supplier_payments == null
        ? isAdmin
        : Boolean(payload.can_access_supplier_payments),
    canAccessProducts:
      payload.can_access_products == null ? isAdmin : Boolean(payload.can_access_products),
    canPostSaleLookup:
      payload.can_post_sale_lookup == null ? true : Boolean(payload.can_post_sale_lookup),
    canRefundSales:
      payload.can_refund_sales == null ? isAdmin : Boolean(payload.can_refund_sales),
  };
}

async function assertNotLastActiveAdmin(local, employeeId) {
  const result = await local.query(
    `SELECT role, active, (SELECT COUNT(*) FROM pos.employees WHERE role = 'admin' AND active = TRUE) AS active_admins
     FROM pos.employees
     WHERE id = $1`,
    [employeeId],
  );
  if (!result.rowCount) throw new Error(`Empleado ${employeeId} no encontrado`);
  const row = result.rows[0];
  if (row.role === "admin" && row.active === true && Number(row.active_admins) <= 1) {
    throw new Error("No se puede quitar el ultimo administrador activo");
  }
}

async function applyEmployeeChange(local, change) {
  const payload = asPayload(change.payload);

  if (change.action === "deactivate") {
    const id = Number(change.entity_id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Empleado sin id");
    await assertNotLastActiveAdmin(local, id);
    const result = await local.query(`UPDATE pos.employees SET active = FALSE WHERE id = $1 RETURNING id`, [id]);
    if (!result.rowCount) throw new Error(`Empleado ${id} no encontrado`);
    return id;
  }

  const name = cleanText(payload.name);
  const role = payload.role === "admin" ? "admin" : "employee";
  const access = employeeAccessFromPayload(payload, role);
  if (!name) throw new Error("Empleado sin nombre");

  if (change.action === "create") {
    const pin = cleanEmployeePin(payload.pin, true);
    const result = await local.query(
      `INSERT INTO pos.employees (
       name, pin, role, active,
         can_access_cashlogy, can_access_supplier_payments, can_access_products,
         can_post_sale_lookup, can_refund_sales
       )
       VALUES ($1, $2, $3, TRUE, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        name,
        pin,
        role,
        access.canAccessCashlogy,
        access.canAccessSupplierPayments,
        access.canAccessProducts,
        access.canPostSaleLookup,
        access.canRefundSales,
      ],
    );
    return Number(result.rows[0].id);
  }

  if (change.action === "update") {
    const id = Number(change.entity_id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Empleado sin id");
    const current = await local.query(`SELECT role, active FROM pos.employees WHERE id = $1`, [id]);
    if (!current.rowCount) throw new Error(`Empleado ${id} no encontrado`);
    if (current.rows[0].role === "admin" && role !== "admin") {
      await assertNotLastActiveAdmin(local, id);
    }
    const pin = cleanEmployeePin(payload.pin, false);
    const result = await local.query(
      `UPDATE pos.employees
       SET name = $1,
           role = $2,
           pin = COALESCE($3, pin),
           can_access_cashlogy = $4,
           can_access_supplier_payments = $5,
           can_access_products = $6,
           can_post_sale_lookup = $7,
           can_refund_sales = $8
       WHERE id = $9
       RETURNING id`,
      [
        name,
        role,
        pin,
        access.canAccessCashlogy,
        access.canAccessSupplierPayments,
        access.canAccessProducts,
        access.canPostSaleLookup,
        access.canRefundSales,
        id,
      ],
    );
    if (!result.rowCount) throw new Error(`Empleado ${id} no encontrado`);
    return id;
  }

  throw new Error(`Accion de empleado no soportada: ${change.action}`);
}

async function applyCatalogChange(local, change) {
  if (change.entity_type === "category") return applyCategoryChange(local, change);
  if (change.entity_type === "product") return applyProductChange(local, change);
  if (change.entity_type === "modifier_group") return applyModifierGroupChange(local, change);
  if (change.entity_type === "employee") return applyEmployeeChange(local, change);
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
    ${table.where ? `WHERE ${table.where}` : ""}
    ORDER BY ${quoteIdent(table.orderBy)}
  `;
  const result = await local.query(query);
  return result.rows;
}

async function deleteCloudParkedOrders(cloud) {
  const result = await cloud.query(
    `DELETE FROM pos.orders WHERE payment_method = 'parked'`
  );
  const deleted = result.rowCount || 0;
  if (deleted > 0) {
    log(`orders: ${deleted} tickets aparcados eliminados del dashboard cloud`);
  }
  return deleted;
}

async function deleteCloudNonFiscalCardDrafts(cloud) {
  const predicate = `payment_method = 'card' AND invoice_number IS NULL`;
  await cloud.query(
    `DELETE FROM pos.post_sale_audit WHERE order_id IN (SELECT id FROM pos.orders WHERE ${predicate})`,
  );
  await cloud.query(
    `DELETE FROM pos.card_transactions WHERE order_id IN (SELECT id FROM pos.orders WHERE ${predicate})`,
  );
  await cloud.query(
    `DELETE FROM pos.kds_events WHERE order_id IN (SELECT id FROM pos.orders WHERE ${predicate})`,
  );
  await cloud.query(
    `DELETE FROM pos.order_items WHERE order_id IN (SELECT id FROM pos.orders WHERE ${predicate})`,
  );
  const result = await cloud.query(`DELETE FROM pos.orders WHERE ${predicate}`);
  const deleted = result.rowCount || 0;
  if (deleted > 0) log(`orders: ${deleted} intentos de tarjeta no fiscales retirados del dashboard cloud`);
  return deleted;
}

async function upsertBatch(cloud, table, rows) {
  if (!rows.length) return 0;

  const columns = table.columns;
  const jsonColumns = new Set(table.jsonColumns || []);
  const keyColumns = table.keyColumns || ["id"];
  const values = [];
  const rowPlaceholders = rows.map((row, rowIndex) => {
    const offset = rowIndex * columns.length;
    for (const column of columns) {
      const value = row[column];
      if (jsonColumns.has(column) && value != null && typeof value !== "string") {
        values.push(JSON.stringify(value));
      } else {
        values.push(value);
      }
    }
    return `(${placeholders(columns, offset)})`;
  });

  const updates = updateAssignments(columns, keyColumns);
  const sql = `
    INSERT INTO pos.${quoteIdent(table.name)} (${columnList(columns)})
    VALUES ${rowPlaceholders.join(", ")}
    ON CONFLICT (${columnList(keyColumns)}) DO UPDATE SET ${updates}
  `;
  await cloud.query(sql, values);
  return rows.length;
}

async function syncTable(local, cloud, table) {
  if (table.optional && !(await tableExists(local, table.name))) {
    log(`${table.name}: tabla opcional no existe, saltada`);
    return 0;
  }

  try {
    const rows = await fetchRows(local, table);
    for (let index = 0; index < rows.length; index += BATCH_SIZE) {
      await upsertBatch(cloud, table, rows.slice(index, index + BATCH_SIZE));
    }
    log(`${table.name}: ${rows.length} filas sincronizadas`);
    return rows.length;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${table.name}: ${message}`);
  }
}

async function writeSyncStatus(cloud, ok, message, counts = {}) {
  await cloud.query(
    `INSERT INTO pos.dashboard_sync_status (id, synced_at, ok, message, counts)
     VALUES ('main', NOW(), $1, $2, $3::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       synced_at = EXCLUDED.synced_at,
       ok = EXCLUDED.ok,
       message = EXCLUDED.message,
       counts = EXCLUDED.counts`,
    [ok, message, JSON.stringify(counts)],
  );
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

    await ensureLocalModifierSchema(local);
    await ensureLocalSupplierPaymentSchema(local);
    await ensureLocalCashlogyStateSnapshotSchema(local);
    await ensureLocalTimeClockSchema(local);
    counts.time_clock_auto_cutoffs = await closeExpiredTimeClockSessions(local);
    await ensureCloudSchema(cloud);
    await ensureOrderBusinessUnitSchema(local);
    await ensureOrderBusinessUnitSchema(cloud);
    await ensureEmployeeAccessSchema(local);
    await ensureEmployeeAccessSchema(cloud);
    await applyPendingCatalogChanges(local, cloud);
    try {
      counts.operational_schedule_cache = await refreshOperationalScheduleCache(local, cloud);
    } catch (error) {
      counts.operational_schedule_cache = 0;
      log(`employee_operational_schedule_cache: no actualizado (${String(error?.message || error)})`);
    }
    try {
      counts.time_clock_corrections = await applyApprovedTimeClockCorrections(local, cloud);
    } catch (error) {
      counts.time_clock_corrections = 0;
      log(`time_clock_corrections: no procesadas (${String(error?.message || error)})`);
    }
    counts.cloud_parked_orders_deleted = await deleteCloudParkedOrders(cloud);
    counts.cloud_non_fiscal_card_drafts_deleted = await deleteCloudNonFiscalCardDrafts(cloud);

    if (cloud.supportsTransactions) await cloud.query("BEGIN");
    for (const table of TABLES) {
      counts[table.name] = await syncTable(local, cloud, table);
    }
    await writeSyncStatus(cloud, true, "Sync completado", counts);
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

async function runLocalMaintenance() {
  let local;
  try {
    local = await connect(LOCAL_DB_URL, "local POS maintenance");
    await ensureLocalTimeClockSchema(local);
    const timeClockAutoCutoffs = await closeExpiredTimeClockSessions(local);
    return { ok: true, timeClockAutoCutoffs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Mantenimiento local: ${message}`);
    return { ok: false, error: message };
  } finally {
    if (local) await local.end();
  }
}

module.exports = { runSync, runLocalMaintenance };

if (require.main === module) {
  runSync().then((result) => {
    process.exit(result.ok ? 0 : 1);
  });
}
