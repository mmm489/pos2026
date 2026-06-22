-- Migration v15: service type for dine-in / takeaway orders.

ALTER TABLE pos.orders
  ADD COLUMN IF NOT EXISTS service_type VARCHAR(20) NOT NULL DEFAULT 'dine_in';

ALTER TABLE pos.orders
  DROP CONSTRAINT IF EXISTS orders_service_type_check;

ALTER TABLE pos.orders
  ADD CONSTRAINT orders_service_type_check
  CHECK (service_type IN ('dine_in', 'takeaway'));
