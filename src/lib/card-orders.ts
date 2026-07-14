import type { PoolClient } from "pg";

import { allocateInvoiceNumber } from "@/lib/invoice-number";
import { allocateOrderNumber } from "@/lib/order-number";

export type IncomingCardItem = {
  product_id: number;
  qty: number;
  price: number;
  notes?: string | null;
};

type ValidatedCardItem = IncomingCardItem & { vat_rate: number };

export async function validateCardItems(client: PoolClient, items: IncomingCardItem[]) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("La comanda no te productes");
  const productIds = Array.from(new Set(items.map((item) => Number(item.product_id))));
  const products = await client.query(
    `SELECT id, vat_rate FROM pos.products WHERE id = ANY($1::int[]) AND active = true`,
    [productIds],
  );
  const vatByProduct = new Map(products.rows.map((row) => [Number(row.id), Number(row.vat_rate)]));
  if (vatByProduct.size !== productIds.length) throw new Error("Hi ha productes no disponibles");

  let total = 0;
  let totalBase = 0;
  let totalVat = 0;
  const validated: ValidatedCardItem[] = [];
  for (const item of items) {
    const productId = Number(item.product_id);
    const qty = Number(item.qty);
    const price = Math.round(Number(item.price) * 100) / 100;
    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
      throw new Error("Linia de comanda no valida");
    }
    const vatRate = vatByProduct.get(productId)!;
    const lineTotal = Math.round(price * qty * 100) / 100;
    const lineBase = Math.round((lineTotal / (1 + vatRate / 100)) * 100) / 100;
    total += lineTotal;
    totalBase += lineBase;
    totalVat += lineTotal - lineBase;
    validated.push({ ...item, product_id: productId, qty, price, vat_rate: vatRate, notes: item.notes || null });
  }
  return {
    items: validated,
    total: Math.round(total * 100) / 100,
    totalBase: Math.round(totalBase * 100) / 100,
    totalVat: Math.round(totalVat * 100) / 100,
  };
}

export async function fetchCompleteOrder(client: PoolClient, orderId: number) {
  const order = (
    await client.query(
      `SELECT o.*, e.name AS employee_name
       FROM pos.orders o
       LEFT JOIN pos.employees e ON e.id = o.employee_id
       WHERE o.id = $1`,
      [orderId],
    )
  ).rows[0];
  if (!order) throw new Error("Comanda no trobada");
  const items = await client.query(
    `SELECT oi.*, p.name AS product_name
     FROM pos.order_items oi
     JOIN pos.products p ON p.id = oi.product_id
     WHERE oi.order_id = $1
     ORDER BY oi.id`,
    [orderId],
  );
  return { ...order, items: items.rows };
}

export async function createCardDraft(
  client: PoolClient,
  input: {
    items: IncomingCardItem[];
    employeeId: number;
    providerTransactionId: string;
    paymentAttemptId: string;
    tableNumber?: string | null;
    serviceType?: "dine_in" | "takeaway";
    parkedOrderId?: number | null;
  },
) {
  const totals = await validateCardItems(client, input.items);
  let orderId: number;
  let wasParked = false;

  if (input.parkedOrderId) {
    const existing = (
      await client.query(
        `SELECT id, payment_method, card_payment_status FROM pos.orders WHERE id = $1 FOR UPDATE`,
        [input.parkedOrderId],
      )
    ).rows[0];
    if (!existing || existing.payment_method !== "parked") throw new Error("Ticket aparcat no disponible");
    if (["awaiting", "unknown"].includes(existing.card_payment_status)) {
      throw new Error("Aquest ticket ja te un cobrament pendent de comprovar");
    }
    orderId = Number(existing.id);
    wasParked = true;
    await client.query(
      `UPDATE pos.orders
       SET total = $1, total_base = $2, total_vat = $3, employee_id = $4,
           table_number = $5, service_type = $6, card_payment_status = 'awaiting',
           payment_attempt_id = $7, cashless_operation_id = $8, card_payment_error = NULL,
           synced = false
       WHERE id = $9`,
      [totals.total, totals.totalBase, totals.totalVat, input.employeeId, input.tableNumber || null,
       input.serviceType || "dine_in", input.paymentAttemptId, input.providerTransactionId, orderId],
    );
    await client.query(`DELETE FROM pos.order_items WHERE order_id = $1`, [orderId]);
  } else {
    const orderNumber = await allocateOrderNumber(client, "hicream");
    const inserted = await client.query(
      `INSERT INTO pos.orders
         (order_number, invoice_number, status, total, total_base, total_vat, payment_method,
          business_unit, service_type, employee_id, table_number, card_payment_status,
          payment_attempt_id, cashless_operation_id, completed_at, synced)
       VALUES ($1, NULL, 'pending', $2, $3, $4, 'card', 'hicream', $5, $6, $7,
               'awaiting', $8, $9, NULL, false)
       RETURNING id`,
      [orderNumber, totals.total, totals.totalBase, totals.totalVat, input.serviceType || "dine_in",
       input.employeeId, input.tableNumber || null, input.paymentAttemptId, input.providerTransactionId],
    );
    orderId = Number(inserted.rows[0].id);
  }

  for (const item of totals.items) {
    await client.query(
      `INSERT INTO pos.order_items (order_id, product_id, qty, unit_price, vat_rate, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orderId, item.product_id, item.qty, item.price, item.vat_rate, item.notes || null],
    );
  }
  return { orderId, wasParked, ...totals };
}

export async function finalizeCardOrder(
  client: PoolClient,
  input: {
    orderId: number;
    employeeId: number;
    providerTransactionId: string;
    reference: string;
    authorizationCode?: string | null;
    responseCode?: string | null;
    receipt?: string | null;
    peripheralId?: string | null;
    amount: number;
  },
) {
  const current = (
    await client.query(`SELECT * FROM pos.orders WHERE id = $1 FOR UPDATE`, [input.orderId])
  ).rows[0];
  if (!current) throw new Error("Comanda no trobada");
  if (current.card_payment_status === "approved") {
    return { ...(await fetchCompleteOrder(client, input.orderId)), was_parked: false, already_approved: true };
  }
  if (!["awaiting", "unknown"].includes(current.card_payment_status)) {
    throw new Error("La comanda no te un cobrament recuperable");
  }
  if (String(current.cashless_operation_id || "") !== input.providerTransactionId) {
    throw new Error("El UUID de Comercia no coincideix amb la comanda");
  }
  if (Math.abs(Number(current.total) - Number(input.amount)) > 0.009) {
    throw new Error("L'import aprovat per Comercia no coincideix amb la comanda");
  }
  const wasParked = current.payment_method === "parked";
  const invoiceNumber = current.invoice_number || (await allocateInvoiceNumber(client, "hicream"));
  await client.query(
    `UPDATE pos.orders
     SET invoice_number = $1, payment_method = 'card', card_payment_status = 'approved',
         card_reference = $2, card_authorization = $3, card_receipt_text = $4,
         cashless_peripheral_id = $5, cashless_operation_id = $6,
         cashless_transaction_number = $7, cashless_amount = $8,
         card_payment_error = NULL, employee_id = $9, synced = false
     WHERE id = $10`,
    [invoiceNumber, input.reference.slice(0, 120), input.authorizationCode?.slice(0, 120) || null,
     input.receipt?.slice(0, 8192) || null, input.peripheralId?.slice(0, 120) || null,
     input.providerTransactionId.slice(0, 120), input.reference.slice(0, 120), input.amount,
     input.employeeId, input.orderId],
  );
  const order = await fetchCompleteOrder(client, input.orderId);
  return { ...order, was_parked: wasParked, already_approved: false };
}
