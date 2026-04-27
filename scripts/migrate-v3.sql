-- Migration v3: Card payment audit trail (REDSYS reference, refund tracking)
-- Safe to re-run.

DO $$
BEGIN
  -- REDSYS factura (12-char ref sent at sale time, used to refund/cancel later).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pos' AND table_name = 'orders' AND column_name = 'card_reference'
  ) THEN
    ALTER TABLE pos.orders ADD COLUMN card_reference VARCHAR(20);
    RAISE NOTICE 'Added pos.orders.card_reference';
  END IF;

  -- REDSYS authorization code (returned by datafono on approved sale).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pos' AND table_name = 'orders' AND column_name = 'card_authorization'
  ) THEN
    ALTER TABLE pos.orders ADD COLUMN card_authorization VARCHAR(20);
    RAISE NOTICE 'Added pos.orders.card_authorization';
  END IF;

  -- Reference returned by the refund/cancel operation when we reverse a card sale.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pos' AND table_name = 'orders' AND column_name = 'refund_reference'
  ) THEN
    ALTER TABLE pos.orders ADD COLUMN refund_reference VARCHAR(20);
    RAISE NOTICE 'Added pos.orders.refund_reference';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pos' AND table_name = 'orders' AND column_name = 'refund_at'
  ) THEN
    ALTER TABLE pos.orders ADD COLUMN refund_at TIMESTAMP;
    RAISE NOTICE 'Added pos.orders.refund_at';
  END IF;

  -- 'refund' / 'cancel' kept on KDS event_type, no constraint to relax.
END $$;
