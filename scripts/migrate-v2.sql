-- Hi Cream POS — Migration v2
-- Adds: order cancellation, table_number, fixes payment_method constraint
-- Safe to re-run multiple times
--
-- Run: psql -U postgres -d hicream -f scripts/migrate-v2.sql

DO $$
BEGIN
  -- Add table_number if missing (older DBs)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='pos' AND table_name='orders' AND column_name='table_number') THEN
    ALTER TABLE pos.orders ADD COLUMN table_number VARCHAR(10);
    RAISE NOTICE 'Added column: table_number';
  END IF;

  -- Add cancellation columns if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='pos' AND table_name='orders' AND column_name='cancelled_at') THEN
    ALTER TABLE pos.orders ADD COLUMN cancelled_at TIMESTAMPTZ;
    ALTER TABLE pos.orders ADD COLUMN cancellation_reason TEXT;
    ALTER TABLE pos.orders ADD COLUMN cancelled_by INTEGER REFERENCES pos.employees(id);
    RAISE NOTICE 'Added columns: cancelled_at, cancellation_reason, cancelled_by';
  END IF;

  -- Update status CHECK constraint to include 'cancelled'
  ALTER TABLE pos.orders DROP CONSTRAINT IF EXISTS orders_status_check;
  ALTER TABLE pos.orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled'));
  RAISE NOTICE 'Updated constraint: orders_status_check';

  -- Update payment_method CHECK constraint to include 'manual'
  ALTER TABLE pos.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
  ALTER TABLE pos.orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('cash', 'card', 'manual'));
  RAISE NOTICE 'Updated constraint: orders_payment_method_check';

  RAISE NOTICE 'Migration v2 complete!';
END $$;
