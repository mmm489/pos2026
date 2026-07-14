import { NextRequest, NextResponse } from "next/server";

import { rawQuery } from "@/lib/db";
import { ensurePostSaleSchema } from "@/lib/post-sale-schema";
import { getAuthenticatedEmployee } from "@/lib/pos-session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const employee = await getAuthenticatedEmployee(request);
    if (!employee) return NextResponse.json({ error: "Sessio POS no valida" }, { status: 401 });
    await ensurePostSaleSchema();
    const orderId = Number(params.id);
    const body = await request.json();
    const status = body.status === "unknown" ? "unknown" : "failed";
    const rows = await rawQuery(
      `UPDATE pos.orders
       SET card_payment_status = $1, card_payment_error = $2, synced = false
       WHERE id = $3 AND card_payment_status IN ('awaiting', 'unknown')
       RETURNING id, card_payment_status, cashless_operation_id`,
      [status, String(body.error || "Operacio no completada").slice(0, 1000), orderId],
    );
    if (!rows[0]) return NextResponse.json({ error: "Comanda no actualitzable" }, { status: 409 });
    return NextResponse.json(rows[0]);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
