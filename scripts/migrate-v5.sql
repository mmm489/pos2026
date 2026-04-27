-- Migration v5: store the bank receipt text alongside the order so we can re-print it.
-- Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pos' AND table_name = 'orders' AND column_name = 'card_receipt_text'
  ) THEN
    ALTER TABLE pos.orders ADD COLUMN card_receipt_text TEXT;
    RAISE NOTICE 'Added pos.orders.card_receipt_text';
  END IF;
END $$;
