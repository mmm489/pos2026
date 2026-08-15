import { NextRequest, NextResponse } from "next/server";

import { rawQuery, withTransaction } from "@/lib/db";
import { allocateRectifyingInvoiceNumber } from "@/lib/invoice-number";
import { ensurePostSaleSchema } from "@/lib/post-sale-schema";
import { getAuthenticatedEmployee } from "@/lib/pos-session";

function getBridgeUrl() {
  return (process.env.BRIDGE_URL || process.env.NEXT_PUBLIC_BRIDGE_URL || "http://127.0.0.1:3006").replace(/\/$/, "");
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const employee = await getAuthenticatedEmployee(request);
    if (!employee) return NextResponse.json({ error: "Sessio POS no valida" }, { status: 401 });
    if (!employee.can_post_sale_lookup) return NextResponse.json({ error: "No tens permis" }, { status: 403 });
    await ensurePostSaleSchema();
    const refundId = Number(params.id);
    const [refund] = await rawQuery<Record<string, unknown>>(`SELECT * FROM pos.refunds WHERE id = $1`, [refundId]);
    if (!refund?.provider_transaction_id) return NextResponse.json({ error: "Falta el UUID de la devolucio" }, { status: 400 });
    const provider = await fetch(`${getBridgeUrl()}/ingenico/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: refund.provider_transaction_id, orderId: String(refund.order_id) }),
      signal: AbortSignal.timeout(135_000),
    }).then((response) => response.json());
    let reconciledRectifying: string | null = refund.rectifying_invoice_number
      ? String(refund.rectifying_invoice_number)
      : null;
    if (provider.success) {
      const amount = Number(provider.cashlessAmount);
      if (!Number.isFinite(amount) || Math.abs(amount - Number(refund.amount)) > 0.009) {
        return NextResponse.json({ error: "L'import retornat per Comercia no coincideix", provider }, { status: 409 });
      }
      reconciledRectifying = await withTransaction(async (client) => {
        const current = (
          await client.query(
            `SELECT status, rectifying_invoice_number FROM pos.refunds WHERE id = $1 FOR UPDATE`,
            [refundId],
          )
        ).rows[0];
        if (!current) throw new Error("Devolucio no trobada");
        if (current.status === "completed") return String(current.rectifying_invoice_number || "") || null;
        const rectifying = await allocateRectifyingInvoiceNumber(client);
        await client.query(
          `UPDATE pos.refunds SET status = 'completed', rectifying_invoice_number = $1,
                  provider_reference = $2, provider_authorization = $3, provider_response_code = $4,
                  receipt_text = COALESCE($5, receipt_text), completed_at = NOW(), updated_at = NOW(), synced = false
           WHERE id = $6 AND status <> 'completed'`,
          [rectifying, provider.reference || null, provider.authorizationCode || null,
           provider.responseCode || null, provider.receipt?.slice(0, 8192) || null, refundId],
        );
        await client.query(
          `INSERT INTO pos.post_sale_audit (order_id, refund_id, employee_id, action, details)
           VALUES ($1, $2, $3, 'card_refund_reconciled', $4::jsonb)`,
          [refund.order_id, refundId, employee.id, JSON.stringify({ amount, rectifying })],
        );
        return rectifying;
      });
    }
    return NextResponse.json({ provider, refund_id: refundId, rectifying_invoice_number: reconciledRectifying });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
