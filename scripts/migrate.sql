-- Hi Cream POS — Database Migration
-- Schema: pos

CREATE SCHEMA IF NOT EXISTS pos;

-- Categories
CREATE TABLE IF NOT EXISTS pos.categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  color VARCHAR(7) NOT NULL DEFAULT '#6B7280'
);

-- Products (price = PVP con IVA incluido)
CREATE TABLE IF NOT EXISTS pos.products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  category_id INTEGER NOT NULL REFERENCES pos.categories(id),
  price NUMERIC(8,2) NOT NULL,
  vat_rate NUMERIC(4,2) NOT NULL DEFAULT 10.00,
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Business info
CREATE TABLE IF NOT EXISTS pos.business (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  trade_name VARCHAR(200),
  nif VARCHAR(20) NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  postal_code VARCHAR(10) NOT NULL,
  province VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  invoice_series VARCHAR(10) NOT NULL DEFAULT 'S',
  next_invoice_number INTEGER NOT NULL DEFAULT 1
);

-- Employees
CREATE TABLE IF NOT EXISTS pos.employees (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  pin VARCHAR(4) NOT NULL UNIQUE,
  role VARCHAR(20) NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  active BOOLEAN NOT NULL DEFAULT true
);

-- Orders
CREATE TABLE IF NOT EXISTS pos.orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(10) NOT NULL,
  invoice_number VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled')),
  total NUMERIC(10,2) NOT NULL,
  total_base NUMERIC(10,2),
  total_vat NUMERIC(10,2),
  payment_method VARCHAR(10) NOT NULL CHECK (payment_method IN ('cash', 'card', 'manual')),
  employee_id INTEGER REFERENCES pos.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  cancelled_by INTEGER REFERENCES pos.employees(id),
  synced BOOLEAN NOT NULL DEFAULT false
);

-- Order Items
CREATE TABLE IF NOT EXISTS pos.order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES pos.orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES pos.products(id),
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(8,2) NOT NULL,
  vat_rate NUMERIC(4,2) NOT NULL DEFAULT 10.00,
  notes TEXT
);

-- KDS Events
CREATE TABLE IF NOT EXISTS pos.kds_events (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES pos.orders(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cash Closings (for Step 10)
CREATE TABLE IF NOT EXISTS pos.cash_closings (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES pos.employees(id),
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_cash NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_card NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_sales NUMERIC(10,2) NOT NULL DEFAULT 0,
  ticket_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  synced BOOLEAN NOT NULL DEFAULT false
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_category ON pos.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON pos.products(active);
CREATE INDEX IF NOT EXISTS idx_orders_status ON pos.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON pos.orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_synced ON pos.orders(synced);
CREATE INDEX IF NOT EXISTS idx_cash_closings_synced ON pos.cash_closings(synced);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON pos.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_kds_events_order ON pos.kds_events(order_id);

-- Modifier/toppings pages
CREATE TABLE IF NOT EXISTS pos.modifier_groups (
  id SERIAL PRIMARY KEY,
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

CREATE INDEX IF NOT EXISTS idx_product_modifier_groups_group
ON pos.product_modifier_groups(group_id);

ALTER TABLE pos.product_modifier_groups
ADD COLUMN IF NOT EXISTS included_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE pos.product_modifier_groups
ADD COLUMN IF NOT EXISTS extra_price NUMERIC(8,2) NOT NULL DEFAULT 0;

-- =====================
-- SEED DATA
-- =====================

-- Categories
INSERT INTO pos.categories (name, sort_order, color) VALUES
  ('Tarrinas', 1, '#F472B6'),
  ('Cucuruchos', 2, '#FB923C'),
  ('Batidos', 3, '#60A5FA'),
  ('Granizados', 4, '#34D399'),
  ('Extras', 5, '#A78BFA')
ON CONFLICT DO NOTHING;

-- Products
INSERT INTO pos.products (name, category_id, price, sort_order) VALUES
  -- Tarrinas
  ('Tarrina Pequeña (1 bola)', 1, 2.50, 1),
  ('Tarrina Mediana (2 bolas)', 1, 4.00, 2),
  ('Tarrina Grande (3 bolas)', 1, 5.50, 3),
  -- Cucuruchos
  ('Cucurucho 1 bola', 2, 2.80, 1),
  ('Cucurucho 2 bolas', 2, 4.50, 2),
  -- Batidos
  ('Batido Clásico', 3, 4.50, 1),
  ('Batido Premium', 3, 5.50, 2),
  -- Granizados
  ('Granizado Limón', 4, 3.50, 1),
  ('Granizado Café', 4, 3.50, 2),
  -- Extras
  ('Topping Extra', 5, 1.00, 1)
ON CONFLICT DO NOTHING;

-- Employees
INSERT INTO pos.employees (name, pin, role) VALUES
  ('Admin', '0000', 'admin'),
  ('María', '1234', 'employee'),
  ('Carlos', '5678', 'employee')
ON CONFLICT DO NOTHING;

-- Business info (EDITAR CON DATOS REALES)
INSERT INTO pos.business (name, trade_name, nif, address, city, postal_code, province, phone, invoice_series)
VALUES (
  'APOLO HOLDINGS 2020, S.L.U.',
  'Hi Cream',
  'B00000000',
  'Calle Ejemplo 1',
  'Salou',
  '43840',
  'Tarragona',
  '977 000 000',
  'S'
)
ON CONFLICT DO NOTHING;

-- =====================
-- MIGRATIONS (safe to re-run)
-- =====================

-- v2: Add cancellation fields + fix constraints for existing DBs
DO $$
BEGIN
  -- Add table_number if missing (older DBs)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='pos' AND table_name='orders' AND column_name='table_number') THEN
    ALTER TABLE pos.orders ADD COLUMN table_number VARCHAR(10);
  END IF;

  -- Add cancellation columns if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='pos' AND table_name='orders' AND column_name='cancelled_at') THEN
    ALTER TABLE pos.orders ADD COLUMN cancelled_at TIMESTAMPTZ;
    ALTER TABLE pos.orders ADD COLUMN cancellation_reason TEXT;
    ALTER TABLE pos.orders ADD COLUMN cancelled_by INTEGER REFERENCES pos.employees(id);
  END IF;

  -- Update status CHECK constraint to include 'cancelled'
  ALTER TABLE pos.orders DROP CONSTRAINT IF EXISTS orders_status_check;
  ALTER TABLE pos.orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled'));

  -- Update payment_method CHECK constraint to include 'manual'
  ALTER TABLE pos.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
  ALTER TABLE pos.orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('cash', 'card', 'manual'));
END $$;
