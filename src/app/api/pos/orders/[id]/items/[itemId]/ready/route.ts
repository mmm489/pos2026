import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

let kdsReadyColumnsEnsured = false;

async function ensureKdsReadyColumns() {
  if (kdsReadyColumnsEnsured) return;
  const sql = getDb();
  await sql`
    ALTER TABLE pos.order_items
    ADD COLUMN IF NOT EXISTS kds_ready BOOLEAN NOT NULL DEFAULT false
  `;
  await sql`
    ALTER TABLE pos.order_items
    ADD COLUMN IF NOT EXISTS kds_ready_at TIMESTAMPTZ
  `;
  kdsReadyColumnsEnsured = true;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    await ensureKdsReadyColumns();

    const orderId = Number.parseInt(params.id, 10);
    const itemId = Number.parseInt(params.itemId, 10);
    if (Number.isNaN(orderId) || Number.isNaN(itemId)) {
      return NextResponse.json({ error: "ID invalido" }, { status: 400 });
    }

    const body = await request.json();
    const ready = Boolean(body.ready);
    const readyAt = ready ? new Date().toISOString() : null;
    const sql = getDb();

    const [updated] = await sql`
      UPDATE pos.order_items
      SET kds_ready = ${ready}, kds_ready_at = ${readyAt}
      WHERE id = ${itemId} AND order_id = ${orderId}
      RETURNING id, order_id, kds_ready, kds_ready_at
    `;

    if (!updated) {
      return NextResponse.json(
        { error: "Linea de pedido no encontrada" },
        { status: 404 }
      );
    }

    await sql`
      INSERT INTO pos.kds_events (order_id, event_type)
      VALUES (${orderId}, ${ready ? "item_ready" : "item_unready"})
    `;

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating KDS item:", error);
    return NextResponse.json(
      { error: "Error al actualizar linea KDS" },
      { status: 500 }
    );
  }
}
