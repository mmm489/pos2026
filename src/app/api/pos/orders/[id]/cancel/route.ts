import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getAuthenticatedEmployee } from "@/lib/pos-session";
import { getPusherServer, CHANNEL_ORDERS, EVENT_ORDER_UPDATED } from "@/lib/pusher";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const employee = await getAuthenticatedEmployee(request);
    if (!employee) {
      return NextResponse.json({ error: "Sessio no valida" }, { status: 401 });
    }

    const id = Number.parseInt(params.id, 10);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "ID invalid" }, { status: 400 });
    }

    const body = (await request.json()) as { reason?: string };
    const reason = String(body.reason || "").trim();
    if (!reason) {
      return NextResponse.json(
        { error: "Cal indicar un motiu d'anul·lacio" },
        { status: 400 },
      );
    }

    const sql = getDb();
    const [current] = await sql`
      SELECT id, status, payment_method, invoice_number
      FROM pos.orders
      WHERE id = ${id}
    `;

    if (!current) {
      return NextResponse.json({ error: "Comanda no trobada" }, { status: 404 });
    }
    if (current.status === "cancelled") {
      return NextResponse.json(
        { error: "Aquesta comanda ja esta anul·lada" },
        { status: 400 },
      );
    }
    if (current.invoice_number) {
      return NextResponse.json(
        {
          error:
            current.payment_method === "card"
              ? "Una venda amb factura emesa no es pot anul·lar. Utilitza Devolver productos per crear una factura rectificativa."
              : "Una venda amb factura emesa no es pot anul·lar des d'aquesta opcio.",
        },
        { status: 409 },
      );
    }

    const [updated] = await sql`
      UPDATE pos.orders
      SET status = 'cancelled',
          cancelled_at = NOW(),
          cancellation_reason = ${reason},
          cancelled_by = ${employee.id}
      WHERE id = ${id}
        AND invoice_number IS NULL
      RETURNING id, order_number, invoice_number, status, total, payment_method,
                employee_id, table_number, created_at, completed_at,
                cancelled_at, cancellation_reason, cancelled_by,
                card_reference, card_authorization, refund_reference, refund_at
    `;

    if (!updated) {
      return NextResponse.json(
        { error: "La comanda ha canviat. Torna a carregar-la." },
        { status: 409 },
      );
    }

    await sql`
      INSERT INTO pos.kds_events (order_id, event_type)
      VALUES (${id}, 'cancelled')
    `;

    try {
      const pusher = getPusherServer();
      await pusher.trigger(CHANNEL_ORDERS, EVENT_ORDER_UPDATED, {
        id: updated.id,
        status: "cancelled",
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Pusher emit error:", error);
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error cancelling order:", error);
    return NextResponse.json(
      { error: "Error al anul·lar la comanda" },
      { status: 500 },
    );
  }
}
