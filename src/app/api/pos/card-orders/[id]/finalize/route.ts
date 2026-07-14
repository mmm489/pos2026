import { NextRequest, NextResponse } from "next/server";

import { finalizeCardOrder } from "@/lib/card-orders";
import { withTransaction } from "@/lib/db";
import { ensurePostSaleSchema } from "@/lib/post-sale-schema";
import { getPusherServer, CHANNEL_ORDERS, EVENT_NEW_ORDER } from "@/lib/pusher";
import { getAuthenticatedEmployee } from "@/lib/pos-session";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const employee = await getAuthenticatedEmployee(request);
    if (!employee) return NextResponse.json({ error: "Sessio POS no valida. Torna a entrar amb PIN." }, { status: 401 });
    const body = await request.json();
    const orderId = Number(params.id);
    const providerTransactionId = String(body.provider_transaction_id || "");
    const reference = String(body.reference || "");
    const amount = Number(body.amount);
    if (!Number.isInteger(orderId) || !providerTransactionId || !reference || !Number.isFinite(amount)) {
      return NextResponse.json({ error: "Resposta de Comercia incompleta" }, { status: 400 });
    }

    const order = await withTransaction(async (client) => {
      await ensurePostSaleSchema(client);
      const completed = await finalizeCardOrder(client, {
        orderId,
        employeeId: employee.id,
        providerTransactionId,
        reference,
        authorizationCode: body.authorization_code || null,
        responseCode: body.response_code || null,
        receipt: body.receipt || null,
        peripheralId: body.peripheral_id || null,
        amount,
      });
      await client.query(
        `INSERT INTO pos.post_sale_audit (order_id, employee_id, action, details)
         VALUES ($1, $2, 'card_payment_approved', $3::jsonb)`,
        [orderId, employee.id, JSON.stringify({ providerTransactionId, reference, amount })],
      );
      return completed;
    });

    if (!order.was_parked && !order.already_approved && body.skip_kitchen_print !== true) {
      try {
        await getPusherServer().trigger(CHANNEL_ORDERS, EVENT_NEW_ORDER, order);
      } catch (error) {
        console.error("Pusher emit error:", error);
      }
    }
    return NextResponse.json(order);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "No s'ha pogut finalitzar el cobrament" }, { status: 409 });
  }
}
