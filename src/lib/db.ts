import { Pool } from "pg";

let pool: Pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.NEON_DATABASE_URL!,
    });
  }
  return pool;
}

// SQL tagged template literal — compatible with both local pg and Neon
export function getDb() {
  const pool = getPool();

  const sql = async (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<Record<string, unknown>[]> => {
    // Build query from tagged template
    let query = "";
    strings.forEach((str, i) => {
      query += str;
      if (i < values.length) {
        query += `$${i + 1}`;
      }
    });

    const result = await pool.query(query, values);
    return result.rows;
  };

  return sql;
}
