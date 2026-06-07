const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
    if (!match) continue;
    const name = match[1].trim();
    const value = match[2].trim().replace(/^"|"$/g, "");
    if (!process.env[name]) process.env[name] = value;
  }
}

async function ensureSchema(client) {
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
  await client.query(`
    ALTER TABLE pos.product_modifier_groups
    ADD COLUMN IF NOT EXISTS included_count INTEGER NOT NULL DEFAULT 0
  `);
  await client.query(`
    ALTER TABLE pos.product_modifier_groups
    ADD COLUMN IF NOT EXISTS extra_price NUMERIC(8,2) NOT NULL DEFAULT 0
  `);
}

async function main() {
  loadEnv();
  if (!process.env.NEON_DATABASE_URL) {
    throw new Error("NEON_DATABASE_URL no esta configurado");
  }

  const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureSchema(client);

    const categories = await client.query(
      `SELECT id, name FROM pos.categories WHERE upper(name) IN ('CAFES', 'CAFÈS', 'VARIOS')`
    );
    const cafeCategory = categories.rows.find((row) => ["CAFES", "CAFÈS"].includes(String(row.name).toUpperCase()));
    const variosCategory = categories.rows.find((row) => String(row.name).toUpperCase() === "VARIOS");
    if (!cafeCategory) throw new Error("No se ha encontrado la categoria CAFES");
    if (!variosCategory) throw new Error("No se ha encontrado la categoria VARIOS");

    const groupResult = await client.query(
      `
        INSERT INTO pos.modifier_groups (name, description, sort_order, active)
        VALUES ('Extres CAFES', 'Extres de la categoria VARIOS para cafes', 13, TRUE)
        ON CONFLICT (name) DO UPDATE SET
          description = EXCLUDED.description,
          sort_order = EXCLUDED.sort_order,
          active = TRUE
        RETURNING id
      `
    );
    const groupId = Number(groupResult.rows[0].id);

    await client.query(`DELETE FROM pos.modifier_group_categories WHERE group_id = $1`, [groupId]);
    await client.query(
      `
        INSERT INTO pos.modifier_group_categories (group_id, category_id, sort_order)
        VALUES ($1, $2, 0)
        ON CONFLICT (group_id, category_id) DO UPDATE SET sort_order = EXCLUDED.sort_order
      `,
      [groupId, Number(variosCategory.id)]
    );

    const assigned = await client.query(
      `
        INSERT INTO pos.product_modifier_groups (product_id, group_id, included_count, extra_price)
        SELECT id, $1, 0, 0
        FROM pos.products
        WHERE category_id = $2 AND active = TRUE
        ON CONFLICT (product_id) DO UPDATE SET
          group_id = EXCLUDED.group_id,
          included_count = EXCLUDED.included_count,
          extra_price = EXCLUDED.extra_price
        RETURNING product_id
      `,
      [groupId, Number(cafeCategory.id)]
    );

    await client.query("COMMIT");
    console.log(JSON.stringify({ groupId, cafeProductsAssigned: assigned.rowCount }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
