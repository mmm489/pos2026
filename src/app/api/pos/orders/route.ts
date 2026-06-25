import { NextRequest, NextResponse } from "next/server";
import { getDb, rawQuery, withTransaction } from "@/lib/db";
import { allocateOrderNumber } from "@/lib/order-number";
import { allocateInvoiceNumber } from "@/lib/invoice-number";
import { getPusherServer, CHANNEL_ORDERS, EVENT_NEW_ORDER } from "@/lib/pusher";
import { ensureOrderBusinessUnitSchema, normalizeBusinessUnit } from "@/lib/business-unit";

export const dynamic = "force-dynamic";

let kdsReadyColumnsEnsured = false;
let cashlessAuditColumnsEnsured = false;
let serviceTypeColumnEnsured = false;

type KitchenOrderItem = {
  product_name?: string | null;
  qty?: number | string | null;
  notes?: string | null;
};

type KitchenPrintResult = {
  success: boolean;
  error?: string;
};

function getBridgeUrl() {
  return (
    process.env.BRIDGE_URL ||
    process.env.NEXT_PUBLIC_BRIDGE_URL ||
    "http://127.0.0.1:3006"
  ).replace(/\/$/, "");
}

async function printKitchenTicketForOrder(order: {
  order_number: string;
  table_number?: string | null;
  service_type?: string | null;
  items?: KitchenOrderItem[];
}): Promise<KitchenPrintResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const payload = {
        orderNumber: order.order_number,
        tableNumber: order.table_number || undefined,
        serviceType: order.service_type === "takeaway" ? "takeaway" : "dine_in",
        items: (order.items || []).map((item) => ({
        name: item.product_name || "",
        qty: Number(item.qty || 0),
        notes: item.notes || undefined,
      })),
    };

    const res = await fetch(`${getBridgeUrl()}/printer/kitchen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as KitchenPrintResult | null;

    if (!res.ok || !data?.success) {
      const error = data?.error || `HTTP ${res.status}`;
      console.error(`[Kitchen] No se pudo imprimir ${order.order_number}: ${error}`);
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    const message =
      (error as Error).name === "AbortError"
        ? "Timeout imprimiendo comanda de cocina"
        : (error as Error).message || "Error imprimiendo comanda de cocina";
    console.error(`[Kitchen] No se pudo imprimir ${order.order_number}: ${message}`);
    return { success: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

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

async function ensureCashlessAuditColumns(client?: { query: (sql: string) => Promise<unknown> }) {
  if (cashlessAuditColumnsEnsured && !client) return;
  const runner = client || {
    query: async (sql: string) => {
      await rawQuery(sql);
    },
  };
  await runner.query(`ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS cashless_peripheral_id VARCHAR(120)`);
  await runner.query(`ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS cashless_operation_id VARCHAR(120)`);
  await runner.query(`ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS cashless_transaction_number VARCHAR(120)`);
  await runner.query(`ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS cashless_amount NUMERIC(10,2)`);
  if (!client) cashlessAuditColumnsEnsured = true;
}

async function ensureOrderServiceTypeColumn(client?: { query: (sql: string) => Promise<unknown> }) {
  if (serviceTypeColumnEnsured) return;
  const runner = client || {
    query: async (sql: string) => {
      await rawQuery(sql);
    },
  };
  await runner.query(`ALTER TABLE pos.orders ADD COLUMN IF NOT EXISTS service_type VARCHAR(20) NOT NULL DEFAULT 'dine_in'`);
  await runner.query(`ALTER TABLE pos.orders DROP CONSTRAINT IF EXISTS orders_service_type_check`);
  await runner.query(`ALTER TABLE pos.orders ADD CONSTRAINT orders_service_type_check CHECK (service_type IN ('dine_in', 'takeaway'))`);
  serviceTypeColumnEnsured = true;
}

function normalizeServiceType(value: unknown): "dine_in" | "takeaway" {
  return value === "takeaway" ? "takeaway" : "dine_in";
}

export async function GET(request: NextRequest) {
  try {
    await ensureOrderBusinessUnitSchema();
    await ensureKdsReadyColumns();
    await ensureCashlessAuditColumns();
    await ensureOrderServiceTypeColumn();
    const sql = getDb();
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const businessUnitParam = searchParams.get("business_unit") || "hicream";
    const businessUnit =
      businessUnitParam === "all" ? null : normalizeBusinessUnit(businessUnitParam);

    let orders;
    if (statusFilter) {
      const statuses = statusFilter.split(",");
      orders = await rawQuery(
        `SELECT id, order_number, invoice_number, status, total, total_base, total_vat, payment_method, business_unit, service_type, employee_id, table_number, created_at, completed_at, cancelled_at, cancellation_reason, cancelled_by, card_reference, card_authorization, card_receipt_text, cashless_peripheral_id, cashless_operation_id, cashless_transaction_number, cashless_amount, refund_reference, refund_at
         FROM pos.orders
         WHERE status = ANY($1)
           AND ($2::text IS NULL OR COALESCE(business_unit, 'hicream') = $2)
         ORDER BY created_at ASC`,
        [statuses, businessUnit]
      );
    } else {
      orders = await rawQuery(
        `SELECT id, order_number, invoice_number, status, total, total_base, total_vat, payment_method, business_unit, service_type, employee_id, table_number, created_at, completed_at, cancelled_at, cancellation_reason, cancelled_by, card_reference, card_authorization, card_receipt_text, cashless_peripheral_id, cashless_operation_id, cashless_transaction_number, cashless_amount, refund_reference, refund_at
         FROM pos.orders
         WHERE ($1::text IS NULL OR COALESCE(business_unit, 'hicream') = $1)
         ORDER BY created_at DESC
         LIMIT 500`,
        [businessUnit]
      );
    }

    // Fetch items for each order
    const orderIds = orders.map((o) => o.id as number);
    if (orderIds.length > 0) {
      const items = await sql`
        SELECT oi.id, oi.order_id, oi.product_id, oi.qty, oi.unit_price, oi.notes,
               oi.kds_ready, oi.kds_ready_at,
               p.name AS product_name
        FROM pos.order_items oi
        JOIN pos.products p ON p.id = oi.product_id
        WHERE oi.order_id = ANY(${orderIds})
      `;

      const itemsByOrder = new Map<number, typeof items>();
      for (const item of items) {
        const list = itemsByOrder.get(item.order_id as number) || [];
        list.push(item);
        itemsByOrder.set(item.order_id as number, list);
      }

      for (const order of orders) {
        (order as Record<string, unknown>).items = itemsByOrder.get(order.id as number) || [];
      }
    }

    return NextResponse.json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json(
      { error: "Error al obtener pedidos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      items,
      payment_method,
      employee_id,
      table_number,
      service_type,
      card_reference,
      card_authorization,
      card_receipt_text,
      cashless_peripheral_id,
      cashless_operation_id,
      cashless_transaction_number,
      cashless_amount,
      parked_order_id,
      skip_kitchen_print,
    } = body;
    const businessUnit = normalizeBusinessUnit(body.business_unit);
    const serviceType = normalizeServiceType(service_type);

    if (!items || items.length === 0 || !payment_method) {
      return NextResponse.json(
        { error: "Faltan campos: items, payment_method" },
        { status: 400 }
      );
    }
    if (!["cash", "card", "manual"].includes(payment_method)) {
      return NextResponse.json(
        { error: "Metodo de pago no valido" },
        { status: 400 }
      );
    }

    const storedPaymentMethod: "cash" | "card" =
      payment_method === "cash" ? "cash" : "card";
    if (businessUnit === "cookies" && storedPaymentMethod !== "cash") {
      return NextResponse.json(
        { error: "Cookies solo se puede cobrar con Cashlogy" },
        { status: 400 }
      );
    }
    const empId = employee_id || null;
    const tblNum = table_number || null;
    const parsedParkedOrderId = Number(parked_order_id);
    const parkedOrderId = Number.isInteger(parsedParkedOrderId) && parsedParkedOrderId > 0
      ? parsedParkedOrderId
      : null;
    const isFinalizingParkedOrder = parkedOrderId !== null;
    const shouldSkipKitchenPrint = skip_kitchen_print === true;
    const cardRef = (storedPaymentMethod === "card" && card_reference) ? String(card_reference).slice(0, 20) : null;
    const cardAuth = (storedPaymentMethod === "card" && card_authorization) ? String(card_authorization).slice(0, 20) : null;
    // Receipt text from the card provider, kept verbatim because it can be quite long.
    // (multiple lines, multiple kB). Cap at 8 KB to avoid abuse.
    const cardReceiptText = (storedPaymentMethod === "card" && card_receipt_text)
      ? String(card_receipt_text).slice(0, 8192)
      : null;
    const cashlessPeripheralId = (storedPaymentMethod === "card" && cashless_peripheral_id)
      ? String(cashless_peripheral_id).slice(0, 120)
      : null;
    const cashlessOperationId = (storedPaymentMethod === "card" && cashless_operation_id)
      ? String(cashless_operation_id).slice(0, 120)
      : null;
    const cashlessTransactionNumber = (storedPaymentMethod === "card" && cashless_transaction_number)
      ? String(cashless_transaction_number).slice(0, 120)
      : null;
    const parsedCashlessAmount = Number(cashless_amount);
    const cashlessAmount = (storedPaymentMethod === "card" && Number.isFinite(parsedCashlessAmount))
      ? Math.round(parsedCashlessAmount * 100) / 100
      : null;

    const completeOrder = await withTransaction(async (client) => {
      await ensureOrderBusinessUnitSchema(client);
      await ensureCashlessAuditColumns(client);
      await ensureOrderServiceTypeColumn(client);

      // Fetch actual VAT rate per product from DB (don't trust client)
      const productIds = Array.from(new Set((items as { product_id: number }[]).map((i) => i.product_id)));
      const prodRes = await client.query(
        `SELECT id, vat_rate FROM pos.products WHERE id = ANY($1::int[])`,
        [productIds]
      );
      const vatByProduct = new Map<number, number>();
      for (const row of prodRes.rows) {
        vatByProduct.set(row.id as number, Number(row.vat_rate));
      }

      // Calculate totals per item using actual VAT rate
      let total = 0;
      let totalBase = 0;
      let totalVat = 0;
      const itemsWithVat: { product_id: number; qty: number; price: number; vat_rate: number; notes: string | null }[] = [];
      for (const item of items as { product_id: number; qty: number; price: number; notes?: string | null }[]) {
        const vatRate = vatByProduct.get(item.product_id) ?? 10;
        const lineTotal = Math.round(item.price * item.qty * 100) / 100;
        const lineBase = Math.round((lineTotal / (1 + vatRate / 100)) * 100) / 100;
        const lineVat = Math.round((lineTotal - lineBase) * 100) / 100;
        total += lineTotal;
        totalBase += lineBase;
        totalVat += lineVat;
        itemsWithVat.push({
          product_id: item.product_id,
          qty: item.qty,
          price: item.price,
          vat_rate: vatRate,
          notes: item.notes || null,
        });
      }
      total = Math.round(total * 100) / 100;
      totalBase = Math.round(totalBase * 100) / 100;
      totalVat = Math.round(totalVat * 100) / 100;

      const orderNumber = await allocateOrderNumber(client, businessUnit);
      const invoiceNumber = await allocateInvoiceNumber(client, businessUnit);

      // All sales start as "pending" so they go through
      // the KDS pending → preparing → ready flow. The Z report counts pending
      // and ready orders alike, so analytics aren't affected.
      // Manual external card charges are stored as "card" for closings/dashboard.
      const initialStatus = "pending";
      const initialCompletedAt = "NULL";

      let order;
      if (isFinalizingParkedOrder) {
        const currentRes = await client.query(
          `SELECT id, payment_method
           FROM pos.orders
           WHERE id = $1
           FOR UPDATE`,
          [parkedOrderId]
        );
        const current = currentRes.rows[0];
        if (!current) throw new Error("Ticket aparcat no trobat");
        if (current.payment_method !== "parked") {
          throw new Error("Aquest ticket ja no esta aparcat");
        }

        const orderRes = await client.query(
          `UPDATE pos.orders
           SET invoice_number = $1,
               total = $2,
               total_base = $3,
               total_vat = $4,
               payment_method = $5,
               business_unit = $6,
               service_type = $7,
               employee_id = $8,
               table_number = $9,
               card_reference = $10,
               card_authorization = $11,
               card_receipt_text = $12,
               cashless_peripheral_id = $13,
               cashless_operation_id = $14,
               cashless_transaction_number = $15,
               cashless_amount = $16,
               order_number = CASE WHEN $18 = 'cookies' THEN $19 ELSE order_number END
           WHERE id = $17
           RETURNING id, order_number, invoice_number, status, total, total_base, total_vat, payment_method, business_unit, service_type, employee_id, table_number, created_at, completed_at, card_reference, card_authorization, card_receipt_text, cashless_peripheral_id, cashless_operation_id, cashless_transaction_number, cashless_amount`,
          [
            invoiceNumber,
            total,
            totalBase,
            totalVat,
            storedPaymentMethod,
            businessUnit,
            serviceType,
            empId,
            tblNum,
            cardRef,
            cardAuth,
            cardReceiptText,
            cashlessPeripheralId,
            cashlessOperationId,
            cashlessTransactionNumber,
            cashlessAmount,
            parkedOrderId,
            businessUnit,
            orderNumber,
          ]
        );
        order = orderRes.rows[0];
        await client.query(`DELETE FROM pos.order_items WHERE order_id = $1`, [order.id]);
      } else {
        const orderRes = await client.query(
          `INSERT INTO pos.orders (order_number, invoice_number, status, total, total_base, total_vat, payment_method, business_unit, service_type, employee_id, table_number, card_reference, card_authorization, card_receipt_text, cashless_peripheral_id, cashless_operation_id, cashless_transaction_number, cashless_amount, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, ${initialCompletedAt})
           RETURNING id, order_number, invoice_number, status, total, total_base, total_vat, payment_method, business_unit, service_type, employee_id, table_number, created_at, completed_at, card_reference, card_authorization, card_receipt_text, cashless_peripheral_id, cashless_operation_id, cashless_transaction_number, cashless_amount`,
          [
            orderNumber,
            invoiceNumber,
            initialStatus,
            total,
            totalBase,
            totalVat,
            storedPaymentMethod,
            businessUnit,
            serviceType,
            empId,
            tblNum,
            cardRef,
            cardAuth,
            cardReceiptText,
            cashlessPeripheralId,
            cashlessOperationId,
            cashlessTransactionNumber,
            cashlessAmount,
          ]
        );
        order = orderRes.rows[0];
      }

      // Insert order items with their actual VAT rate
      for (const item of itemsWithVat) {
        await client.query(
          `INSERT INTO pos.order_items (order_id, product_id, qty, unit_price, vat_rate, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [order.id, item.product_id, item.qty, item.price, item.vat_rate, item.notes]
        );
      }

      // Fetch complete order with items
      const itemsRes = await client.query(
        `SELECT oi.id, oi.order_id, oi.product_id, oi.qty, oi.unit_price, oi.vat_rate, oi.notes,
                p.name AS product_name
         FROM pos.order_items oi
         JOIN pos.products p ON p.id = oi.product_id
         WHERE oi.order_id = $1`,
        [order.id]
      );

      return { ...order, items: itemsRes.rows };
    });

    // Emit real-time event
    try {
      const pusher = getPusherServer();
      await pusher.trigger(CHANNEL_ORDERS, EVENT_NEW_ORDER, completeOrder);
    } catch (e) {
      console.error("Pusher emit error:", e);
    }

    const kitchenPrint = isFinalizingParkedOrder || shouldSkipKitchenPrint
      ? { success: true }
      : await printKitchenTicketForOrder(completeOrder);

    return NextResponse.json(
      { ...completeOrder, kitchen_print: kitchenPrint },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating order:", error);
    return NextResponse.json(
      { error: "Error al crear pedido" },
      { status: 500 }
    );
  }
}
