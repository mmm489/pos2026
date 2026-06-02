import { NextRequest, NextResponse } from "next/server";
import { rawQuery, withTransaction } from "@/lib/db";
import { ensureSupplierPaymentsSchema } from "@/lib/supplier-payments";

export const dynamic = "force-dynamic";

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || "http://localhost:3006";

function cleanAmount(value: unknown): number {
  const parsed = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100) / 100;
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

async function dispenseFromCashlogy(amount: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${BRIDGE_URL}/cashlogy/dispense`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        onlyCoins: false,
        topMost: true,
        screenVisible: true,
      }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      return {
        success: false,
        data,
        error: data.error || `Cashlogy HTTP ${response.status}`,
      };
    }
    return { success: true, data, error: null };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Timeout comunicant amb Cashlogy"
        : "Error de connexio amb Cashlogy";
    return { success: false, data: null, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  try {
    await ensureSupplierPaymentsSchema();
    const rows = await rawQuery(
      `SELECT sp.*, e.name AS employee_name
       FROM pos.supplier_payments sp
       LEFT JOIN pos.employees e ON e.id = sp.employee_id
       ORDER BY sp.created_at DESC
       LIMIT 50`
    );
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Error listing supplier payments:", error);
    return NextResponse.json(
      { error: "Error al listar pagaments" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supplierName = cleanText(body.supplier_name, 160);
    const reason = cleanText(body.reason, 500);
    const amount = cleanAmount(body.amount);
    const employeeId = Number(body.employee_id) || null;

    if (!supplierName) {
      return NextResponse.json({ error: "Falta el proveidor" }, { status: 400 });
    }
    if (!amount) {
      return NextResponse.json({ error: "Import invalid" }, { status: 400 });
    }

    const pending = await withTransaction(async (client) => {
      await ensureSupplierPaymentsSchema(client);
      const result = await client.query(
        `INSERT INTO pos.supplier_payments
          (supplier_name, amount, reason, employee_id, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING *`,
        [supplierName, amount, reason || null, employeeId]
      );
      return result.rows[0];
    });

    const dispense = await dispenseFromCashlogy(amount);

    if (!dispense.success) {
      const [row] = await rawQuery(
        `UPDATE pos.supplier_payments
         SET status = 'error',
             error_message = $2,
             cashlogy_result = $3::jsonb,
             synced = false
         WHERE id = $1
         RETURNING *`,
        [pending.id, dispense.error, JSON.stringify(dispense.data ?? {})]
      );
      return NextResponse.json(
        { success: false, error: dispense.error, payment: row },
        { status: 502 }
      );
    }

    const [row] = await rawQuery(
      `UPDATE pos.supplier_payments
       SET status = 'dispensed',
           dispensed_at = NOW(),
           cashlogy_result = $2::jsonb,
           error_message = NULL,
           synced = false
       WHERE id = $1
       RETURNING *`,
      [pending.id, JSON.stringify(dispense.data ?? {})]
    );

    return NextResponse.json({ success: true, payment: row }, { status: 201 });
  } catch (error) {
    console.error("Error creating supplier payment:", error);
    return NextResponse.json(
      { error: "Error registrant pagament" },
      { status: 500 }
    );
  }
}

