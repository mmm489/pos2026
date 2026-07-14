import { NextRequest, NextResponse } from "next/server";

import { finalizeCardOrder } from "@/lib/card-orders";
import { rawQuery, withTransaction } from "@/lib/db";
import { ensurePostSaleSchema } from "@/lib/post-sale-schema";
import { getAuthenticatedEmployee } from "@/lib/pos-session";
import { CHANNEL_ORDERS, EVENT_NEW_ORDER, getPusherServer } from "@/lib/pusher";

export const dynamic = "force-dynamic";

function getBridgeUrl() {
  return (process.env.BRIDGE_URL || process.env.NEXT_PUBLIC_BRIDGE_URL || "http://127.0.0.1:3006").replace(/\/$/, "");
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const employee = await getAuthenticatedEmployee(request);
    if (!employee) return NextResponse.json({ error: "Sessio POS no valida" }, { status: 401 });
    if (!employee.can_post_sale_lookup) return NextResponse.json({ error: "No tens permis per comprovar pagaments" }, { status: 403 });
    await ensurePostSaleSchema();
    const orderId = Number(params.id);
    const [order] = await rawQuery<{
      id: number;
      total: string | number;
      cashless_operation_id: string | null;
      card_payment_status: string;
    }>(
      `SELECT id, total, cashless_operation_id, card_payment_status FROM pos.orders WHERE id = $1`,
      [orderId],
    );
    if (!order?.cashless_operation_id) {
      return NextResponse.json({ error: "Aquesta venda no te el UUID original de Comercia" }, { status: 400 });
    }
    const body = await request.json().catch(() => ({}));
    const response = await fetch(`${getBridgeUrl()}/ingenico/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference: order.cashless_operation_id, orderId: String(order.id) }),
      signal: AbortSignal.timeout(35_000),
    });
    const result = await response.json();

    await rawQuery(
      `INSERT INTO pos.post_sale_audit (order_id, employee_id, action, details)
       VALUES ($1, $2, 'card_payment_lookup', $3::jsonb)`,
      [orderId, employee.id, JSON.stringify({ operationId: order.cashless_operation_id, success: Boolean(result.success), result: result.result })],
    );

    if (body.reconcile === true && result.success && ["awaiting", "unknown"].includes(order.card_payment_status)) {
      const amount = Number(result.cashlessAmount);
      if (!Number.isFinite(amount) || Math.abs(amount - Number(order.total)) > 0.009) {
        return NextResponse.json({ error: "Comercia ha tornat un import diferent. No es pot regularitzar.", provider: result }, { status: 409 });
      }
      const reconciled = await withTransaction(async (client) => {
        await ensurePostSaleSchema(client);
        return finalizeCardOrder(client, {
          orderId,
          employeeId: employee.id,
          providerTransactionId: order.cashless_operation_id!,
          reference: String(result.cashlessTransactionNumber || result.reference || ""),
          authorizationCode: result.authorizationCode || null,
          responseCode: result.responseCode || null,
          receipt: result.receipt || null,
          peripheralId: result.cashlessPeripheralId || null,
          amount,
        });
      });
      if (!reconciled.was_parked) {
        try {
          await getPusherServer().trigger(CHANNEL_ORDERS, EVENT_NEW_ORDER, reconciled);
        } catch (error) {
          console.error("Pusher emit error after card recovery:", error);
        }
      }
      return NextResponse.json({ provider: result, reconciled });
    }
    return NextResponse.json({ provider: result, reconciled: null });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "No s'ha pogut comprovar el pagament" }, { status: 500 });
  }
}
