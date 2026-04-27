import { Pool, PoolClient } from "pg";

let pool: Pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.NEON_DATABASE_URL!,
    });
  }
  return pool;
}

/**
 * Parameterized query against the shared pool. Use this when the tagged-template
 * `getDb()` API is awkward (e.g. dynamic SQL fragments shared between transactional
 * and non-transactional callers).
 */
export async function rawQuery<T = Record<string, unknown>>(
  text: string,
  values: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query(text, values);
  return result.rows as T[];
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
