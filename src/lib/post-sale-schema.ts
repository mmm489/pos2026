import type { PoolClient } from "pg";

import { rawQuery } from "@/lib/db";

let ensured = false;

const statements = [
  `ALTER TABLE pos.business ADD COLUMN IF NOT EXISTS rectifying_invoice_series VARCHAR(10) NOT NULL DEFAULT 'R'`,
  `ALTER TABLE pos.business ADD COLUMN IF NOT EXISTS next_rectifying_invoice_number INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE pos.employees ADD COLUMN IF NOT EXISTS can_post_sale_lookup BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE pos.employees ADD COLUMN IF NOT EXISTS can_refund_sales BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS card_payment_status VARCHAR(24) NOT NULL DEFAULT 'not_applicable'`,
  `ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS payment_attempt_id UUID`,
  `ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS card_payment_error TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_attempt_id ON pos.orders(payment_attempt_id) WHERE payment_attempt_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_orders_card_payment_status ON pos.orders(card_payment_status, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS pos.refunds (
     id BIGSERIAL PRIMARY KEY,
     order_id INTEGER NOT NULL REFERENCES pos.orders(id),
     client_request_id UUID NOT NULL UNIQUE,
     rectifying_invoice_number VARCHAR(24) UNIQUE,
     status VARCHAR(24) NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'pending_verification')),
     amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
     total_base NUMERIC(10,2) NOT NULL,
     total_vat NUMERIC(10,2) NOT NULL,
     reason TEXT NOT NULL,
     employee_id INTEGER NOT NULL REFERENCES pos.employees(id),
     original_transaction_number VARCHAR(120) NOT NULL,
     provider_transaction_id VARCHAR(120),
     provider_reference VARCHAR(120),
     provider_authorization VARCHAR(120),
     provider_response_code VARCHAR(80),
     receipt_text TEXT,
     error_message TEXT,
     requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     completed_at TIMESTAMPTZ,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     synced BOOLEAN NOT NULL DEFAULT false
   )`,
  `CREATE TABLE IF NOT EXISTS pos.refund_items (
     id BIGSERIAL PRIMARY KEY,
     refund_id BIGINT NOT NULL REFERENCES pos.refunds(id) ON DELETE CASCADE,
     order_item_id INTEGER NOT NULL REFERENCES pos.order_items(id),
     product_id INTEGER NOT NULL REFERENCES pos.products(id),
     product_name VARCHAR(200) NOT NULL,
     qty INTEGER NOT NULL CHECK (qty > 0),
     unit_price NUMERIC(10,2) NOT NULL,
     vat_rate NUMERIC(5,2) NOT NULL,
     notes TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS pos.post_sale_audit (
     id BIGSERIAL PRIMARY KEY,
     order_id INTEGER REFERENCES pos.orders(id),
     refund_id BIGINT REFERENCES pos.refunds(id),
     employee_id INTEGER NOT NULL REFERENCES pos.employees(id),
     action VARCHAR(60) NOT NULL,
     details JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     synced BOOLEAN NOT NULL DEFAULT false
   )`,
  `CREATE INDEX IF NOT EXISTS idx_refunds_order ON pos.refunds(order_id, requested_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_refunds_status ON pos.refunds(status, requested_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_refunds_synced ON pos.refunds(synced)`,
  `CREATE INDEX IF NOT EXISTS idx_refund_items_refund ON pos.refund_items(refund_id)`,
  `CREATE INDEX IF NOT EXISTS idx_post_sale_audit_order ON pos.post_sale_audit(order_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_post_sale_audit_synced ON pos.post_sale_audit(synced)`,
];

export async function ensurePostSaleSchema(client?: PoolClient) {
  if (!client && ensured) return;
  for (const statement of statements) {
    if (client) await client.query(statement);
    else await rawQuery(statement);
  }
  const adminUpdate = `UPDATE pos.employees
                       SET can_post_sale_lookup = true, can_refund_sales = true
                       WHERE role = 'admin'`;
  if (client) await client.query(adminUpdate);
  else await rawQuery(adminUpdate);
  if (!client) ensured = true;
}

