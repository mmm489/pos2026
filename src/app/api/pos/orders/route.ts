import { NextRequest, NextResponse } from "next/server";
import { getDb, withTransaction } from "@/lib/db";
import { getPusherServer, CHANNEL_ORDERS, EVENT_NEW_ORDER } from "@/lib/pusher";

export async function GET(request: NextRequest) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");

    let orders;
    if (statusFilter) {
      const statuses = statusFilter.split(",");
      orders = await sql`
        SELECT id, order_number, invoice_number, status, total, total_base, total_vat, payment_method, employee_id, table_number, created_at, completed_at, cancelled_at, cancellation_reason, cancelled_by, card_reference, card_authorization, card_receipt_text, refund_reference, refund_at
        FROM pos.orders
        WHERE status = ANY(${statuses})
        ORDER BY created_at DESC
      `;
    } else {
      orders = await sql`
        SELECT id, order_number, invoice_number, status, total, total_base, total_vat, payment_method, employee_id, table_number, created_at, completed_at, cancelled_at, cancellation_reason, cancelled_by, card_reference, card_authorization, card_receipt_text, refund_reference, refund_at
        FROM pos.orders
        ORDER BY created_at DESC
        LIMIT 500
      `;
    }

    // Fetch items for each order
    const orderIds = orders.map((o) => o.id as number);
    if (orderIds.length > 0) {
      const items = await sql`
        SELECT oi.id, oi.order_id, oi.product_id, oi.qty, oi.unit_price, oi.notes,
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
    const { items, payment_method, employee_id, table_number, card_reference, card_authorization, card_receipt_text } = body;

    if (!items || items.length === 0 || !payment_method) {
      return NextResponse.json(
        { error: "Faltan campos: items, payment_method" },
        { status: 400 }
      );
    }

    const empId = employee_id || null;
    const tblNum = table_number || null;
    const cardRef = (payment_method === "card" && card_reference) ? String(card_reference).slice(0, 20) : null;
    const cardAuth = (payment_method === "card" && card_authorization) ? String(card_authorization).slice(0, 20) : null;
    // Receipt text from REDSYS DatosRecibo — kept verbatim, can be quite long
    // (multiple lines, multiple kB). Cap at 8 KB to avoid abuse.
    const cardReceiptText = (payment_method === "card" && card_receipt_text)
      ? String(card_receipt_text).slice(0, 8192)
      : null;

    const completeOrder = await withTransaction(async (client) => {
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

      // Generate daily order number
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS count FROM pos.orders WHERE created_at::date = CURRENT_DATE`
      );
      const orderNumber = `#${String((countRes.rows[0].count as number) + 1).padStart(3, "0")}`;

      // Atomic invoice number: lock row, read, increment
      const bizRes = await client.query(
        `UPDATE pos.business
         SET next_invoice_number = next_invoice_number + 1
         RETURNING invoice_series, next_invoice_number - 1 AS invoice_num`
      );
      const { invoice_series, invoice_num } = bizRes.rows[0];
      const year = new Date().getFullYear();
      const invoiceNumber = `${invoice_series}-${year}/${String(invoice_num).padStart(6, "0")}`;

      // Create order with invoice number, VAT breakdown, and card audit trail
      const orderRes = await client.query(
        `INSERT INTO pos.orders (order_number, invoice_number, status, total, total_base, total_vat, payment_method, employee_id, table_number, card_reference, card_authorization, card_receipt_text)
         VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, order_number, invoice_number, status, total, total_base, total_vat, payment_method, employee_id, table_number, created_at, card_reference, card_authorization, card_receipt_text`,
        [orderNumber, invoiceNumber, total, totalBase, totalVat, payment_method, empId, tblNum, cardRef, cardAuth, cardReceiptText]
      );
      const order = orderRes.rows[0];

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

    return NextResponse.json(completeOrder, { status: 201 });
  } catch (error) {
    console.error("Error creating order:", error);
    return NextResponse.json(
      { error: "Error al crear pedido" },
      { status: 500 }
    );
  }
}
