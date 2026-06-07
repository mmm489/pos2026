const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

function loadEnv() {
  for (const envPath of [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "bridge", ".env"),
  ]) {
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
      if (!match) continue;
      const name = match[1].trim();
      const value = match[2].trim().replace(/^"|"$/g, "");
      if (!process.env[name]) process.env[name] = value;
    }
  }
}

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
    CREATE TABLE IF NOT EXISTS pos.product_modifier_groups (
      product_id INTEGER PRIMARY KEY REFERENCES pos.products(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES pos.modifier_groups(id) ON DELETE SET NULL,
      included_count INTEGER NOT NULL DEFAULT 0,
      extra_price NUMERIC(8,2) NOT NULL DEFAULT 0
    )
  `);
  await client.query(`
    ALTER TABLE pos.product_modifier_groups
    ADD COLUMN IF NOT EXISTS included_count INTEGER NOT NULL DEFAULT 0
  `);
  await client.query(`
    ALTER TABLE pos.product_modifier_groups
    ADD COLUMN IF NOT EXISTS extra_price NUMERIC(8,2) NOT NULL DEFAULT 0
  `);
}

async function findSpecialityCategory(client) {
  const result = await client.query(
    `
      SELECT id
      FROM pos.categories
      WHERE upper(name) IN ('ESPECIALITATS', 'ESPECIALITAT')
      ORDER BY sort_order, id
      LIMIT 1
    `
  );
  if (!result.rows[0]) throw new Error("No se ha encontrado la categoria ESPECIALITATS");
  return Number(result.rows[0].id);
}

async function findSpecialityModifierGroup(client) {
  const existing = await client.query(
    `
      SELECT group_id
      FROM pos.product_modifier_groups pmg
      JOIN pos.products p ON p.id = pmg.product_id
      WHERE upper(p.name) IN ('MATCHA MADUIXA', 'MATCHA MANGO', 'MATCHA COCO', 'MATCHA LATE')
        AND pmg.group_id IS NOT NULL
      ORDER BY
        CASE upper(p.name)
          WHEN 'MATCHA MADUIXA' THEN 1
          WHEN 'MATCHA MANGO' THEN 2
          WHEN 'MATCHA COCO' THEN 3
          ELSE 4
        END
      LIMIT 1
    `
  );
  if (existing.rows[0]) return Number(existing.rows[0].group_id);

  const named = await client.query(
    `SELECT id FROM pos.modifier_groups WHERE name = 'Especialitats: temperatura i mida' LIMIT 1`
  );
  if (named.rows[0]) return Number(named.rows[0].id);

  return null;
}

async function upsertProduct(client, product) {
  const existing = await client.query(
    `
      SELECT id
      FROM pos.products
      WHERE category_id = $1 AND lower(name) = lower($2)
      LIMIT 1
    `,
    [product.categoryId, product.name]
  );

  if (existing.rows[0]) {
    const updated = await client.query(
      `
        UPDATE pos.products
        SET name = $1,
            price = $2,
            vat_rate = 10,
            active = true,
            sort_order = $3
        WHERE id = $4
        RETURNING id, name, price, sort_order
      `,
      [product.name, product.price, product.sortOrder, existing.rows[0].id]
    );
    return { ...updated.rows[0], action: "updated" };
  }

  const inserted = await client.query(
    `
      INSERT INTO pos.products (name, category_id, price, vat_rate, active, sort_order)
      VALUES ($1, $2, $3, 10, true, $4)
      RETURNING id, name, price, sort_order
    `,
    [product.name, product.categoryId, product.price, product.sortOrder]
  );
  return { ...inserted.rows[0], action: "created" };
}

async function reorderSpecialities(client, categoryId) {
  const orderedNames = [
    "MATCHA LATE",
    "MATCHA MADUIXA",
    "MATCHA MANGO",
    "MATCHA COCO",
    "MATCHA VAINILLA",
    "MATCHA CARAMEL",
    "MATCHA AVELLANA",
    "PISTACHO LATTE",
    "CHAI LATE",
    "CHAI PISTATXO",
    "CHAI XOCOLATA NEGRE",
    "SPECIAL VAINILLA",
    "SPECIAL AVELLANA",
    "SPECIAL CARAMEL",
    "SPECIAL LOTUS",
    "SPECIAL MOCHA BLANC",
    "SPECIAL MOCHA NEGRE",
  ];

  let updated = 0;
  for (const [index, name] of orderedNames.entries()) {
    const result = await client.query(
      `
        UPDATE pos.products
        SET sort_order = $1
        WHERE category_id = $2 AND upper(name) = $3
      `,
      [index + 1, categoryId, name]
    );
    updated += result.rowCount;
  }
  return updated;
}

async function main() {
  loadEnv();
  const connectionString = process.env.LOCAL_DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!connectionString) throw new Error("LOCAL_DATABASE_URL o NEON_DATABASE_URL no esta configurado");

  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureModifierSchema(client);

    const categoryId = await findSpecialityCategory(client);
    const modifierGroupId = await findSpecialityModifierGroup(client);
    const products = [
      { name: "MATCHA VAINILLA", price: 4.95, sortOrder: 5, categoryId },
      { name: "MATCHA CARAMEL", price: 4.95, sortOrder: 6, categoryId },
      { name: "MATCHA AVELLANA", price: 4.95, sortOrder: 7, categoryId },
    ];

    const changed = [];
    for (const product of products) {
      const row = await upsertProduct(client, product);
      changed.push(row);
      if (modifierGroupId) {
        await client.query(
          `
            INSERT INTO pos.product_modifier_groups (product_id, group_id, included_count, extra_price)
            VALUES ($1, $2, 0, 1)
            ON CONFLICT (product_id) DO UPDATE SET
              group_id = EXCLUDED.group_id,
              included_count = EXCLUDED.included_count,
              extra_price = EXCLUDED.extra_price
          `,
          [row.id, modifierGroupId]
        );
      }
    }

    const reordered = await reorderSpecialities(client, categoryId);

    await client.query("COMMIT");
    console.log(
      JSON.stringify(
        {
          ok: true,
          categoryId,
          modifierGroupId,
          changed,
          reordered,
        },
        null,
        2
      )
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
