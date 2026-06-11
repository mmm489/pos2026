// Best-effort latest Cashlogy state snapshot for the cloud dashboard.
// This is read-only with respect to Cashlogy: it only persists the response
// returned by /cashlogy/state so Telegram can answer from synced data.

const { Pool } = require("pg");

const DEFAULT_LOCAL_DB_URL = "postgresql://postgres:postgres@localhost:5432/hicream";
const LOCAL_DB_URL =
  process.env.LOCAL_DATABASE_URL || process.env.NEON_DATABASE_URL || DEFAULT_LOCAL_DB_URL;
const SNAPSHOT_ID = process.env.CASHLOGY_STATE_SNAPSHOT_ID || "main";

let pool = null;
let schemaReady = false;

function getPool() {
  if (pool) return pool;
  pool = new Pool({ connectionString: LOCAL_DB_URL, max: 2 });
  return pool;
}

async function ensureSchema() {
  if (schemaReady) return;
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS pos.cashlogy_state_snapshots (
      id TEXT PRIMARY KEY,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ok BOOLEAN NOT NULL DEFAULT false,
      online BOOLEAN NOT NULL DEFAULT false,
      total_amount INTEGER NOT NULL DEFAULT 0,
      total NUMERIC(10,2) NOT NULL DEFAULT 0,
      status JSONB NOT NULL DEFAULT '{}'::jsonb,
      peripherals JSONB NOT NULL DEFAULT '{}'::jsonb,
      model JSONB NOT NULL DEFAULT '{}'::jsonb,
      accounting JSONB NOT NULL DEFAULT '{}'::jsonb,
      errors JSONB NOT NULL DEFAULT '{}'::jsonb,
      denominations JSONB NOT NULL DEFAULT '[]'::jsonb,
      error_message TEXT,
      synced BOOLEAN NOT NULL DEFAULT false
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_cashlogy_state_snapshots_captured
    ON pos.cashlogy_state_snapshots(captured_at DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_cashlogy_state_snapshots_synced
    ON pos.cashlogy_state_snapshots(synced)
  `);
  schemaReady = true;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function recordCashlogyStateSnapshot(state) {
  try {
    await ensureSchema();
    const db = getPool();
    const totalAmount = Math.round(numberOrZero(state?.totalAmount));
    const total = numberOrZero(state?.total ?? totalAmount / 100);
    await db.query(
      `INSERT INTO pos.cashlogy_state_snapshots (
         id, captured_at, ok, online, total_amount, total,
         status, peripherals, model, accounting, errors, denominations,
         error_message, synced
       )
       VALUES (
         $1, NOW(), $2, $3, $4, $5,
         $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb,
         $12, false
       )
       ON CONFLICT (id) DO UPDATE SET
         captured_at = EXCLUDED.captured_at,
         ok = EXCLUDED.ok,
         online = EXCLUDED.online,
         total_amount = EXCLUDED.total_amount,
         total = EXCLUDED.total,
         status = EXCLUDED.status,
         peripherals = EXCLUDED.peripherals,
         model = EXCLUDED.model,
         accounting = EXCLUDED.accounting,
         errors = EXCLUDED.errors,
         denominations = EXCLUDED.denominations,
         error_message = EXCLUDED.error_message,
         synced = false`,
      [
        SNAPSHOT_ID,
        Boolean(state?.ok),
        Boolean(state?.online),
        totalAmount,
        total,
        JSON.stringify(state?.status || {}),
        JSON.stringify(state?.peripherals || {}),
        JSON.stringify(state?.model || {}),
        JSON.stringify(state?.accounting || {}),
        JSON.stringify(state?.errors || {}),
        JSON.stringify(Array.isArray(state?.denominations) ? state.denominations : []),
        state?.error ? String(state.error) : null,
      ],
    );
  } catch (error) {
    console.warn("[CashlogyState] snapshot skipped:", error.message || String(error));
  }
}

async function recordCashlogyStateError(error) {
  const message = error?.message || String(error || "Error desconegut");
  return recordCashlogyStateSnapshot({
    ok: false,
    online: false,
    totalAmount: 0,
    total: 0,
    status: { error: message },
    peripherals: {},
    model: {},
    accounting: {},
    errors: { error: message },
    denominations: [],
    error: message,
  });
}

function startCashlogyStateSnapshotScheduler({ port }) {
  const intervalMs = Number(process.env.CASHLOGY_STATE_SNAPSHOT_INTERVAL_MS || 300_000);
  const startupDelayMs = Number(process.env.CASHLOGY_STATE_SNAPSHOT_START_DELAY_MS || 15_000);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    console.log("[CashlogyState] scheduler disabled");
    return;
  }

  let running = false;
  const capture = async () => {
    if (running) return;
    running = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      await fetch(`http://127.0.0.1:${port}/cashlogy/state`, { signal: controller.signal });
    } catch (error) {
      await recordCashlogyStateError(error);
    } finally {
      clearTimeout(timeout);
      running = false;
    }
  };

  setTimeout(capture, startupDelayMs);
  setInterval(capture, intervalMs);
  console.log(`[CashlogyState] scheduler active every ${Math.round(intervalMs / 1000)}s`);
}

module.exports = {
  recordCashlogyStateSnapshot,
  recordCashlogyStateError,
  startCashlogyStateSnapshotScheduler,
};
