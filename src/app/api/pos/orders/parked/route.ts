import { NextRequest, NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { getPusherServer, CHANNEL_ORDERS, EVENT_NEW_ORDER } from "@/lib/pusher";

export const dynamic = "force-dynamic";

type IncomingItem = {
  product_id: number;
  qty: number;
  price: number;
  notes?: string | null;
};

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
  items?: KitchenOrderItem[];
}): Promise<KitchenPrintResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${getBridgeUrl()}/printer/kitchen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderNumber: order.order_number,
        tableNumber: order.table_number || undefined,
        items: (order.items || []).map((item) => ({
          name: item.product_name || "",
          qty: Number(item.qty || 0),
          notes: item.notes || undefined,
        })),
      }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as KitchenPrintResult | null;

    if (!res.ok || !data?.success) {
      return { success: false, error: data?.error || `HTTP ${res.status}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        (error as Error).name === "AbortError"
          ? "Timeout imprimint comanda de cuina"
          : (error as Error).message || "Error imprimint comanda de cuina",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const items = body.items as IncomingItem[] | undefined;

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "Falten productes per aparcar" },
        { status: 400 }
      );
    }

    const parsedParkedOrderId = Number(body.order_id);
    const parkedOrderId = Number.isInteger(parsedParkedOrderId) && parsedParkedOrderId > 0
      ? parsedParkedOrderId
      : null;
    const employeeId = body.employee_id || null;
    const tableNumber = body.table_number || null;

    const parkedOrder = await withTransaction(async (client) => {
      const productIds = Array.from(new Set(items.map((item) => Number(item.product_id))));
      const prodRes = await client.query(
        `SELECT id, vat_rate FROM pos.products WHERE id = ANY($1::int[])`,
        [productIds]
      );
      const vatByProduct = new Map<number, number>();
      for (const row of prodRes.rows) {
        vatByProduct.set(row.id as number, Number(row.vat_rate));
      }

      let total = 0;
      let totalBase = 0;
      let totalVat = 0;
      const itemsWithVat: {
        product_id: number;
        qty: number;
        price: number;
        vat_rate: number;
        notes: string | null;
      }[] = [];

      for (const item of items) {
        const productId = Number(item.product_id);
        const qty = Number(item.qty || 0);
        const price = Number(item.price || 0);
        if (!Number.isInteger(productId) || productId <= 0 || qty <= 0 || price < 0) {
          throw new Error("Linia de ticket no valida");
        }
        const vatRate = vatByProduct.get(productId) ?? 10;
        const lineTotal = Math.round(price * qty * 100) / 100;
        const lineBase = Math.round((lineTotal / (1 + vatRate / 100)) * 100) / 100;
        const lineVat = Math.round((lineTotal - lineBase) * 100) / 100;
        total += lineTotal;
        totalBase += lineBase;
        totalVat += lineVat;
        itemsWithVat.push({
          product_id: productId,
          qty,
          price,
          vat_rate: vatRate,
          notes: item.notes || null,
        });
      }

      total = Math.round(total * 100) / 100;
      totalBase = Math.round(totalBase * 100) / 100;
      totalVat = Math.round(totalVat * 100) / 100;

      let order;
      if (parkedOrderId) {
        const currentRes = await client.query(
          `SELECT id, order_number, payment_method
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
           SET status = 'pending',
               total = $1,
               total_base = $2,
               total_vat = $3,
               employee_id = $4,
               table_number = $5,
               completed_at = NULL
           WHERE id = $6
           RETURNING id, order_number, invoice_number, status, total, total_base, total_vat,
                     payment_method, employee_id, table_number, created_at, completed_at`,
          [total, totalBase, totalVat, employeeId, tableNumber, parkedOrderId]
        );
        order = orderRes.rows[0];
        await client.query(`DELETE FROM pos.order_items WHERE order_id = $1`, [order.id]);
      } else {
        const countRes = await client.query(
          `SELECT COUNT(*)::int AS count FROM pos.orders WHERE created_at::date = CURRENT_DATE`
        );
        const orderNumber = `#${String((countRes.rows[0].count as number) + 1).padStart(3, "0")}`;

        const orderRes = await client.query(
          `INSERT INTO pos.orders
             (order_number, invoice_number, status, total, total_base, total_vat,
              payment_method, employee_id, table_number, completed_at)
           VALUES ($1, NULL, 'pending', $2, $3, $4, 'parked', $5, $6, NULL)
           RETURNING id, order_number, invoice_number, status, total, total_base, total_vat,
                     payment_method, employee_id, table_number, created_at, completed_at`,
          [orderNumber, total, totalBase, totalVat, employeeId, tableNumber]
        );
        order = orderRes.rows[0];
      }

      for (const item of itemsWithVat) {
        await client.query(
          `INSERT INTO pos.order_items (order_id, product_id, qty, unit_price, vat_rate, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [order.id, item.product_id, item.qty, item.price, item.vat_rate, item.notes]
        );
      }

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

    try {
      const pusher = getPusherServer();
      await pusher.trigger(CHANNEL_ORDERS, EVENT_NEW_ORDER, parkedOrder);
    } catch (error) {
      console.error("Pusher emit error:", error);
    }

    const kitchenPrint = await printKitchenTicketForOrder(parkedOrder);

    return NextResponse.json(
      { ...parkedOrder, kitchen_print: kitchenPrint },
      { status: parkedOrderId ? 200 : 201 }
    );
  } catch (error) {
    console.error("Error parking order:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Error aparcant comanda" },
      { status: 500 }
    );
  }
}
