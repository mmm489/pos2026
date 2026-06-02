-- Hi Cream POS - Migration v11
-- Allows parked tickets to be represented as kitchen/KDS orders.
-- Safe to re-run multiple times.
--
-- Run: psql -U postgres -d hicream -f scripts/migrate-v11.sql

DO $$
BEGIN
  ALTER TABLE pos.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
  ALTER TABLE pos.orders
    ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IN ('cash', 'card', 'manual', 'parked'));

  RAISE NOTICE 'Migration v11 complete: payment_method allows parked';
END $$;
