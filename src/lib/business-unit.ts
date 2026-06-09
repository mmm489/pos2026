import type { PoolClient } from "pg";

import { rawQuery } from "@/lib/db";

export type BusinessUnit = "hicream" | "cookies";

export const DEFAULT_BUSINESS_UNIT: BusinessUnit = "hicream";
export const COOKIES_BUSINESS_UNIT: BusinessUnit = "cookies";

let orderBusinessUnitSchemaEnsured = false;

export function normalizeBusinessUnit(value: unknown): BusinessUnit {
  return value === COOKIES_BUSINESS_UNIT ? COOKIES_BUSINESS_UNIT : DEFAULT_BUSINESS_UNIT;
}

export async function ensureOrderBusinessUnitSchema(client?: PoolClient | null) {
  if (!client && orderBusinessUnitSchemaEnsured) return;

  const statements = [
    `
      ALTER TABLE pos.orders
      ADD COLUMN IF NOT EXISTS business_unit VARCHAR(20) NOT NULL DEFAULT 'hicream'
    `,
    `
      CREATE INDEX IF NOT EXISTS idx_orders_business_unit
      ON pos.orders(business_unit)
    `,
    `
      ALTER TABLE pos.business
      ADD COLUMN IF NOT EXISTS cookies_invoice_series VARCHAR(10) NOT NULL DEFAULT 'C'
    `,
    `
      ALTER TABLE pos.business
      ADD COLUMN IF NOT EXISTS next_cookies_invoice_number INTEGER NOT NULL DEFAULT 1
    `,
  ];

  if (client) {
    for (const statement of statements) {
      await client.query(statement);
    }
    return;
  }

  for (const statement of statements) {
    await rawQuery(statement);
  }
  orderBusinessUnitSchemaEnsured = true;
}
