const path = require("node:path");
const fs = require("node:fs");
const dotenv = require("dotenv");
const { Client } = require("pg");

const ROOT_DIR = path.resolve(__dirname, "../..");
const BRIDGE_DIR = path.resolve(__dirname, "..");

for (const envPath of [
  path.join(ROOT_DIR, ".env.local"),
  path.join(BRIDGE_DIR, ".env"),
  path.join(ROOT_DIR, ".env"),
]) {
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: false });
}

const DATABASE_URL =
  process.env.LOCAL_DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/hicream";

async function ensureModifierSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS pos.modifier_groups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS pos.modifier_group_categories (
      group_id INTEGER NOT NULL REFERENCES pos.modifier_groups(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES pos.categories(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (group_id, category_id)
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS pos.product_modifier_groups (
      product_id INTEGER PRIMARY KEY REFERENCES pos.products(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES pos.modifier_groups(id) ON DELETE SET NULL,
      included_count INTEGER NOT NULL DEFAULT 0,
      extra_price NUMERIC(8,2) NOT NULL DEFAULT 0
    )
  `);
}

async function ensureCategory(client, name, color) {
  const existing = await client.query(
    `SELECT id FROM pos.categories WHERE lower(name) = lower($1) LIMIT 1`,
    [name],
  );
  if (existing.rows[0]) {
    await client.query(`UPDATE pos.categories SET name = $1, color = $2 WHERE id = $3`, [
      name,
      color,
      existing.rows[0].id,
    ]);
    return Number(existing.rows[0].id);
  }

  const inserted = await client.query(
    `INSERT INTO pos.categories (name, sort_order, color)
     VALUES (
       $1,
       (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM pos.categories),
       $2
     )
     RETURNING id`,
    [name, color],
  );
  return Number(inserted.rows[0].id);
}

async function ensureProduct(client, { name, categoryId, price, sortOrder }) {
  const existing = await client.query(
    `SELECT id FROM pos.products WHERE category_id = $1 AND lower(name) = lower($2) LIMIT 1`,
    [categoryId, name],
  );
  if (existing.rows[0]) {
    await client.query(
      `UPDATE pos.products
       SET name = $1,
           price = $2,
           vat_rate = 10,
           active = true,
           sort_order = $3
       WHERE id = $4`,
      [name, price, sortOrder, existing.rows[0].id],
    );
    return Number(existing.rows[0].id);
  }

  const inserted = await client.query(
    `INSERT INTO pos.products (name, category_id, price, vat_rate, active, sort_order)
     VALUES ($1, $2, $3, 10, true, $4)
     RETURNING id`,
    [name, categoryId, price, sortOrder],
  );
  return Number(inserted.rows[0].id);
}

async function ensureModifierGroup(client, temperatureCategoryId, sizeCategoryId) {
  const group = await client.query(
    `INSERT INTO pos.modifier_groups (name, description, sort_order, active)
     VALUES (
       'Especialitats: temperatura i mida',
       'Fred o calent gratis; XL incrementa 1 euro.',
       80,
       true
     )
     ON CONFLICT (name) DO UPDATE SET
       description = EXCLUDED.description,
       sort_order = EXCLUDED.sort_order,
       active = true
     RETURNING id`,
  );
  const groupId = Number(group.rows[0].id);

  await client.query(`DELETE FROM pos.modifier_group_categories WHERE group_id = $1`, [groupId]);
  for (const [index, categoryId] of [temperatureCategoryId, sizeCategoryId].entries()) {
    await client.query(
      `INSERT INTO pos.modifier_group_categories (group_id, category_id, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (group_id, category_id) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
      [groupId, categoryId, index],
    );
  }

  return groupId;
}

async function run() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");
    await ensureModifierSchema(client);

    const temperatureCategoryId = await ensureCategory(
      client,
      "TEMPERATURA ESPECIALITATS",
      "#78C7D8",
    );
    const sizeCategoryId = await ensureCategory(client, "MIDA ESPECIALITATS", "#D6B36A");

    await ensureProduct(client, {
      name: "FRED",
      categoryId: temperatureCategoryId,
      price: 0,
      sortOrder: 1,
    });
    await ensureProduct(client, {
      name: "CALENT",
      categoryId: temperatureCategoryId,
      price: 0,
      sortOrder: 2,
    });
    await ensureProduct(client, {
      name: "XL",
      categoryId: sizeCategoryId,
      price: 1,
      sortOrder: 1,
    });

    const groupId = await ensureModifierGroup(client, temperatureCategoryId, sizeCategoryId);
    const specialityCategory = await client.query(
      `SELECT id FROM pos.categories
       WHERE lower(name) IN ('especialitats', 'especialitat')
       ORDER BY sort_order, id
       LIMIT 1`,
    );
    if (!specialityCategory.rows[0]) throw new Error("No se ha encontrado la categoria ESPECIALITATS");

    const products = await client.query(
      `SELECT id FROM pos.products WHERE category_id = $1 AND active = true ORDER BY sort_order, id`,
      [specialityCategory.rows[0].id],
    );

    for (const product of products.rows) {
      await client.query(
        `INSERT INTO pos.product_modifier_groups (product_id, group_id, included_count, extra_price)
         VALUES ($1, $2, 0, 1)
         ON CONFLICT (product_id) DO UPDATE SET
           group_id = EXCLUDED.group_id,
           included_count = EXCLUDED.included_count,
           extra_price = EXCLUDED.extra_price`,
        [product.id, groupId],
      );
    }

    await client.query("COMMIT");
    console.log(
      JSON.stringify({
        ok: true,
        groupId,
        temperatureCategoryId,
        sizeCategoryId,
        assignedProducts: products.rowCount,
      }),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
