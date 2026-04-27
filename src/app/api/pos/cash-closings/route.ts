import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * List historical cash closings, most recent first. Optional ?month=YYYY-MM filter.
 * Returns lightweight rows for the admin index — full detail goes through /[id].
 */
export async function GET(request: NextRequest) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month"); // "2026-04"

    let rows;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const monthStart = `${month}-01T00:00:00Z`;
      // Add one month — Postgres handles overflow.
      rows = await sql`
        SELECT c.id, c.z_number, c.z_label, c.opened_at, c.closed_at,
               c.total_cash, c.total_card, c.total_sales,
               c.ticket_count, c.cancelled_count,
               c.first_invoice, c.last_invoice,
               e.name AS employee_name
        FROM pos.cash_closings c
        LEFT JOIN pos.employees e ON e.id = c.employee_id
        WHERE c.closed_at >= ${monthStart}::timestamptz
          AND c.closed_at < (${monthStart}::timestamptz + INTERVAL '1 month')
        ORDER BY c.closed_at DESC
      `;
    } else {
      rows = await sql`
        SELECT c.id, c.z_number, c.z_label, c.opened_at, c.closed_at,
               c.total_cash, c.total_card, c.total_sales,
               c.ticket_count, c.cancelled_count,
               c.first_invoice, c.last_invoice,
               e.name AS employee_name
        FROM pos.cash_closings c
        LEFT JOIN pos.employees e ON e.id = c.employee_id
        ORDER BY c.closed_at DESC
        LIMIT 100
      `;
    }

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Error listing cash closings:", error);
    return NextResponse.json(
      { error: "Error al listar cierres" },
      { status: 500 }
    );
  }
}
