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
        SELECT id, order_number, invoice_number, status, total, total_base, total_vat, payment_method, employee_id, table_number, created_at, completed_at
        FROM pos.orders
        WHERE status = ANY(${statuses})
        ORDER BY created_at DESC
      `;
    } else {
      orders = await sql`
        SELECT id, order_number, invoice_number, status, total, total_base, total_vat, payment_method, employee_id, table_number, created_at, completed_at
        FROM pos.orders
        ORDER BY created_at DESC
        LIMIT 100
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
    const { items, payment_method, employee_id, table_number } = body;

    if (!items || items.length === 0 || !payment_method) {
      return NextResponse.json(
        { error: "Faltan campos: items, payment_method" },
        { status: 400 }
      );
    }

    // Calculate totals (prices are PVP with 10% VAT included)
    const total = items.reduce(
      (sum: number, i: { price: number; qty: number }) => sum + i.price * i.qty,
      0
    );
    const totalBase = Math.round((total / 1.10) * 100) / 100;
    const totalVat = Math.round((total - totalBase) * 100) / 100;

    const empId = employee_id || null;
    const tblNum = table_number || null;

    const completeOrder = await withTransaction(async (client) => {
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

      // Create order with invoice number and VAT breakdown
      const orderRes = await client.query(
        `INSERT INTO pos.orders (order_number, invoice_number, status, total, total_base, total_vat, payment_method, employee_id, table_number)
         VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8)
         RETURNING id, order_number, invoice_number, status, total, total_base, total_vat, payment_method, employee_id, table_number, created_at`,
        [orderNumber, invoiceNumber, total, totalBase, totalVat, payment_method, empId, tblNum]
      );
      const order = orderRes.rows[0];

      // Insert order items
      for (const item of items) {
        await client.query(
          `INSERT INTO pos.order_items (order_id, product_id, qty, unit_price, vat_rate, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [order.id, item.product_id, item.qty, item.price, 10, item.notes || null]
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
