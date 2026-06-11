-- Hi Cream POS - v14
-- Cashlogy latest state snapshot for dashboard/Telegram read-only summaries.

CREATE TABLE IF NOT EXISTS pos.cashlogy_state_snapshots (
  id TEXT PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ok BOOLEAN NOT NULL DEFAULT false,
  online BOOLEAN NOT NULL DEFAULT false,
  total_amount INTEGER NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  status JSONB NOT NULL DEFAULT '{}'::jsonb,
  peripherals JSONB NOT NULL DEFAULT '{}'::jsonb,
  model JSONB NOT NULL DEFAULT '{}'::jsonb,
  accounting JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '{}'::jsonb,
  denominations JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  synced BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_cashlogy_state_snapshots_captured
ON pos.cashlogy_state_snapshots(captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_cashlogy_state_snapshots_synced
ON pos.cashlogy_state_snapshots(synced);
