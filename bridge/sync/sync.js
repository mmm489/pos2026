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
    where: "payment_method <> 'parked'",
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
  if (!name) throw new Error("Empleado sin nombre");

  if (change.action === "create") {
    const pin = cleanEmployeePin(payload.pin, true);
    const result = await local.query(
      `INSERT INTO pos.employees (name, pin, role, active)
       VALUES ($1, $2, $3, TRUE)
       RETURNING id`,
      [name, pin, role],
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
           pin = COALESCE($3, pin)
       WHERE id = $4
       RETURNING id`,
      [name, role, pin, id],
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
    await ensureLocalTimeClockSchema(local);
    await ensureCloudSchema(cloud);
    await applyPendingCatalogChanges(local, cloud);
    counts.cloud_parked_orders_deleted = await deleteCloudParkedOrders(cloud);

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

module.exports = { runSync };

if (require.main === module) {
  runSync().then((result) => {
    process.exit(result.ok ? 0 : 1);
  });
}
