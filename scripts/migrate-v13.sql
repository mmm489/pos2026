-- Migration v13: POS menu access per employee.

ALTER TABLE pos.employees
  ADD COLUMN IF NOT EXISTS can_access_cashlogy BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE pos.employees
  ADD COLUMN IF NOT EXISTS can_access_supplier_payments BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE pos.employees
  ADD COLUMN IF NOT EXISTS can_access_products BOOLEAN NOT NULL DEFAULT false;

UPDATE pos.employees
SET can_access_products = true,
    can_access_cashlogy = true,
    can_access_supplier_payments = true
WHERE role = 'admin';
