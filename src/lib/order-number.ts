import type { PoolClient } from "pg";

const ORDER_NUMBER_LOCK_KEY = 2026060701;

export async function allocateOrderNumber(client: PoolClient): Promise<string> {
  await client.query("SELECT pg_advisory_xact_lock($1)", [ORDER_NUMBER_LOCK_KEY]);

  const sessionRes = await client.query(
    `SELECT COALESCE(
       (SELECT closed_at FROM pos.cash_closings ORDER BY closed_at DESC LIMIT 1),
       ((date_trunc('day', timezone('Europe/Madrid', NOW()) - INTERVAL '3 hours') + INTERVAL '3 hours') AT TIME ZONE 'Europe/Madrid')
     ) AS since`
  );
  const since = sessionRes.rows[0]?.since;

  const countRes = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM pos.orders
     WHERE created_at >= $1::timestamptz`,
    [since]
  );
  const next = Number(countRes.rows[0]?.count || 0) + 1;

  return `#${String(next).padStart(3, "0")}`;
}
