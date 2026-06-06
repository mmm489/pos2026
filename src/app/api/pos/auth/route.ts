import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { pin } = await request.json();

    if (!pin || pin.length !== 4) {
      return NextResponse.json(
        { error: "PIN debe ser de 4 dígitos" },
        { status: 400 }
      );
    }

    const sql = getDb();
    await ensureEmployeeAccessSchema(sql);
    const [employee] = await sql`
      SELECT id, name, role, can_access_cashlogy, can_access_supplier_payments, can_access_products
      FROM pos.employees
      WHERE pin = ${pin} AND active = true
    `;

    if (!employee) {
      return NextResponse.json(
        { error: "PIN incorrecto" },
        { status: 401 }
      );
    }

    return NextResponse.json(employee);
  } catch (error) {
    console.error("Error authenticating:", error);
    return NextResponse.json(
      { error: "Error de autenticación" },
      { status: 500 }
    );
  }
}

async function ensureEmployeeAccessSchema(sql: ReturnType<typeof getDb>) {
  await sql`
    ALTER TABLE pos.employees
    ADD COLUMN IF NOT EXISTS can_access_cashlogy BOOLEAN NOT NULL DEFAULT true
  `;
  await sql`
    ALTER TABLE pos.employees
    ADD COLUMN IF NOT EXISTS can_access_supplier_payments BOOLEAN NOT NULL DEFAULT true
  `;
  await sql`
    ALTER TABLE pos.employees
    ADD COLUMN IF NOT EXISTS can_access_products BOOLEAN NOT NULL DEFAULT false
  `;
  await sql`
    UPDATE pos.employees
    SET can_access_products = true,
        can_access_cashlogy = true,
        can_access_supplier_payments = true
    WHERE role = 'admin'
  `;
}
