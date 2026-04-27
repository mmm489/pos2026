-- Migration v4: Tancament Z fiscal complet
-- Adds correlative Z numbering, VAT breakdown, invoice range, immutability trigger.
-- Safe to re-run.

DO $$
BEGIN
  -- Z correlative number (NULL for legacy rows that pre-date Z)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pos' AND table_name = 'cash_closings' AND column_name = 'z_number'
  ) THEN
    ALTER TABLE pos.cash_closings ADD COLUMN z_number INTEGER UNIQUE;
    RAISE NOTICE 'Added pos.cash_closings.z_number';
  END IF;

  -- Human-readable Z label, e.g. "Z-2026/000001"
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pos' AND table_name = 'cash_closings' AND column_name = 'z_label'
  ) THEN
    ALTER TABLE pos.cash_closings ADD COLUMN z_label VARCHAR(20);
    RAISE NOTICE 'Added pos.cash_closings.z_label';
  END IF;

  -- VAT totals
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pos' AND table_name = 'cash_closings' AND column_name = 'total_base'
  ) THEN
    ALTER TABLE pos.cash_closings ADD COLUMN total_base NUMERIC(10,2) NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added pos.cash_closings.total_base';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pos' AND table_name = 'cash_closings' AND column_name = 'total_vat'
  ) THEN
    ALTER TABLE pos.cash_closings ADD COLUMN total_vat NUMERIC(10,2) NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added pos.cash_closings.total_vat';
  END IF;

  -- Per-rate VAT breakdown: {"10": {"base": 100.00, "vat": 10.00, "total": 110.00}, ...}
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pos' AND table_name = 'cash_closings' AND column_name = 'vat_breakdown'
  ) THEN
    ALTER TABLE pos.cash_closings ADD COLUMN vat_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb;
    RAISE NOTICE 'Added pos.cash_closings.vat_breakdown';
  END IF;

  -- Invoice range (the first and last invoice numbers covered by this Z)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pos' AND table_name = 'cash_closings' AND column_name = 'first_invoice'
  ) THEN
    ALTER TABLE pos.cash_closings ADD COLUMN first_invoice VARCHAR(40);
    RAISE NOTICE 'Added pos.cash_closings.first_invoice';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pos' AND table_name = 'cash_closings' AND column_name = 'last_invoice'
  ) THEN
    ALTER TABLE pos.cash_closings ADD COLUMN last_invoice VARCHAR(40);
    RAISE NOTICE 'Added pos.cash_closings.last_invoice';
  END IF;

  -- Audit counters
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pos' AND table_name = 'cash_closings' AND column_name = 'cancelled_count'
  ) THEN
    ALTER TABLE pos.cash_closings ADD COLUMN cancelled_count INTEGER NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added pos.cash_closings.cancelled_count';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pos' AND table_name = 'cash_closings' AND column_name = 'total_refunded'
  ) THEN
    ALTER TABLE pos.cash_closings ADD COLUMN total_refunded NUMERIC(10,2) NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added pos.cash_closings.total_refunded';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pos' AND table_name = 'cash_closings' AND column_name = 'card_count'
  ) THEN
    ALTER TABLE pos.cash_closings ADD COLUMN card_count INTEGER NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added pos.cash_closings.card_count';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pos' AND table_name = 'cash_closings' AND column_name = 'cash_count'
  ) THEN
    ALTER TABLE pos.cash_closings ADD COLUMN cash_count INTEGER NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added pos.cash_closings.cash_count';
  END IF;

  -- Immutable snapshot of business data at the moment the Z was issued.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pos' AND table_name = 'cash_closings' AND column_name = 'business_snapshot'
  ) THEN
    ALTER TABLE pos.cash_closings ADD COLUMN business_snapshot JSONB;
    RAISE NOTICE 'Added pos.cash_closings.business_snapshot';
  END IF;

  -- next_z_number on business: source of truth for the correlative Z counter.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'pos' AND table_name = 'business' AND column_name = 'next_z_number'
  ) THEN
    ALTER TABLE pos.business ADD COLUMN next_z_number INTEGER NOT NULL DEFAULT 1;
    RAISE NOTICE 'Added pos.business.next_z_number';
  END IF;
END $$;

-- Immutability trigger: once a row has z_number set, it cannot be UPDATEd or DELETEd.
-- Legacy rows (z_number NULL) remain editable for backward compatibility.
CREATE OR REPLACE FUNCTION pos.prevent_z_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.z_number IS NOT NULL THEN
      RAISE EXCEPTION 'Z closing % is immutable and cannot be deleted', OLD.z_label;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.z_number IS NOT NULL THEN
      RAISE EXCEPTION 'Z closing % is immutable and cannot be modified', OLD.z_label;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cash_closings_immutable ON pos.cash_closings;
-- EXECUTE PROCEDURE for compatibility with PostgreSQL 9.6 (heladería server).
-- On PG 11+ both PROCEDURE and FUNCTION work for trigger functions.
CREATE TRIGGER cash_closings_immutable
  BEFORE UPDATE OR DELETE ON pos.cash_closings
  FOR EACH ROW EXECUTE PROCEDURE pos.prevent_z_mutation();
