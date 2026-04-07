import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
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
        SELECT id, order_number, status, total, payment_method, employee_id, created_at, completed_at
        FROM pos.orders
        WHERE status = ANY(${statuses})
        ORDER BY created_at DESC
      `;
    } else {
      orders = await sql`
        SELECT id, order_number, status, total, payment_method, employee_id, created_at, completed_at
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
    const sql = getDb();
    const body = await request.json();
    const { items, payment_method, employee_id } = body;

    if (!items || items.length === 0 || !payment_method) {
      return NextResponse.json(
        { error: "Faltan campos: items, payment_method" },
        { status: 400 }
      );
    }

    // Calculate total
    const total = items.reduce(
      (sum: number, i: { price: number; qty: number }) => sum + i.price * i.qty,
      0
    );

    // Generate daily order number
    const [countResult] = await sql`
      SELECT COUNT(*)::int AS count
      FROM pos.orders
      WHERE created_at::date = CURRENT_DATE
    `;
    const orderNumber = `#${String((countResult.count as number) + 1).padStart(3, "0")}`;

    // Create order
    const empId = employee_id || null;
    const [order] = await sql`
      INSERT INTO pos.orders (order_number, status, total, payment_method, employee_id)
      VALUES (${orderNumber}, 'pending', ${total}, ${payment_method}, ${empId})
      RETURNING id, order_number, status, total, payment_method, employee_id, created_at
    `;

    // Insert order items
    for (const item of items) {
      const itemNotes = item.notes || null;
      await sql`
        INSERT INTO pos.order_items (order_id, product_id, qty, unit_price, notes)
        VALUES (${order.id}, ${item.product_id}, ${item.qty}, ${item.price}, ${itemNotes})
      `;
    }

    // Fetch complete order with items
    const orderItems = await sql`
      SELECT oi.id, oi.order_id, oi.product_id, oi.qty, oi.unit_price, oi.notes,
             p.name AS product_name
      FROM pos.order_items oi
      JOIN pos.products p ON p.id = oi.product_id
      WHERE oi.order_id = ${order.id}
    `;

    const completeOrder = { ...order, items: orderItems };

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
