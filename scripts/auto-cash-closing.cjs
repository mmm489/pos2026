const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const args = new Set(process.argv.slice(2));
const repoRoot = path.resolve(__dirname, "..");
const logFile = path.join(__dirname, "auto-cash-closing.log");
const dryRun = args.has("--dry-run") || !args.has("--execute");
const printEnabled = !args.has("--no-print");
const allowOutsideWindow = args.has("--allow-outside-window");
const recoverMissed = args.has("--recover-missed");
const explicitUntil = getArgValue("--until");

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(logFile, `${line}\n`, "utf8");
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key]) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function isAutoClosingWindow(date = new Date()) {
  const hour = date.getHours();
  return hour >= 2 && hour < 4;
}

function formatZLabel(zNumber, year) {
  return `Z-${year}/${String(zNumber).padStart(6, "0")}`;
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const inline = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return null;
}

function previousThreeAmCutoff(date = new Date()) {
  const cutoff = new Date(date);
  cutoff.setHours(3, 0, 0, 0);
  if (date <= cutoff) {
    cutoff.setDate(cutoff.getDate() - 1);
  }
  return cutoff;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

async function ensureSchema(client) {
  await client.query(`ALTER TABLE pos.business ADD COLUMN IF NOT EXISTS next_z_number INTEGER NOT NULL DEFAULT 1`);
  await client.query(`ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS business_unit VARCHAR(20) NOT NULL DEFAULT 'hicream'`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_business_unit ON pos.orders(business_unit)`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS pos.supplier_payments (
      id SERIAL PRIMARY KEY,
      supplier_name VARCHAR(160) NOT NULL,
      amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
      reason TEXT,
      employee_id INTEGER REFERENCES pos.employees(id),
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'dispensed', 'error', 'cancelled')),
      cashlogy_result JSONB,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      dispensed_at TIMESTAMPTZ,
      synced BOOLEAN NOT NULL DEFAULT false
    )
  `);
  await client.query(`
    ALTER TABLE pos.cash_closings
    ADD COLUMN IF NOT EXISTS supplier_payments_total NUMERIC(10,2) NOT NULL DEFAULT 0
  `);
  await client.query(`
    ALTER TABLE pos.cash_closings
    ADD COLUMN IF NOT EXISTS supplier_payments_count INTEGER NOT NULL DEFAULT 0
  `);
  await client.query(`
    ALTER TABLE pos.cash_closings
    ADD COLUMN IF NOT EXISTS expected_cash_after_supplier_payments NUMERIC(10,2) NOT NULL DEFAULT 0
  `);
  await client.query(`
    ALTER TABLE pos.cash_closings
    ADD COLUMN IF NOT EXISTS supplier_payments_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
}

async function computeSummary(client, since, until = null) {
  const params = until ? [since, until] : [since];
  const untilOrderClause = until ? " AND o.created_at < $2::timestamptz" : "";
  const untilItemClause = until ? " AND o.created_at < $2::timestamptz" : "";
  const untilSupplierClause = until ? " AND created_at < $2::timestamptz" : "";
  const untilRefundClause = until ? " AND r.completed_at < $2::timestamptz" : "";
  const activeWhere =
    `o.created_at >= $1::timestamptz${untilOrderClause} AND o.status NOT IN ('pending', 'cancelled') AND o.payment_method <> 'parked' AND COALESCE(o.business_unit, 'hicream') = 'hicream'`;

  const totalsRes = await client.query(
    `SELECT
       COALESCE(SUM(CASE WHEN o.payment_method = 'cash' THEN o.total END), 0)::float AS total_cash,
       COALESCE(SUM(CASE WHEN o.payment_method IN ('card', 'manual') THEN o.total END), 0)::float AS total_card,
       COALESCE(SUM(o.total), 0)::float AS total_sales,
       COALESCE(SUM(o.total_base), 0)::float AS total_base,
       COALESCE(SUM(o.total_vat), 0)::float AS total_vat,
       COUNT(*)::int AS ticket_count,
       COUNT(*) FILTER (WHERE o.payment_method = 'cash')::int AS cash_count,
       COUNT(*) FILTER (WHERE o.payment_method IN ('card', 'manual'))::int AS card_count
     FROM pos.orders o
     WHERE ${activeWhere}`,
    params
  );
  const totals = totalsRes.rows[0];

  const vatRows = await client.query(
    `SELECT
       oi.vat_rate::float AS vat_rate,
       SUM(oi.qty * oi.unit_price / (1 + oi.vat_rate / 100.0))::float AS base,
       SUM(oi.qty * oi.unit_price - oi.qty * oi.unit_price / (1 + oi.vat_rate / 100.0))::float AS vat,
       SUM(oi.qty * oi.unit_price)::float AS total
     FROM pos.order_items oi
     JOIN pos.orders o ON o.id = oi.order_id
     WHERE ${activeWhere}
     GROUP BY oi.vat_rate
     ORDER BY oi.vat_rate`,
    params
  );
  const vatBreakdown = {};
  for (const row of vatRows.rows) {
    vatBreakdown[String(row.vat_rate)] = {
      base: roundMoney(row.base),
      vat: roundMoney(row.vat),
      total: roundMoney(row.total),
    };
  }

  const cancelledStatsRes = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE o.status = 'cancelled')::int AS cancelled_count,
       COALESCE(SUM(CASE WHEN o.refund_reference IS NOT NULL THEN o.total END), 0)::float AS total_refunded
     FROM pos.orders o
     WHERE o.created_at >= $1::timestamptz${untilOrderClause} AND o.status = 'cancelled'
       AND COALESCE(o.business_unit, 'hicream') = 'hicream'`,
    params
  );
  const cancelledStats = cancelledStatsRes.rows[0];

  const refundStatsRes = await client.query(
    `SELECT COALESCE(SUM(r.amount), 0)::float AS amount,
            COALESCE(SUM(CASE WHEN o.payment_method = 'cash' THEN r.amount ELSE 0 END), 0)::float AS cash_amount,
            COALESCE(SUM(CASE WHEN o.payment_method IN ('card', 'manual') THEN r.amount ELSE 0 END), 0)::float AS card_amount,
            COALESCE(SUM(r.total_base), 0)::float AS total_base,
            COALESCE(SUM(r.total_vat), 0)::float AS total_vat
     FROM pos.refunds r
     JOIN pos.orders o ON o.id = r.order_id
     WHERE r.status = 'completed'
       AND r.completed_at >= $1::timestamptz${untilRefundClause}
       AND COALESCE(o.business_unit, 'hicream') = 'hicream'`,
    params
  );
  const refundStats = refundStatsRes.rows[0];

  const refundVatRows = await client.query(
    `SELECT ri.vat_rate::float AS vat_rate,
            SUM(ri.qty * ri.unit_price / (1 + ri.vat_rate / 100.0))::float AS base,
            SUM(ri.qty * ri.unit_price - ri.qty * ri.unit_price / (1 + ri.vat_rate / 100.0))::float AS vat,
            SUM(ri.qty * ri.unit_price)::float AS total
     FROM pos.refund_items ri
     JOIN pos.refunds r ON r.id = ri.refund_id
     JOIN pos.orders o ON o.id = r.order_id
     WHERE r.status = 'completed'
       AND r.completed_at >= $1::timestamptz${untilRefundClause}
       AND COALESCE(o.business_unit, 'hicream') = 'hicream'
     GROUP BY ri.vat_rate`,
    params
  );
  for (const row of refundVatRows.rows) {
    const key = String(row.vat_rate);
    const current = vatBreakdown[key] || { base: 0, vat: 0, total: 0 };
    vatBreakdown[key] = {
      base: roundMoney(current.base - row.base),
      vat: roundMoney(current.vat - row.vat),
      total: roundMoney(current.total - row.total),
    };
  }

  const rangeRes = await client.query(
    `SELECT
       (SELECT invoice_number FROM pos.orders
        WHERE created_at >= $1::timestamptz${untilItemClause} AND status NOT IN ('pending', 'cancelled') AND invoice_number IS NOT NULL
          AND COALESCE(business_unit, 'hicream') = 'hicream'
        ORDER BY created_at ASC LIMIT 1) AS first_invoice,
       (SELECT invoice_number FROM pos.orders
        WHERE created_at >= $1::timestamptz${untilItemClause} AND status NOT IN ('pending', 'cancelled') AND invoice_number IS NOT NULL
          AND COALESCE(business_unit, 'hicream') = 'hicream'
        ORDER BY created_at DESC LIMIT 1) AS last_invoice`,
    params
  );
  const range = rangeRes.rows[0];

  const supplierPaymentsRes = await client.query(
    `SELECT id, supplier_name, amount::float AS amount, reason, created_at
     FROM pos.supplier_payments
     WHERE created_at >= $1::timestamptz${untilSupplierClause}
       AND status = 'dispensed'
     ORDER BY created_at ASC`,
    params
  );
  const supplierPayments = supplierPaymentsRes.rows;
  const supplierPaymentsTotal = roundMoney(
    supplierPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  );

  return {
    total_cash: roundMoney(totals.total_cash - refundStats.cash_amount),
    total_card: roundMoney(totals.total_card - refundStats.card_amount),
    total_sales: roundMoney(totals.total_sales - refundStats.amount),
    total_base: roundMoney(totals.total_base - refundStats.total_base),
    total_vat: roundMoney(totals.total_vat - refundStats.total_vat),
    vat_breakdown: vatBreakdown,
    ticket_count: Number(totals.ticket_count || 0),
    cash_count: Number(totals.cash_count || 0),
    card_count: Number(totals.card_count || 0),
    cancelled_count: Number(cancelledStats.cancelled_count || 0),
    total_refunded: roundMoney(Number(cancelledStats.total_refunded || 0) + Number(refundStats.amount || 0)),
    supplier_payments_total: supplierPaymentsTotal,
    supplier_payments_count: supplierPayments.length,
    expected_cash_after_supplier_payments: roundMoney(Number(totals.total_cash || 0) - Number(refundStats.cash_amount || 0) - supplierPaymentsTotal),
    supplier_payments: supplierPayments,
    first_invoice: range.first_invoice || null,
    last_invoice: range.last_invoice || null,
  };
}

function hasMovement(summary) {
  return (
    summary.ticket_count > 0 ||
    summary.cancelled_count > 0 ||
    summary.supplier_payments_count > 0 ||
    summary.total_sales !== 0 ||
    summary.total_refunded !== 0
  );
}

async function printClosing(closing) {
  const bridgeUrl = (process.env.BRIDGE_URL || process.env.NEXT_PUBLIC_BRIDGE_URL || "http://127.0.0.1:3006").replace(
    /\/$/,
    ""
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${bridgeUrl}/printer/z-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(closing),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      return { success: false, error: data?.error || `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error?.name === "AbortError" ? "Timeout imprimiendo Z" : error?.message || "Error imprimiendo Z",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  loadEnvFile(path.join(repoRoot, ".env.local"));

  if (!process.env.NEON_DATABASE_URL) {
    throw new Error("Falta NEON_DATABASE_URL en el entorno o en .env.local");
  }

  if (!dryRun && !allowOutsideWindow && !recoverMissed && !explicitUntil && !isAutoClosingWindow()) {
    log("Fuera de la ventana automatica 02:00-03:59. No se crea cierre.");
    return;
  }

  const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureSchema(client);

    const lastRes = await client.query(`SELECT closed_at FROM pos.cash_closings ORDER BY closed_at DESC LIMIT 1`);
    const since = lastRes.rows[0]?.closed_at || new Date().toISOString().split("T")[0] + "T00:00:00Z";
    const recoverCutoff = recoverMissed ? (explicitUntil ? new Date(explicitUntil) : previousThreeAmCutoff()) : null;

    if (recoverCutoff && new Date(since) >= recoverCutoff) {
      await client.query("ROLLBACK");
      log(`No hay cierre pendiente antes de ${recoverCutoff.toISOString()}. Ultimo cierre: ${new Date(since).toISOString()}`);
      return;
    }

    const closingUntil = explicitUntil || (recoverCutoff ? recoverCutoff.toISOString() : null);
    const closedAt = closingUntil || new Date().toISOString();
    const summary = await computeSummary(client, since, closingUntil);

    log(
      `${dryRun ? "DRY-RUN" : recoverMissed ? "RECOVERY" : "AUTO"} desde ${new Date(since).toISOString()}` +
        `${closingUntil ? ` hasta ${new Date(closingUntil).toISOString()}` : ""}: ` +
        `${summary.ticket_count} tickets, total ${summary.total_sales.toFixed(2)} EUR, ` +
        `${summary.supplier_payments_count} pagos proveedores`
    );

    if (!hasMovement(summary)) {
      await client.query("ROLLBACK");
      log("Sin movimientos desde el ultimo cierre. No se crea Z.");
      return;
    }

    if (dryRun) {
      await client.query("ROLLBACK");
      log("Modo prueba: no se ha creado ningun cierre.");
      return;
    }

    const zRes = await client.query(
      `UPDATE pos.business
       SET next_z_number = next_z_number + 1
       RETURNING next_z_number - 1 AS z_number`
    );
    const zNumber = Number(zRes.rows[0].z_number);
    const zLabel = formatZLabel(zNumber, new Date(closedAt).getFullYear());

    const bizRes = await client.query(
      `SELECT name, trade_name, nif, address, city, postal_code, province, phone, invoice_series
       FROM pos.business LIMIT 1`
    );
    const businessSnapshot = bizRes.rows[0] || null;
    const notes =
      process.env.HICREAM_AUTO_CLOSING_NOTES ||
      (recoverMissed ? "Cierre recuperado por fallo de tarea automatica 03:00. Sin impresion." : "Cierre automatico 03:00");

    const insertRes = await client.query(
      `INSERT INTO pos.cash_closings
        (employee_id, opened_at, closed_at,
         total_cash, total_card, total_sales,
         total_base, total_vat, vat_breakdown,
         ticket_count, cash_count, card_count,
         cancelled_count, total_refunded,
         supplier_payments_total, supplier_payments_count,
         expected_cash_after_supplier_payments, supplier_payments_snapshot,
         first_invoice, last_invoice,
         z_number, z_label, business_snapshot, notes)
       VALUES (NULL, $1::timestamptz, $2::timestamptz,
               $3, $4, $5,
               $6, $7, $8::jsonb,
               $9, $10, $11,
               $12, $13,
               $14, $15,
               $16, $17::jsonb,
               $18, $19,
               $20, $21, $22::jsonb, $23)
       RETURNING *`,
      [
        since,
        closedAt,
        summary.total_cash,
        summary.total_card,
        summary.total_sales,
        summary.total_base,
        summary.total_vat,
        JSON.stringify(summary.vat_breakdown),
        summary.ticket_count,
        summary.cash_count,
        summary.card_count,
        summary.cancelled_count,
        summary.total_refunded,
        summary.supplier_payments_total,
        summary.supplier_payments_count,
        summary.expected_cash_after_supplier_payments,
        JSON.stringify(summary.supplier_payments),
        summary.first_invoice,
        summary.last_invoice,
        zNumber,
        zLabel,
        JSON.stringify(businessSnapshot),
        notes,
      ]
    );

    await client.query("COMMIT");
    const closing = insertRes.rows[0];
    log(`Cierre creado: ${closing.z_label || zLabel} total ${Number(closing.total_sales || 0).toFixed(2)} EUR`);

    if (printEnabled) {
      const printResult = await printClosing(closing);
      if (printResult.success) {
        log(`Z impreso correctamente: ${closing.z_label || zLabel}`);
      } else {
        log(`Cierre creado, pero no se pudo imprimir Z: ${printResult.error}`);
      }
    } else {
      log("Impresion desactivada por parametro --no-print.");
    }
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  log(`ERROR: ${error.message || error}`);
  process.exitCode = 1;
});
