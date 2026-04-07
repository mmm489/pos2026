import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getPusherServer, CHANNEL_ORDERS, EVENT_ORDER_UPDATED } from "@/lib/pusher";

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["preparing"],
  preparing: ["ready"],
  ready: ["completed"],
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json(
        { error: "Falta el campo status" },
        { status: 400 }
      );
    }

    const sql = getDb();

    // Get current status
    const [current] = await sql`
      SELECT id, status FROM pos.orders WHERE id = ${id}
    `;

    if (!current) {
      return NextResponse.json(
        { error: "Pedido no encontrado" },
        { status: 404 }
      );
    }

    // Validate transition
    const allowed = VALID_TRANSITIONS[current.status as string];
    if (!allowed || !allowed.includes(status)) {
      return NextResponse.json(
        { error: `Transición no válida: ${current.status} → ${status}` },
        { status: 400 }
      );
    }

    const completedAt = status === "completed" ? new Date().toISOString() : null;

    const [updated] = await sql`
      UPDATE pos.orders
      SET status = ${status}, completed_at = ${completedAt}
      WHERE id = ${id}
      RETURNING id, order_number, status, total, payment_method, employee_id, created_at, completed_at
    `;

    // Log KDS event
    await sql`
      INSERT INTO pos.kds_events (order_id, event_type)
      VALUES (${id}, ${`status_${status}`})
    `;

    // Emit real-time event
    try {
      const pusher = getPusherServer();
      await pusher.trigger(CHANNEL_ORDERS, EVENT_ORDER_UPDATED, {
        id: updated.id,
        status: updated.status,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error("Pusher emit error:", e);
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating order status:", error);
    return NextResponse.json(
      { error: "Error al actualizar estado" },
      { status: 500 }
    );
  }
}
