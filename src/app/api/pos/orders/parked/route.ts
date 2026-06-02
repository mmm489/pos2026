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
  skipped?: boolean;
};

type OrderItemWithVat = {
  product_id: number;
  qty: number;
  price: number;
  vat_rate: number;
  notes: string | null;
};

type ExistingOrderItem = {
  product_id: number;
  qty: number;
  unit_price: string | number;
  vat_rate: string | number | null;
  notes: string | null;
  kds_ready?: boolean | null;
  kds_ready_at?: string | Date | null;
};

type InsertableOrderItem = OrderItemWithVat & {
  kds_ready?: boolean;
  kds_ready_at?: string | Date | null;
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

function lineKey(item: { product_id: number; unit_price?: string | number; price?: number; notes?: string | null }) {
  const unitPrice = Number(item.price ?? item.unit_price ?? 0);
  return [
    Number(item.product_id),
    Math.round(unitPrice * 100),
    String(item.notes || "").trim(),
  ].join("|");
}

function splitIncomingItemsForKds(
  incomingItems: OrderItemWithVat[],
  existingItems: ExistingOrderItem[]
): { itemsToInsert: InsertableOrderItem[]; kitchenItems: OrderItemWithVat[] } {
  const existingByKey = new Map<string, { remainingQty: number; ready: boolean; readyAt: string | Date | null }>();
  for (const item of existingItems) {
    const key = lineKey(item);
    const current = existingByKey.get(key);
    const ready = Boolean(item.kds_ready);
    const readyAt = item.kds_ready_at || null;
    if (!current) {
      existingByKey.set(key, {
        remainingQty: Number(item.qty || 0),
        ready,
        readyAt,
      });
    } else {
      current.remainingQty += Number(item.qty || 0);
      current.ready = current.ready && ready;
      current.readyAt = current.readyAt || readyAt;
    }
  }

  const itemsToInsert: InsertableOrderItem[] = [];
  const kitchenItems: OrderItemWithVat[] = [];

  for (const item of incomingItems) {
    const key = lineKey(item);
    const existing = existingByKey.get(key);
    const coveredQty = existing ? Math.min(existing.remainingQty, item.qty) : 0;
    const deltaQty = Math.round((item.qty - coveredQty) * 1000) / 1000;

    if (coveredQty > 0) {
      itemsToInsert.push({
        ...item,
        qty: coveredQty,
        kds_ready: Boolean(existing?.ready),
        kds_ready_at: existing?.readyAt || null,
      });
      if (existing) existing.remainingQty = Math.max(0, existing.remainingQty - coveredQty);
    }

    if (deltaQty > 0) {
      const deltaItem = { ...item, qty: deltaQty };
      itemsToInsert.push({
        ...deltaItem,
        kds_ready: false,
        kds_ready_at: null,
      });
      kitchenItems.push(deltaItem);
    }
  }

  return { itemsToInsert, kitchenItems };
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
      const itemsWithVat: OrderItemWithVat[] = [];

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

      await client.query(`
        ALTER TABLE pos.order_items
        ADD COLUMN IF NOT EXISTS kds_ready BOOLEAN NOT NULL DEFAULT false
      `);
      await client.query(`
        ALTER TABLE pos.order_items
        ADD COLUMN IF NOT EXISTS kds_ready_at TIMESTAMPTZ
      `);

      let order;
      let kitchenItems: OrderItemWithVat[] = itemsWithVat;
      let itemsToInsert: InsertableOrderItem[] = itemsWithVat.map((item) => ({
        ...item,
        kds_ready: false,
        kds_ready_at: null,
      }));

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

        const existingItemsRes = await client.query(
          `SELECT product_id, qty, unit_price, vat_rate, notes, kds_ready, kds_ready_at
           FROM pos.order_items
           WHERE order_id = $1
           ORDER BY id ASC`,
          [parkedOrderId]
        );
        const split = splitIncomingItemsForKds(itemsWithVat, existingItemsRes.rows as ExistingOrderItem[]);
        itemsToInsert = split.itemsToInsert;
        kitchenItems = split.kitchenItems;

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

      for (const item of itemsToInsert) {
        await client.query(
          `INSERT INTO pos.order_items (order_id, product_id, qty, unit_price, vat_rate, notes, kds_ready, kds_ready_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [order.id, item.product_id, item.qty, item.price, item.vat_rate, item.notes, Boolean(item.kds_ready), item.kds_ready_at || null]
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

      const kitchenItemsWithNames = kitchenItems.map((item) => {
        const inserted = itemsRes.rows.find((candidate) =>
          Number(candidate.product_id) === item.product_id &&
          Number(candidate.qty) === item.qty &&
          Number(candidate.unit_price) === item.price &&
          String(candidate.notes || "") === String(item.notes || "")
        );
        return {
          ...item,
          product_name: inserted?.product_name || "",
        };
      });

      return { ...order, items: itemsRes.rows, kitchen_items: kitchenItemsWithNames };
    });

    try {
      const pusher = getPusherServer();
      await pusher.trigger(CHANNEL_ORDERS, EVENT_NEW_ORDER, parkedOrder);
    } catch (error) {
      console.error("Pusher emit error:", error);
    }

    const kitchenItems = (parkedOrder as typeof parkedOrder & { kitchen_items?: KitchenOrderItem[] }).kitchen_items || [];
    const kitchenPrint = kitchenItems.length > 0
      ? await printKitchenTicketForOrder({ ...parkedOrder, items: kitchenItems })
      : { success: true, skipped: true };

    return NextResponse.json(
      { ...parkedOrder, kitchen_print: kitchenPrint, kitchen_items: undefined },
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
