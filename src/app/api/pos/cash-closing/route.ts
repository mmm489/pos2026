import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();

    // Get the last closing time (or start of day)
    const [lastClosing] = await sql`
      SELECT closed_at FROM pos.cash_closings
      ORDER BY closed_at DESC LIMIT 1
    `;
    const since = lastClosing?.closed_at as string || new Date().toISOString().split("T")[0] + "T00:00:00Z";

    // Summary since last closing
    const [summary] = await sql`
      SELECT
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total END), 0)::float AS total_cash,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total END), 0)::float AS total_card,
        COALESCE(SUM(total), 0)::float AS total_sales,
        COUNT(*)::int AS ticket_count
      FROM pos.orders
      WHERE created_at >= ${since}::timestamptz AND status != 'pending'
    `;

    // By employee
    const byEmployee = await sql`
      SELECT e.name, COUNT(o.id)::int AS tickets, COALESCE(SUM(o.total), 0)::float AS total
      FROM pos.orders o
      JOIN pos.employees e ON e.id = o.employee_id
      WHERE o.created_at >= ${since}::timestamptz AND o.status != 'pending'
      GROUP BY e.name
      ORDER BY total DESC
    `;

    // Top products
    const topProducts = await sql`
      SELECT p.name, SUM(oi.qty)::int AS qty, SUM(oi.qty * oi.unit_price)::float AS revenue
      FROM pos.order_items oi
      JOIN pos.products p ON p.id = oi.product_id
      JOIN pos.orders o ON o.id = oi.order_id
      WHERE o.created_at >= ${since}::timestamptz AND o.status != 'pending'
      GROUP BY p.name
      ORDER BY qty DESC
      LIMIT 20
    `;

    return NextResponse.json({
      since,
      total_cash: summary.total_cash,
      total_card: summary.total_card,
      total_sales: summary.total_sales,
      ticket_count: summary.ticket_count,
      ticket_medio: (summary.ticket_count as number) > 0 ? Math.round(((summary.total_sales as number) / (summary.ticket_count as number)) * 100) / 100 : 0,
      by_employee: byEmployee,
      top_products: topProducts,
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
    const sql = getDb();
    const body = await request.json();
    const { employee_id, notes } = body;

    // Get the last closing time
    const [lastClosing] = await sql`
      SELECT closed_at FROM pos.cash_closings
      ORDER BY closed_at DESC LIMIT 1
    `;
    const since = lastClosing?.closed_at as string || new Date().toISOString().split("T")[0] + "T00:00:00Z";

    // Calculate totals
    const [summary] = await sql`
      SELECT
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total END), 0)::float AS total_cash,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total END), 0)::float AS total_card,
        COALESCE(SUM(total), 0)::float AS total_sales,
        COUNT(*)::int AS ticket_count
      FROM pos.orders
      WHERE created_at >= ${since}::timestamptz AND status != 'pending'
    `;

    // Create closing record
    const closingNotes = notes || null;
    const [closing] = await sql`
      INSERT INTO pos.cash_closings (employee_id, opened_at, total_cash, total_card, total_sales, ticket_count, notes)
      VALUES (${employee_id}, ${since}::timestamptz, ${summary.total_cash}, ${summary.total_card}, ${summary.total_sales}, ${summary.ticket_count}, ${closingNotes})
      RETURNING *
    `;

    return NextResponse.json(closing, { status: 201 });
  } catch (error) {
    console.error("Error creating cash closing:", error);
    return NextResponse.json(
      { error: "Error al cerrar caja" },
      { status: 500 }
    );
  }
}
