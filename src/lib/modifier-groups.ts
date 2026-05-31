import type { PoolClient } from "pg";

import { rawQuery, withTransaction } from "@/lib/db";
import type { ModifierGroup } from "@/types/pos";

let schemaReady: Promise<void> | null = null;

export function isModifierCategoryName(name: string): boolean {
  const lower = name.toLowerCase();
  return ["topping", "extra", "salsa", "complement", "complemento", "sabor"].some((keyword) =>
    lower.includes(keyword)
  );
}

export function normalizeModifierGroupId(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function ensureModifierSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await rawQuery(`
        CREATE TABLE IF NOT EXISTS pos.modifier_groups (
          id SERIAL PRIMARY KEY,
          name VARCHAR(120) NOT NULL UNIQUE,
          description TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          active BOOLEAN NOT NULL DEFAULT true
        )
      `);
      await rawQuery(`
        CREATE TABLE IF NOT EXISTS pos.modifier_group_categories (
          group_id INTEGER NOT NULL REFERENCES pos.modifier_groups(id) ON DELETE CASCADE,
          category_id INTEGER NOT NULL REFERENCES pos.categories(id) ON DELETE CASCADE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (group_id, category_id)
        )
      `);
      await rawQuery(`
        CREATE TABLE IF NOT EXISTS pos.product_modifier_groups (
          product_id INTEGER PRIMARY KEY REFERENCES pos.products(id) ON DELETE CASCADE,
          group_id INTEGER REFERENCES pos.modifier_groups(id) ON DELETE SET NULL,
          included_count INTEGER NOT NULL DEFAULT 0,
          extra_price NUMERIC(8,2) NOT NULL DEFAULT 0
        )
      `);
      await rawQuery(`
        ALTER TABLE pos.product_modifier_groups
        ADD COLUMN IF NOT EXISTS included_count INTEGER NOT NULL DEFAULT 0
      `);
      await rawQuery(`
        ALTER TABLE pos.product_modifier_groups
        ADD COLUMN IF NOT EXISTS extra_price NUMERIC(8,2) NOT NULL DEFAULT 0
      `);
      await rawQuery(`
        CREATE INDEX IF NOT EXISTS idx_product_modifier_groups_group
        ON pos.product_modifier_groups(group_id)
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

export async function listModifierGroups(includeInactive = false): Promise<ModifierGroup[]> {
  await ensureModifierSchema();
  const rows = await rawQuery<Record<string, unknown>>(
    `
      SELECT
        g.id,
        g.name,
        g.description,
        g.sort_order,
        g.active,
        COALESCE(
          array_agg(c.id ORDER BY mgc.sort_order, c.sort_order, c.name)
            FILTER (WHERE c.id IS NOT NULL),
          '{}'
        ) AS category_ids,
        COALESCE(
          array_agg(c.name ORDER BY mgc.sort_order, c.sort_order, c.name)
            FILTER (WHERE c.id IS NOT NULL),
          '{}'
        ) AS category_names
      FROM pos.modifier_groups g
      LEFT JOIN pos.modifier_group_categories mgc ON mgc.group_id = g.id
      LEFT JOIN pos.categories c ON c.id = mgc.category_id
      WHERE ($1::boolean = true OR g.active = true)
      GROUP BY g.id
      ORDER BY g.sort_order ASC, g.name ASC
    `,
    [includeInactive]
  );

  return rows.map(mapModifierGroup);
}

export async function createModifierGroup(input: {
  name: string;
  description?: string | null;
  sort_order?: number;
  active?: boolean;
  category_ids?: number[];
}) {
  await ensureModifierSchema();
  return withTransaction(async (client) => {
    const result = await client.query(
      `
        INSERT INTO pos.modifier_groups (name, description, sort_order, active)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [
        cleanName(input.name),
        cleanOptionalText(input.description),
        cleanNumber(input.sort_order, 0),
        input.active !== false,
      ]
    );
    const groupId = Number(result.rows[0].id);
    await replaceGroupCategories(client, groupId, input.category_ids ?? []);
    return getModifierGroupById(client, groupId);
  });
}

export async function updateModifierGroup(
  id: number,
  input: {
    name?: string;
    description?: string | null;
    sort_order?: number;
    active?: boolean;
    category_ids?: number[];
  }
) {
  await ensureModifierSchema();
  return withTransaction(async (client) => {
    await client.query(
      `
        UPDATE pos.modifier_groups
        SET
          name = COALESCE($2, name),
          description = CASE WHEN $3::boolean THEN $4 ELSE description END,
          sort_order = COALESCE($5, sort_order),
          active = COALESCE($6, active)
        WHERE id = $1
      `,
      [
        id,
        input.name === undefined ? null : cleanName(input.name),
        input.description !== undefined,
        cleanOptionalText(input.description),
        input.sort_order === undefined ? null : cleanNumber(input.sort_order, 0),
        input.active === undefined ? null : input.active,
      ]
    );
    if (input.category_ids) {
      await replaceGroupCategories(client, id, input.category_ids);
    }
    return getModifierGroupById(client, id);
  });
}

export async function setProductModifierGroup(
  productId: number,
  groupId: number | null,
  includedCount = 0,
  extraPrice = 0
) {
  await ensureModifierSchema();
  if (groupId == null) {
    await rawQuery("DELETE FROM pos.product_modifier_groups WHERE product_id = $1", [productId]);
    return;
  }
  await rawQuery(
    `
      INSERT INTO pos.product_modifier_groups (product_id, group_id, included_count, extra_price)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (product_id) DO UPDATE SET
        group_id = EXCLUDED.group_id,
        included_count = EXCLUDED.included_count,
        extra_price = EXCLUDED.extra_price
    `,
    [productId, groupId, cleanInteger(includedCount, 0), cleanMoney(extraPrice, 0)]
  );
}

async function replaceGroupCategories(client: PoolClient, groupId: number, categoryIds: number[]) {
  await client.query("DELETE FROM pos.modifier_group_categories WHERE group_id = $1", [groupId]);
  const uniqueIds = Array.from(
    new Set(categoryIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))
  );
  for (let index = 0; index < uniqueIds.length; index += 1) {
    await client.query(
      `
        INSERT INTO pos.modifier_group_categories (group_id, category_id, sort_order)
        VALUES ($1, $2, $3)
        ON CONFLICT (group_id, category_id) DO UPDATE SET sort_order = EXCLUDED.sort_order
      `,
      [groupId, uniqueIds[index], index]
    );
  }
}

async function getModifierGroupById(client: PoolClient, id: number) {
  const result = await client.query(
    `
      SELECT
        g.id,
        g.name,
        g.description,
        g.sort_order,
        g.active,
        COALESCE(
          array_agg(c.id ORDER BY mgc.sort_order, c.sort_order, c.name)
            FILTER (WHERE c.id IS NOT NULL),
          '{}'
        ) AS category_ids,
        COALESCE(
          array_agg(c.name ORDER BY mgc.sort_order, c.sort_order, c.name)
            FILTER (WHERE c.id IS NOT NULL),
          '{}'
        ) AS category_names
      FROM pos.modifier_groups g
      LEFT JOIN pos.modifier_group_categories mgc ON mgc.group_id = g.id
      LEFT JOIN pos.categories c ON c.id = mgc.category_id
      WHERE g.id = $1
      GROUP BY g.id
    `,
    [id]
  );
  return result.rows[0] ? mapModifierGroup(result.rows[0]) : null;
}

function mapModifierGroup(row: Record<string, unknown>): ModifierGroup {
  return {
    id: Number(row.id),
    name: String(row.name),
    description: row.description == null ? null : String(row.description),
    sort_order: Number(row.sort_order ?? 0),
    active: row.active !== false,
    category_ids: normalizeArray(row.category_ids).map(Number).filter((id) => Number.isFinite(id)),
    category_names: normalizeArray(row.category_names).map(String),
  };
}

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanName(value: string) {
  return String(value || "").trim();
}

function cleanOptionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function cleanNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanInteger(value: unknown, fallback: number) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function cleanMoney(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : fallback;
}
