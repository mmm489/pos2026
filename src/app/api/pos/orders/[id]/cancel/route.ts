import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getPusherServer, CHANNEL_ORDERS, EVENT_ORDER_UPDATED } from "@/lib/pusher";

const BRIDGE_URL = process.env.BRIDGE_URL || process.env.NEXT_PUBLIC_BRIDGE_URL || "http://localhost:3006";

interface RefundResult {
  success: boolean;
  reference?: string;
  authorizationCode?: string;
  responseCode?: string;
  error?: string;
}

/**
 * Try to reverse a card sale through the datafono. Server-to-bridge call so
 * the browser never has to wait on the terminal directly. We try /cancel first
 * (same-day annulment, free) and fall back to /refund (cross-day, settled).
 */
async function reverseCardSale(
  amount: number,
  originalReference: string,
  orderId: string,
  preferRefund: boolean
): Promise<{ result: RefundResult; operation: "refund" | "cancel" }> {
  const tryEndpoint = async (op: "refund" | "cancel"): Promise<RefundResult> => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 140_000);
      const res = await fetch(`${BRIDGE_URL}/ingenico/${op}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, originalReference, orderId }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return (await res.json()) as RefundResult;
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  };

  // Caller can force /refund (cross-day) — otherwise try /cancel first.
  if (preferRefund) {
    const r = await tryEndpoint("refund");
    return { result: r, operation: "refund" };
  }
  const cancelRes = await tryEndpoint("cancel");
  if (cancelRes.success) return { result: cancelRes, operation: "cancel" };
  const refundRes = await tryEndpoint("refund");
  return { result: refundRes, operation: "refund" };
}

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
    const { reason, employee_id, refund_card, prefer_refund } = body as {
      reason?: string;
      employee_id?: number;
      refund_card?: boolean;
      prefer_refund?: boolean;
    };

    if (!reason) {
      return NextResponse.json(
        { error: "Cal indicar un motiu d'anul·lació" },
        { status: 400 }
      );
    }

    const sql = getDb();

    // Read current order with card audit fields
    const [current] = await sql`
      SELECT id, status, payment_method, total, card_reference, order_number
      FROM pos.orders WHERE id = ${id}
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

    // If user requested datafono refund and this is a card payment with stored reference,
    // try to reverse it BEFORE marking the order cancelled. We do not cancel the order
    // if the refund fails — the operator can retry.
    let refundReference: string | null = null;
    let refundOperation: "refund" | "cancel" | null = null;

    if (refund_card && current.payment_method === "card") {
      if (!current.card_reference) {
        return NextResponse.json(
          { error: "No es pot retornar al datàfon: aquesta comanda no té referència de targeta guardada" },
          { status: 400 }
        );
      }
      const amount = Number(current.total);
      const orderId = String(current.order_number || current.id);
      const { result, operation } = await reverseCardSale(
        amount,
        current.card_reference as string,
        orderId,
        prefer_refund === true
      );
      if (!result.success) {
        return NextResponse.json(
          {
            error: `No s'ha pogut tornar diners al datàfon: ${result.error || "rebutjat"}`,
            datafono_error: result.error || null,
          },
          { status: 502 }
        );
      }
      refundReference = result.reference || null;
      refundOperation = operation;
    }

    const cancelledBy = employee_id || null;

    // Cancel the order (and persist refund metadata if we did one)
    const [updated] = await sql`
      UPDATE pos.orders
      SET status = 'cancelled',
          cancelled_at = NOW(),
          cancellation_reason = ${reason},
          cancelled_by = ${cancelledBy},
          refund_reference = COALESCE(${refundReference}, refund_reference),
          refund_at = CASE WHEN ${refundReference}::text IS NOT NULL THEN NOW() ELSE refund_at END
      WHERE id = ${id}
      RETURNING id, order_number, invoice_number, status, total, payment_method,
                employee_id, table_number, created_at, completed_at,
                cancelled_at, cancellation_reason, cancelled_by,
                card_reference, card_authorization, refund_reference, refund_at
    `;

    // Log KDS event — keep both 'cancelled' (legacy) and the refund detail.
    await sql`
      INSERT INTO pos.kds_events (order_id, event_type)
      VALUES (${id}, ${refundReference ? `cancelled_refunded_${refundOperation}` : "cancelled"})
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

    return NextResponse.json({
      ...updated,
      refund_operation: refundOperation,
    });
  } catch (error) {
    console.error("Error cancelling order:", error);
    return NextResponse.json(
      { error: "Error al anul·lar la comanda" },
      { status: 500 }
    );
  }
}
