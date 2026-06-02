import { NextRequest, NextResponse } from "next/server";
import { getDb, rawQuery, withTransaction } from "@/lib/db";
import { ensureSupplierPaymentsSchema } from "@/lib/supplier-payments";
import type { PoolClient } from "pg";
import type { VatBreakdown } from "@/types/pos";

export const dynamic = "force-dynamic";

/**
 * Compute the cash-closing summary covering the period since the previous Z.
 * Used for both the preview (GET) and the actual closing (POST inside a transaction).
 */
async function computeSummary(
  client: PoolClient | null,
  since: string
): Promise<{
  total_cash: number;
  total_card: number;
  total_sales: number;
  total_base: number;
  total_vat: number;
  vat_breakdown: VatBreakdown;
  ticket_count: number;
  cash_count: number;
  card_count: number;
  cancelled_count: number;
  total_refunded: number;
  supplier_payments_total: number;
  supplier_payments_count: number;
  expected_cash_after_supplier_payments: number;
  supplier_payments: {
    id: number;
    supplier_name: string;
    amount: number;
    reason: string | null;
    created_at: string;
  }[];
  first_invoice: string | null;
  last_invoice: string | null;
  by_employee: { name: string; tickets: number; total: number }[];
  top_products: { name: string; qty: number; revenue: number }[];
}> {
  const exec = async <T>(text: string, values: unknown[]): Promise<T[]> => {
    if (client) {
      const r = await client.query(text, values);
      return r.rows as T[];
    }
    return rawQuery<T>(text, values);
  };

  // Active orders only (exclude pending and cancelled).
  const activeWhere = `o.created_at >= $1::timestamptz AND o.status NOT IN ('pending', 'cancelled') AND o.payment_method <> 'parked'`;

  const [totals] = await exec<{
    total_cash: number;
    total_card: number;
    total_sales: number;
    total_base: number;
    total_vat: number;
    ticket_count: number;
    cash_count: number;
    card_count: number;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN o.payment_method = 'cash' THEN o.total END), 0)::float AS total_cash,
       COALESCE(SUM(CASE WHEN o.payment_method = 'card' THEN o.total END), 0)::float AS total_card,
       COALESCE(SUM(o.total), 0)::float AS total_sales,
       COALESCE(SUM(o.total_base), 0)::float AS total_base,
       COALESCE(SUM(o.total_vat), 0)::float AS total_vat,
       COUNT(*)::int AS ticket_count,
       COUNT(*) FILTER (WHERE o.payment_method = 'cash')::int AS cash_count,
       COUNT(*) FILTER (WHERE o.payment_method = 'card')::int AS card_count
     FROM pos.orders o
     WHERE ${activeWhere}`,
    [since]
  );

  // Per-rate VAT breakdown computed from order_items so we can split mixed VAT tickets.
  const vatRows = await exec<{ vat_rate: number; base: number; vat: number; total: number }>(
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
    [since]
  );
  const vat_breakdown: VatBreakdown = {};
  for (const r of vatRows) {
    vat_breakdown[String(r.vat_rate)] = {
      base: Math.round(r.base * 100) / 100,
      vat: Math.round(r.vat * 100) / 100,
      total: Math.round(r.total * 100) / 100,
    };
  }

  const [cancelledStats] = await exec<{ cancelled_count: number; total_refunded: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE o.status = 'cancelled')::int AS cancelled_count,
       COALESCE(SUM(CASE WHEN o.refund_reference IS NOT NULL THEN o.total END), 0)::float AS total_refunded
     FROM pos.orders o
     WHERE o.created_at >= $1::timestamptz AND o.status = 'cancelled'`,
    [since]
  );

  const [range] = await exec<{ first_invoice: string | null; last_invoice: string | null }>(
    `SELECT
       (SELECT invoice_number FROM pos.orders
        WHERE created_at >= $1::timestamptz AND status NOT IN ('pending', 'cancelled') AND invoice_number IS NOT NULL
        ORDER BY created_at ASC LIMIT 1) AS first_invoice,
       (SELECT invoice_number FROM pos.orders
        WHERE created_at >= $1::timestamptz AND status NOT IN ('pending', 'cancelled') AND invoice_number IS NOT NULL
        ORDER BY created_at DESC LIMIT 1) AS last_invoice`,
    [since]
  );

  const byEmployee = await exec<{ name: string; tickets: number; total: number }>(
    `SELECT e.name, COUNT(o.id)::int AS tickets, COALESCE(SUM(o.total), 0)::float AS total
     FROM pos.orders o
     JOIN pos.employees e ON e.id = o.employee_id
     WHERE ${activeWhere}
     GROUP BY e.name
     ORDER BY total DESC`,
    [since]
  );

  const topProducts = await exec<{ name: string; qty: number; revenue: number }>(
    `SELECT p.name, SUM(oi.qty)::int AS qty, SUM(oi.qty * oi.unit_price)::float AS revenue
     FROM pos.order_items oi
     JOIN pos.products p ON p.id = oi.product_id
     JOIN pos.orders o ON o.id = oi.order_id
     WHERE ${activeWhere}
     GROUP BY p.name
     ORDER BY qty DESC
     LIMIT 20`,
    [since]
  );

  const supplierPayments = await exec<{
    id: number;
    supplier_name: string;
    amount: number;
    reason: string | null;
    created_at: string;
  }>(
    `SELECT id, supplier_name, amount::float AS amount, reason, created_at
     FROM pos.supplier_payments
     WHERE created_at >= $1::timestamptz
       AND status = 'dispensed'
     ORDER BY created_at ASC`,
    [since]
  );
  const supplierPaymentsTotal =
    Math.round(supplierPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) * 100) / 100;

  return {
    total_cash: totals.total_cash,
    total_card: totals.total_card,
    total_sales: totals.total_sales,
    total_base: totals.total_base,
    total_vat: totals.total_vat,
    vat_breakdown,
    ticket_count: totals.ticket_count,
    cash_count: totals.cash_count,
    card_count: totals.card_count,
    cancelled_count: cancelledStats.cancelled_count,
    total_refunded: cancelledStats.total_refunded,
    supplier_payments_total: supplierPaymentsTotal,
    supplier_payments_count: supplierPayments.length,
    expected_cash_after_supplier_payments:
      Math.round((Number(totals.total_cash || 0) - supplierPaymentsTotal) * 100) / 100,
    supplier_payments: supplierPayments,
    first_invoice: range.first_invoice,
    last_invoice: range.last_invoice,
    by_employee: byEmployee,
    top_products: topProducts,
  };
}

function formatZLabel(zNumber: number, year: number): string {
  return `Z-${year}/${String(zNumber).padStart(6, "0")}`;
}

export async function GET() {
  try {
    const sql = getDb();
    await ensureSupplierPaymentsSchema();

    const [lastClosing] = await sql`
      SELECT closed_at FROM pos.cash_closings
      ORDER BY closed_at DESC LIMIT 1
    `;
    const since = (lastClosing?.closed_at as string) ||
      new Date().toISOString().split("T")[0] + "T00:00:00Z";

    const [biz] = await sql`SELECT next_z_number FROM pos.business LIMIT 1`;
    const nextZNumber = (biz?.next_z_number as number) ?? 1;
    const next_z_label = formatZLabel(nextZNumber, new Date().getFullYear());

    const summary = await computeSummary(null, since);

    const ticketMedio = summary.ticket_count > 0
      ? Math.round((summary.total_sales / summary.ticket_count) * 100) / 100
      : 0;

    return NextResponse.json({
      since,
      next_z_label,
      ticket_medio: ticketMedio,
      ...summary,
    });
  } catch (error) {
    console.error("Error fetching cash closing data:", error);
    return NextResponse.json(
      { error: "Error al obtener datos de cierre" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { employee_id, notes } = body;
    const closingNotes = notes || null;

    const closing = await withTransaction(async (client) => {
      await ensureSupplierPaymentsSchema(client);

      // Find the cutoff: last closing or start-of-day fallback.
      const lastRes = await client.query(
        `SELECT closed_at FROM pos.cash_closings ORDER BY closed_at DESC LIMIT 1`
      );
      const since: string =
        (lastRes.rows[0]?.closed_at as string) ||
        new Date().toISOString().split("T")[0] + "T00:00:00Z";

      // Atomically allocate the next Z number.
      const zRes = await client.query(
        `UPDATE pos.business
           SET next_z_number = next_z_number + 1
         RETURNING next_z_number - 1 AS z_number`
      );
      const zNumber: number = zRes.rows[0].z_number;
      const zLabel = formatZLabel(zNumber, new Date().getFullYear());

      // Compute totals inside the same transaction so concurrent INSERTs are isolated.
      const summary = await computeSummary(client, since);

      // Capture immutable business snapshot.
      const bizRes = await client.query(
        `SELECT name, trade_name, nif, address, city, postal_code, province, phone, invoice_series
         FROM pos.business LIMIT 1`
      );
      const businessSnapshot = bizRes.rows[0] || null;

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
         VALUES ($1, $2::timestamptz, NOW(),
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
          employee_id || null,
          since,
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
          closingNotes,
        ]
      );
      return insertRes.rows[0];
    });

    return NextResponse.json(closing, { status: 201 });
  } catch (error) {
    console.error("Error creating cash closing:", error);
    return NextResponse.json(
      { error: "Error al cerrar caja" },
      { status: 500 }
    );
  }
}
