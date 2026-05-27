-- Migration v7: sync per-line KDS ready marks across kitchen screens.
-- Safe to re-run.

ALTER TABLE pos.order_items
ADD COLUMN IF NOT EXISTS kds_ready BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE pos.order_items
ADD COLUMN IF NOT EXISTS kds_ready_at TIMESTAMPTZ;
