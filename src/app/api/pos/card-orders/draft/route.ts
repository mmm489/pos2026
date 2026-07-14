import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { createCardDraft, fetchCompleteOrder, type IncomingCardItem } from "@/lib/card-orders";
import { withTransaction } from "@/lib/db";
import { ensurePostSaleSchema } from "@/lib/post-sale-schema";
import { getAuthenticatedEmployee } from "@/lib/pos-session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const employee = await getAuthenticatedEmployee(request);
    if (!employee) return NextResponse.json({ error: "Sessio POS no valida. Torna a entrar amb PIN." }, { status: 401 });
    const body = await request.json();
    const providerTransactionId = String(body.provider_transaction_id || "");
    if (!/^[0-9a-f-]{32,40}$/i.test(providerTransactionId)) {
      return NextResponse.json({ error: "UUID de Comercia no valid" }, { status: 400 });
    }
    const result = await withTransaction(async (client) => {
      await ensurePostSaleSchema(client);
      const draft = await createCardDraft(client, {
        items: body.items as IncomingCardItem[],
        employeeId: employee.id,
        providerTransactionId,
        paymentAttemptId: randomUUID(),
        tableNumber: body.table_number || null,
        serviceType: body.service_type === "takeaway" ? "takeaway" : "dine_in",
        parkedOrderId: Number(body.parked_order_id) || null,
      });
      return { ...(await fetchCompleteOrder(client, draft.orderId)), was_parked: draft.wasParked };
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "No s'ha pogut preparar el cobrament" }, { status: 400 });
  }
}

