import { NextRequest, NextResponse } from "next/server";

import { rawQuery, withTransaction } from "@/lib/db";
import { allocateRectifyingInvoiceNumber } from "@/lib/invoice-number";
import { groupItemsWithModifiers } from "@/lib/item-grouping";
import { ensurePostSaleSchema } from "@/lib/post-sale-schema";
import { getAuthenticatedEmployee } from "@/lib/pos-session";

export const dynamic = "force-dynamic";

type DbOrderItem = {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  qty: number;
  unit_price: number;
  vat_rate: number;
  notes: string | null;
};

type RefundLine = DbOrderItem & { refundQty: number };

type RefundOrder = {
  id: number;
  invoice_number: string | null;
  payment_method: string;
  cashless_operation_id: string | null;
  cashless_transaction_number: string | null;
  card_reference: string | null;
};

function getBridgeUrl() {
  return (process.env.BRIDGE_URL || process.env.NEXT_PUBLIC_BRIDGE_URL || "http://127.0.0.1:3006").replace(/\/$/, "");
}

async function loadRefunds(orderId: number) {
  const refunds = await rawQuery(
    `SELECT r.*, e.name AS employee_name
     FROM pos.refunds r
     LEFT JOIN pos.employees e ON e.id = r.employee_id
     WHERE r.order_id = $1
     ORDER BY r.requested_at DESC`,
    [orderId],
  );
  if (refunds.length === 0) return refunds;
  const refundIds = refunds.map((refund) => Number(refund.id));
  const items = await rawQuery(
    `SELECT * FROM pos.refund_items WHERE refund_id = ANY($1::bigint[]) ORDER BY id`,
    [refundIds],
  );
  const byRefund = new Map<number, typeof items>();
  for (const item of items) {
    const list = byRefund.get(Number(item.refund_id)) || [];
    list.push(item);
    byRefund.set(Number(item.refund_id), list);
  }
  return refunds.map((refund) => ({ ...refund, items: byRefund.get(Number(refund.id)) || [] }));
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const employee = await getAuthenticatedEmployee(request);
  if (!employee) return NextResponse.json({ error: "Sessio POS no valida" }, { status: 401 });
  if (!employee.can_post_sale_lookup && !employee.can_refund_sales) {
    return NextResponse.json({ error: "No tens permis" }, { status: 403 });
  }
  await ensurePostSaleSchema();
  return NextResponse.json(await loadRefunds(Number(params.id)));
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const orderId = Number(params.id);
  let createdRefundId: number | null = null;
  try {
    const employee = await getAuthenticatedEmployee(request);
    if (!employee) return NextResponse.json({ error: "Sessio POS no valida" }, { status: 401 });
    if (!employee.can_refund_sales) return NextResponse.json({ error: "No tens permis per fer devolucions" }, { status: 403 });
    const body = await request.json();
    const requestId = String(body.request_id || "");
    const reason = String(body.reason || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) return NextResponse.json({ error: "Identificador de devolucio no valid" }, { status: 400 });
    if (reason.length < 3) return NextResponse.json({ error: "Cal indicar el motiu de la devolucio" }, { status: 400 });

    const existing = await rawQuery(`SELECT id FROM pos.refunds WHERE client_request_id = $1`, [requestId]);
    if (existing[0]) return NextResponse.json((await loadRefunds(orderId)).find((r) => Number(r.id) === Number(existing[0].id)));

    await ensurePostSaleSchema();
    const [refundOrder] = await rawQuery<RefundOrder>(
      `SELECT id, invoice_number, payment_method, cashless_operation_id,
              cashless_transaction_number, card_reference
       FROM pos.orders
       WHERE id = $1`,
      [orderId],
    );
    if (!refundOrder || !refundOrder.invoice_number) {
      return NextResponse.json({ error: "La venda no te una factura emesa" }, { status: 400 });
    }

    // Only a real Comercia charge has both its operation UUID and banking
    // transaction number. Manual/card entries without those identifiers and
    // cash sales are rectified locally without contacting the terminal.
    const providerRefund =
      refundOrder.payment_method === "card" &&
      Boolean(refundOrder.cashless_operation_id) &&
      Boolean(refundOrder.cashless_transaction_number || refundOrder.card_reference);

    let prepared: { success?: boolean; transactionId?: string; error?: string } | null = null;
    if (providerRefund) {
      const prepareResult = await fetch(`${getBridgeUrl()}/ingenico/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(15_000),
      }).then((response) => response.json()) as {
        success?: boolean;
        transactionId?: string;
        error?: string;
      };
      if (!prepareResult.success || !prepareResult.transactionId) {
        return NextResponse.json({ error: prepareResult.error || "No s'ha pogut preparar la devolucio" }, { status: 502 });
      }
      prepared = prepareResult;
    }

    const created = await withTransaction(async (client) => {
      await ensurePostSaleSchema(client);
      const order = (
        await client.query(
          `SELECT * FROM pos.orders WHERE id = $1 FOR UPDATE`,
          [orderId],
        )
      ).rows[0];
      if (!order || !order.invoice_number) {
        throw new Error("La venda no te una factura emesa");
      }
      const lockedProviderRefund =
        order.payment_method === "card" &&
        Boolean(order.cashless_operation_id) &&
        Boolean(order.cashless_transaction_number || order.card_reference);
      if (lockedProviderRefund !== providerRefund) {
        throw new Error("La venda ha canviat. Torna a carregar-la.");
      }
      const originalTransactionNumber = providerRefund
        ? String(order.cashless_transaction_number || order.card_reference || "")
        : `LOCAL:${order.invoice_number}`;
      if (providerRefund && !originalTransactionNumber) throw new Error("Falta la referencia bancaria original");
      const blocking = await client.query(
        `SELECT id FROM pos.refunds
         WHERE order_id = $1 AND status IN ('processing', 'pending_verification')
         LIMIT 1`,
        [orderId],
      );
      if (blocking.rows[0]) throw new Error("Hi ha una devolucio pendent de comprovar. No es pot repetir.");

      const itemRows = await client.query(
        `SELECT oi.id, oi.order_id, oi.product_id, p.name AS product_name, oi.qty,
                oi.unit_price, oi.vat_rate, oi.notes
         FROM pos.order_items oi
         JOIN pos.products p ON p.id = oi.product_id
         WHERE oi.order_id = $1
         ORDER BY oi.id`,
        [orderId],
      );
      const items = itemRows.rows.map((item) => ({
        ...item,
        id: Number(item.id),
        order_id: Number(item.order_id),
        product_id: Number(item.product_id),
        qty: Number(item.qty),
        unit_price: Number(item.unit_price),
        vat_rate: Number(item.vat_rate),
      })) as DbOrderItem[];
      const usedRows = await client.query(
        `SELECT ri.order_item_id, COALESCE(SUM(ri.qty), 0)::int AS qty
         FROM pos.refund_items ri
         JOIN pos.refunds r ON r.id = ri.refund_id
         WHERE r.order_id = $1 AND r.status IN ('processing', 'completed', 'pending_verification')
         GROUP BY ri.order_item_id`,
        [orderId],
      );
      const used = new Map(usedRows.rows.map((row) => [Number(row.order_item_id), Number(row.qty)]));
      const requested = new Map<number, number>(
        Array.isArray(body.selections)
          ? body.selections.map((selection: { base_item_id: number; qty: number }) => [Number(selection.base_item_id), Number(selection.qty)])
          : [],
      );
      const full = body.mode === "full";
      const lines: RefundLine[] = [];
      const groups = groupItemsWithModifiers(items, (item) => item.product_name, (item) => item.notes);
      for (const group of groups) {
        if (group.isOrphanModifier) continue;
        const baseRemaining = group.base.qty - (used.get(group.base.id) || 0);
        const selectedQty = full ? baseRemaining : (requested.get(group.base.id) || 0);
        if (!Number.isInteger(selectedQty) || selectedQty < 0 || selectedQty > baseRemaining) {
          throw new Error(`Quantitat no valida per ${group.base.product_name}`);
        }
        if (selectedQty === 0) continue;
        lines.push({ ...group.base, refundQty: selectedQty });
        for (const modifier of group.modifiers) {
          const ratio = modifier.qty / group.base.qty;
          const modifierQty = ratio * selectedQty;
          const modifierRemaining = modifier.qty - (used.get(modifier.id) || 0);
          if (!Number.isInteger(modifierQty) || modifierQty > modifierRemaining) {
            throw new Error(`No es pot separar el complement ${modifier.product_name} del seu producte`);
          }
          if (modifierQty > 0) lines.push({ ...modifier, refundQty: modifierQty });
        }
      }
      if (lines.length === 0) throw new Error("Selecciona almenys un producte pendent de retornar");

      let amount = 0;
      let totalBase = 0;
      let totalVat = 0;
      for (const line of lines) {
        const lineTotal = Math.round(line.unit_price * line.refundQty * 100) / 100;
        const lineBase = Math.round((lineTotal / (1 + line.vat_rate / 100)) * 100) / 100;
        amount += lineTotal;
        totalBase += lineBase;
        totalVat += lineTotal - lineBase;
      }
      amount = Math.round(amount * 100) / 100;
      totalBase = Math.round(totalBase * 100) / 100;
      totalVat = Math.round(totalVat * 100) / 100;

      const rectifying = providerRefund ? null : await allocateRectifyingInvoiceNumber(client);
      const refund = (
        await client.query(
          `INSERT INTO pos.refunds
             (order_id, client_request_id, rectifying_invoice_number, status,
              amount, total_base, total_vat, reason, employee_id,
              original_transaction_number, provider_transaction_id, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                   CASE WHEN $4 = 'completed' THEN NOW() ELSE NULL END)
           RETURNING *`,
          [orderId, requestId, rectifying, providerRefund ? "processing" : "completed",
           amount, totalBase, totalVat, reason, employee.id, originalTransactionNumber,
           providerRefund ? String(prepared?.transactionId || "") : null],
        )
      ).rows[0];
      for (const line of lines) {
        await client.query(
          `INSERT INTO pos.refund_items
             (refund_id, order_item_id, product_id, product_name, qty, unit_price, vat_rate, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [refund.id, line.id, line.product_id, line.product_name, line.refundQty,
           line.unit_price, line.vat_rate, line.notes],
        );
      }
      if (!providerRefund) {
        await client.query(
          `INSERT INTO pos.post_sale_audit (order_id, refund_id, employee_id, action, details)
           VALUES ($1, $2, $3, 'local_rectification_completed', $4::jsonb)`,
          [orderId, refund.id, employee.id, JSON.stringify({
            amount,
            rectifying,
            payment_method: order.payment_method,
          })],
        );
      }
      return { refund, originalTransactionNumber, amount, providerRefund };
    });

    if (!created.providerRefund) {
      const completedRefund = (await loadRefunds(orderId)).find(
        (refund) => Number(refund.id) === Number(created.refund.id),
      );
      return NextResponse.json({ ...completedRefund, provider: null }, { status: 201 });
    }

    createdRefundId = Number(created.refund.id);

    let provider;
    try {
      provider = await fetch(`${getBridgeUrl()}/ingenico/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: created.amount,
          orderId: String(orderId),
          originalReference: created.originalTransactionNumber,
          transactionId: prepared?.transactionId,
        }),
        signal: AbortSignal.timeout(150_000),
      }).then((response) => response.json());
    } catch (error) {
      await rawQuery(
        `UPDATE pos.refunds SET status = 'pending_verification', error_message = $1, updated_at = NOW(), synced = false WHERE id = $2`,
        [(error as Error).message || "Timeout de Comercia", created.refund.id],
      );
      return NextResponse.json({ ...(await loadRefunds(orderId)).find((r) => Number(r.id) === Number(created.refund.id)), warning: "Devolucio pendent de comprovar. No la repeteixis." }, { status: 202 });
    }

    if (!provider.success) {
      await rawQuery(
        `UPDATE pos.refunds
         SET status = $1, error_message = $2, provider_response_code = $3, updated_at = NOW(), synced = false
         WHERE id = $4`,
        [provider.unknown ? "pending_verification" : "failed", provider.error || "Devolucio rebutjada",
         provider.responseCode || null, created.refund.id],
      );
      return NextResponse.json({ ...(await loadRefunds(orderId)).find((r) => Number(r.id) === Number(created.refund.id)), provider }, { status: provider.unknown ? 202 : 409 });
    }

    const completed = await withTransaction(async (client) => {
      const current = (
        await client.query(
          `SELECT status, rectifying_invoice_number FROM pos.refunds WHERE id = $1 FOR UPDATE`,
          [created.refund.id],
        )
      ).rows[0];
      if (!current) throw new Error("Devolucio no trobada");
      if (current.status === "completed") return String(current.rectifying_invoice_number);
      const rectifying = await allocateRectifyingInvoiceNumber(client);
      await client.query(
        `UPDATE pos.refunds
         SET status = 'completed', rectifying_invoice_number = $1, provider_reference = $2,
             provider_authorization = $3, provider_response_code = $4, receipt_text = $5,
             completed_at = NOW(), updated_at = NOW(), synced = false
         WHERE id = $6`,
        [rectifying, provider.reference || null, provider.authorizationCode || null,
         provider.responseCode || null, provider.receipt?.slice(0, 8192) || null, created.refund.id],
      );
      await client.query(
        `INSERT INTO pos.post_sale_audit (order_id, refund_id, employee_id, action, details)
         VALUES ($1, $2, $3, 'card_refund_completed', $4::jsonb)`,
        [orderId, created.refund.id, employee.id, JSON.stringify({ amount: created.amount, rectifying })],
      );
      return rectifying;
    });
    return NextResponse.json({ ...(await loadRefunds(orderId)).find((r) => Number(r.id) === Number(created.refund.id)), rectifying_invoice_number: completed, provider }, { status: 201 });
  } catch (error) {
    if (createdRefundId) {
      try {
        await rawQuery(
          `UPDATE pos.refunds
           SET status = 'pending_verification', error_message = $1, updated_at = NOW(), synced = false
           WHERE id = $2 AND status = 'processing'`,
          [(error as Error).message || "Error finalitzant la devolucio", createdRefundId],
        );
        return NextResponse.json(
          {
            ...(await loadRefunds(orderId)).find((refund) => Number(refund.id) === createdRefundId),
            warning: "Devolucio pendent de comprovar. No la repeteixis.",
          },
          { status: 202 },
        );
      } catch {
        // Fall through to the original error if the database is unavailable.
      }
    }
    return NextResponse.json({ error: (error as Error).message || "No s'ha pogut fer la devolucio" }, { status: 400 });
  }
}
