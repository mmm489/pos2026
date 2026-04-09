import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getPusherServer, CHANNEL_ORDERS, EVENT_ORDER_UPDATED } from "@/lib/pusher";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 });
    }

    const body = await request.json();
    const { reason, employee_id } = body;

    if (!reason) {
      return NextResponse.json(
        { error: "Cal indicar un motiu d'anul·lació" },
        { status: 400 }
      );
    }

    const sql = getDb();

    // Check current order
    const [current] = await sql`
      SELECT id, status FROM pos.orders WHERE id = ${id}
    `;

    if (!current) {
      return NextResponse.json(
        { error: "Comanda no trobada" },
        { status: 404 }
      );
    }

    if (current.status === "cancelled") {
      return NextResponse.json(
        { error: "Aquesta comanda ja està anul·lada" },
        { status: 400 }
      );
    }

    const cancelledBy = employee_id || null;

    // Cancel the order
    const [updated] = await sql`
      UPDATE pos.orders
      SET status = 'cancelled',
          cancelled_at = NOW(),
          cancellation_reason = ${reason},
          cancelled_by = ${cancelledBy}
      WHERE id = ${id}
      RETURNING id, order_number, invoice_number, status, total, payment_method,
                employee_id, table_number, created_at, completed_at,
                cancelled_at, cancellation_reason, cancelled_by
    `;

    // Log KDS event
    await sql`
      INSERT INTO pos.kds_events (order_id, event_type)
      VALUES (${id}, 'cancelled')
    `;

    // Emit real-time event
    try {
      const pusher = getPusherServer();
      await pusher.trigger(CHANNEL_ORDERS, EVENT_ORDER_UPDATED, {
        id: updated.id,
        status: "cancelled",
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error("Pusher emit error:", e);
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error cancelling order:", error);
    return NextResponse.json(
      { error: "Error al anul·lar la comanda" },
      { status: 500 }
    );
  }
}
