-- Hi Cream POS - Migration v12
-- Stores Cashlogy SNEXT cashless identifiers needed for refund flows.
-- Safe to re-run multiple times.
--
-- Run: psql -U postgres -d hicream -f scripts/migrate-v12.sql

ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS cashless_peripheral_id VARCHAR(120);
ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS cashless_operation_id VARCHAR(120);
ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS cashless_transaction_number VARCHAR(120);
ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS cashless_amount NUMERIC(10,2);
