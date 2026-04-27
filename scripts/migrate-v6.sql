-- Migration v6: persistent log of card datafono communications.
-- Each row is one HTTP call from the bridge to VerifoneService for sale/refund/
-- cancel/query/abort. Used for fiscal audit, reconciliation against Comercia,
-- and post-mortem of failed sales.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS pos.card_transactions (
  id SERIAL PRIMARY KEY,
  -- Soft link to pos.orders. NULL for query/abort/health probes that don't
  -- belong to an order, or when the order failed to be created.
  order_id INTEGER REFERENCES pos.orders(id),
  operation VARCHAR(20) NOT NULL,         -- charge | refund | cancel | query | abort
  amount NUMERIC(10,2),
  reference VARCHAR(40),                  -- factura we sent to REDSYS
  original_reference VARCHAR(40),         -- for refund/cancel/query
  success BOOLEAN NOT NULL,
  response_code VARCHAR(10),              -- 0000 = approved
  authorization_code VARCHAR(40),
  error_message TEXT,
  request JSONB,                          -- raw payload sent to VerifoneService
  response JSONB,                         -- raw payload returned
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_tx_created_at ON pos.card_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_card_tx_reference ON pos.card_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_card_tx_order_id ON pos.card_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_card_tx_operation ON pos.card_transactions(operation);
