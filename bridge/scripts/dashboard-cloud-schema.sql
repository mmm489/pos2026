CREATE SCHEMA IF NOT EXISTS pos;

CREATE TABLE IF NOT EXISTS pos.categories (
  id INTEGER PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  color VARCHAR(7) NOT NULL DEFAULT '#6B7280'
);

CREATE TABLE IF NOT EXISTS pos.products (
  id INTEGER PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  category_id INTEGER REFERENCES pos.categories(id),
  price NUMERIC(8,2) NOT NULL,
  vat_rate NUMERIC(4,2) NOT NULL DEFAULT 10.00,
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pos.modifier_groups (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS pos.modifier_group_categories (
  group_id INTEGER NOT NULL REFERENCES pos.modifier_groups(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES pos.categories(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, category_id)
);

CREATE TABLE IF NOT EXISTS pos.product_modifier_groups (
  product_id INTEGER PRIMARY KEY REFERENCES pos.products(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES pos.modifier_groups(id) ON DELETE SET NULL,
  included_count INTEGER NOT NULL DEFAULT 0,
  extra_price NUMERIC(8,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pos.business (
  id INTEGER PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  trade_name VARCHAR(200),
  nif VARCHAR(20) NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  postal_code VARCHAR(10) NOT NULL,
  province VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  invoice_series VARCHAR(10) NOT NULL DEFAULT 'S',
  next_invoice_number INTEGER NOT NULL DEFAULT 1,
  cookies_invoice_series VARCHAR(10) NOT NULL DEFAULT 'C',
  next_cookies_invoice_number INTEGER NOT NULL DEFAULT 1,
  next_z_number INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pos.employees (
  id INTEGER PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  pin VARCHAR(4),
  role VARCHAR(20) NOT NULL DEFAULT 'employee',
  active BOOLEAN NOT NULL DEFAULT true,
  can_access_cashlogy BOOLEAN NOT NULL DEFAULT true,
  can_access_supplier_payments BOOLEAN NOT NULL DEFAULT true,
  can_access_products BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE pos.employees ADD COLUMN IF NOT EXISTS can_access_cashlogy BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE pos.employees ADD COLUMN IF NOT EXISTS can_access_supplier_payments BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE pos.employees ADD COLUMN IF NOT EXISTS can_access_products BOOLEAN NOT NULL DEFAULT false;
UPDATE pos.employees
SET can_access_products = true,
    can_access_cashlogy = true,
    can_access_supplier_payments = true
WHERE role = 'admin';

CREATE TABLE IF NOT EXISTS pos.orders (
  id INTEGER PRIMARY KEY,
  order_number VARCHAR(10) NOT NULL,
  invoice_number VARCHAR(40),
  status VARCHAR(20) NOT NULL,
  total NUMERIC(10,2) NOT NULL,
  total_base NUMERIC(10,2),
  total_vat NUMERIC(10,2),
  payment_method VARCHAR(10) NOT NULL,
  business_unit VARCHAR(20) NOT NULL DEFAULT 'hicream',
  employee_id INTEGER REFERENCES pos.employees(id),
  table_number VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  cancelled_by INTEGER REFERENCES pos.employees(id),
  card_reference VARCHAR(20),
  card_authorization VARCHAR(20),
  card_receipt_text TEXT,
  cashless_peripheral_id VARCHAR(120),
  cashless_operation_id VARCHAR(120),
  cashless_transaction_number VARCHAR(120),
  cashless_amount NUMERIC(10,2),
  refund_reference VARCHAR(20),
  refund_at TIMESTAMPTZ,
  synced BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS business_unit VARCHAR(20) NOT NULL DEFAULT 'hicream';
ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS cashless_peripheral_id VARCHAR(120);
ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS cashless_operation_id VARCHAR(120);
ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS cashless_transaction_number VARCHAR(120);
ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS cashless_amount NUMERIC(10,2);

CREATE TABLE IF NOT EXISTS pos.order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES pos.orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES pos.products(id),
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(8,2) NOT NULL,
  vat_rate NUMERIC(4,2) NOT NULL DEFAULT 10.00,
  notes TEXT,
  kds_ready BOOLEAN NOT NULL DEFAULT false,
  kds_ready_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pos.kds_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES pos.orders(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS pos.cash_closings (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER REFERENCES pos.employees(id),
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL,
  total_cash NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_card NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_sales NUMERIC(10,2) NOT NULL DEFAULT 0,
  ticket_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  synced BOOLEAN NOT NULL DEFAULT true,
  z_number INTEGER,
  z_label VARCHAR(20),
  total_base NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_vat NUMERIC(10,2) NOT NULL DEFAULT 0,
  vat_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_invoice VARCHAR(40),
  last_invoice VARCHAR(40),
  cancelled_count INTEGER NOT NULL DEFAULT 0,
  total_refunded NUMERIC(10,2) NOT NULL DEFAULT 0,
  card_count INTEGER NOT NULL DEFAULT 0,
  cash_count INTEGER NOT NULL DEFAULT 0,
  business_snapshot JSONB,
  supplier_payments_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  supplier_payments_count INTEGER NOT NULL DEFAULT 0,
  expected_cash_after_supplier_payments NUMERIC(10,2) NOT NULL DEFAULT 0,
  supplier_payments_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS pos.card_transactions (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES pos.orders(id),
  operation VARCHAR(20) NOT NULL,
  amount NUMERIC(10,2),
  reference VARCHAR(40),
  original_reference VARCHAR(40),
  success BOOLEAN NOT NULL,
  response_code VARCHAR(10),
  authorization_code VARCHAR(40),
  error_message TEXT,
  request JSONB,
  response JSONB,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS pos.supplier_payments (
  id INTEGER PRIMARY KEY,
  supplier_name VARCHAR(160) NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  reason TEXT,
  employee_id INTEGER REFERENCES pos.employees(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  cashlogy_result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  dispensed_at TIMESTAMPTZ,
  synced BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS pos.cashlogy_state_snapshots (
  id TEXT PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL,
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
  synced BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS pos.time_clock_sessions (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES pos.employees(id),
  business_date DATE NOT NULL,
  clock_in_at TIMESTAMPTZ NOT NULL,
  clock_out_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  source VARCHAR(40) NOT NULL DEFAULT 'pos',
  device_name TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  synced BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS pos.time_clock_audit (
  id INTEGER PRIMARY KEY,
  session_id INTEGER REFERENCES pos.time_clock_sessions(id) ON DELETE SET NULL,
  employee_id INTEGER REFERENCES pos.employees(id),
  action VARCHAR(40) NOT NULL,
  previous_data JSONB,
  new_data JSONB,
  reason TEXT,
  changed_by INTEGER REFERENCES pos.employees(id),
  created_at TIMESTAMPTZ NOT NULL,
  synced BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS pos.catalog_change_queue (
  id TEXT PRIMARY KEY,
  entity_type VARCHAR(20) NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('create', 'update', 'deactivate')),
  entity_id INTEGER,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'error')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requested_by TEXT,
  applied_at TIMESTAMPTZ,
  applied_entity_id INTEGER,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS pos.dashboard_sync_status (
  id TEXT PRIMARY KEY,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ok BOOLEAN NOT NULL DEFAULT true,
  message TEXT,
  counts JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE pos.catalog_change_queue
DROP CONSTRAINT IF EXISTS catalog_change_queue_entity_type_check;

ALTER TABLE pos.catalog_change_queue
ADD CONSTRAINT catalog_change_queue_entity_type_check
CHECK (entity_type IN ('category', 'product', 'modifier_group', 'employee'));

CREATE INDEX IF NOT EXISTS idx_cloud_orders_created ON pos.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_orders_status ON pos.orders(status);
CREATE INDEX IF NOT EXISTS idx_cloud_orders_payment ON pos.orders(payment_method);
CREATE INDEX IF NOT EXISTS idx_cloud_orders_business_unit ON pos.orders(business_unit);
CREATE INDEX IF NOT EXISTS idx_cloud_order_items_order ON pos.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_cloud_order_items_product ON pos.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_product_modifier_groups_group ON pos.product_modifier_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_cloud_cash_closings_closed ON pos.cash_closings(closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_card_tx_created ON pos.card_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_card_tx_reference ON pos.card_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_cloud_supplier_payments_created ON pos.supplier_payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_supplier_payments_status ON pos.supplier_payments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_cashlogy_state_snapshots_captured ON pos.cashlogy_state_snapshots(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_time_clock_sessions_business_date ON pos.time_clock_sessions(business_date DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_time_clock_sessions_employee ON pos.time_clock_sessions(employee_id, business_date DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_time_clock_sessions_status ON pos.time_clock_sessions(status, clock_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_time_clock_audit_session ON pos.time_clock_audit(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_change_queue_status ON pos.catalog_change_queue(status, requested_at);

ALTER TABLE pos.product_modifier_groups
ADD COLUMN IF NOT EXISTS included_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE pos.product_modifier_groups
ADD COLUMN IF NOT EXISTS extra_price NUMERIC(8,2) NOT NULL DEFAULT 0;

ALTER TABLE pos.cash_closings
ADD COLUMN IF NOT EXISTS supplier_payments_total NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE pos.cash_closings
ADD COLUMN IF NOT EXISTS supplier_payments_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE pos.cash_closings
ADD COLUMN IF NOT EXISTS expected_cash_after_supplier_payments NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE pos.cash_closings
ADD COLUMN IF NOT EXISTS supplier_payments_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;
