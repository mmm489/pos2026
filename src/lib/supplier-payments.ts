import type { PoolClient } from "pg";
import { rawQuery } from "@/lib/db";

const SUPPLIER_PAYMENTS_SQL = `
  CREATE TABLE IF NOT EXISTS pos.supplier_payments (
    id SERIAL PRIMARY KEY,
    supplier_name VARCHAR(160) NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    reason TEXT,
    employee_id INTEGER REFERENCES pos.employees(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'dispensed', 'error', 'cancelled')),
    cashlogy_result JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dispensed_at TIMESTAMPTZ,
    synced BOOLEAN NOT NULL DEFAULT false
  )
`;

const CASH_CLOSING_COLUMNS_SQL = [
  `ALTER TABLE pos.cash_closings
   ADD COLUMN IF NOT EXISTS supplier_payments_total NUMERIC(10,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE pos.cash_closings
   ADD COLUMN IF NOT EXISTS supplier_payments_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE pos.cash_closings
   ADD COLUMN IF NOT EXISTS expected_cash_after_supplier_payments NUMERIC(10,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE pos.cash_closings
   ADD COLUMN IF NOT EXISTS supplier_payments_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb`,
];

const INDEX_SQL = [
  `CREATE INDEX IF NOT EXISTS idx_supplier_payments_created
   ON pos.supplier_payments(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_supplier_payments_status
   ON pos.supplier_payments(status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_supplier_payments_synced
   ON pos.supplier_payments(synced)`,
];

async function exec(client: PoolClient | null, text: string, values: unknown[] = []) {
  if (client) {
    await client.query(text, values);
  } else {
    await rawQuery(text, values);
  }
}

export async function ensureSupplierPaymentsSchema(client: PoolClient | null = null) {
  await exec(client, SUPPLIER_PAYMENTS_SQL);
  for (const sql of CASH_CLOSING_COLUMNS_SQL) await exec(client, sql);
  for (const sql of INDEX_SQL) await exec(client, sql);
}

