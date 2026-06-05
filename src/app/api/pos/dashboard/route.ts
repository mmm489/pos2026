import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql = getDb();

    const [
      [salesToday],
      salesByHour,
      topProducts,
      [paymentMethods],
      [activeOrders],
    ] = await Promise.all([
      // Total sales today
      sql`
        SELECT COALESCE(SUM(total), 0)::float AS total, COUNT(*)::int AS count
        FROM pos.orders
        WHERE created_at::date = CURRENT_DATE AND status NOT IN ('pending', 'cancelled') AND payment_method <> 'parked'
      `,
      // Sales by hour
      sql`
        SELECT EXTRACT(HOUR FROM created_at)::int AS hour,
               COALESCE(SUM(total), 0)::float AS total,
               COUNT(*)::int AS count
        FROM pos.orders
        WHERE created_at::date = CURRENT_DATE AND status NOT IN ('pending', 'cancelled') AND payment_method <> 'parked'
        GROUP BY hour
        ORDER BY hour
      `,
      // Top 10 products
      sql`
        SELECT p.name, SUM(oi.qty)::int AS qty,
               SUM(oi.qty * oi.unit_price)::float AS revenue
        FROM pos.order_items oi
        JOIN pos.products p ON p.id = oi.product_id
        JOIN pos.orders o ON o.id = oi.order_id
        WHERE o.created_at::date = CURRENT_DATE AND o.status NOT IN ('pending', 'cancelled') AND o.payment_method <> 'parked'
        GROUP BY p.name
        ORDER BY qty DESC
        LIMIT 10
      `,
      // Payment method breakdown
      sql`
        SELECT
          COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total END), 0)::float AS efectivo,
          COALESCE(SUM(CASE WHEN payment_method IN ('card', 'manual') THEN total END), 0)::float AS tarjeta
        FROM pos.orders
        WHERE created_at::date = CURRENT_DATE AND status NOT IN ('pending', 'cancelled') AND payment_method <> 'parked'
      `,
      // Active orders count
      sql`
        SELECT COUNT(*)::int AS count
        FROM pos.orders
        WHERE status IN ('pending', 'preparing')
      `,
    ]);

    const count = Number(salesToday.count) || 0;
    const total = Number(salesToday.total) || 0;
    const ticketMedio = count > 0 ? total / count : 0;

    return NextResponse.json({
      ventas_hoy: { total: salesToday.total, count: salesToday.count },
      ventas_por_hora: salesByHour,
      top_productos: topProducts,
      metodo_pago: {
        efectivo: paymentMethods.efectivo,
        tarjeta: paymentMethods.tarjeta,
      },
      ticket_medio: Math.round(ticketMedio * 100) / 100,
      pedidos_activos: activeOrders.count,
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return NextResponse.json(
      { error: "Error al obtener datos del dashboard" },
      { status: 500 }
    );
  }
}
