// Persistent log of card datafono operations. Writes to pos.card_transactions
// using LOCAL_DATABASE_URL. Best-effort: if the DB is down or the env var is
// missing, we just warn — we never want logging to block a real payment.

const { Pool } = require("pg");

let pool = null;

function getPool() {
  if (pool) return pool;
  const url = process.env.LOCAL_DATABASE_URL;
  if (!url) return null;
  pool = new Pool({ connectionString: url, max: 2 });
  return pool;
}

/**
 * Persist one card-datafono interaction.
 *
 * @param {object} entry
 * @param {string} entry.operation - "charge" | "refund" | "cancel" | "query" | "abort"
 * @param {object} entry.request   - the body we sent to the card provider
 * @param {object} entry.response  - the body we got back
 * @param {number} entry.durationMs
 */
async function log(entry) {
  const p = getPool();
  if (!p) {
    console.warn("[TxLog] LOCAL_DATABASE_URL not set — skipping log");
    return;
  }
  const r = entry.request || {};
  const s = entry.response || {};

  // Never store the full receipt text in the audit log — it can contain card
  // PAN remnants and bloats the table. Reference + auth code are enough for
  // reconciliation; the full receipt is already on pos.orders.card_receipt_text.
  const sanitizedResponse = { ...s };
  if (sanitizedResponse.receipt) sanitizedResponse.receipt = "[stored on orders]";

  try {
    await p.query(
      `INSERT INTO pos.card_transactions
        (operation, amount, reference, original_reference, success,
         response_code, authorization_code, error_message,
         request, response, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11)`,
      [
        entry.operation,
        r.amount ?? null,
        s.reference || r.orderId || null,
        r.originalReference || null,
        Boolean(s.success),
        s.responseCode || null,
        s.authorizationCode || null,
        s.error || null,
        JSON.stringify(r),
        JSON.stringify(sanitizedResponse),
        entry.durationMs || null,
      ]
    );
  } catch (err) {
    console.error("[TxLog] Insert failed:", err.message);
  }
}

module.exports = { log };
