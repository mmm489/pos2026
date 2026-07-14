import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { clearPosSession, getAuthenticatedEmployee, setPosSession } from "@/lib/pos-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const employee = await getAuthenticatedEmployee(request);
  if (!employee) return NextResponse.json({ error: "Sessio no valida" }, { status: 401 });
  return NextResponse.json(employee);
}

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
      SELECT id, name, role, can_access_cashlogy, can_access_supplier_payments, can_access_products,
             CASE WHEN role = 'admin' THEN true ELSE can_post_sale_lookup END AS can_post_sale_lookup,
             CASE WHEN role = 'admin' THEN true ELSE can_refund_sales END AS can_refund_sales
      FROM pos.employees
      WHERE pin = ${pin} AND active = true
    `;

    if (!employee) {
      return NextResponse.json(
        { error: "PIN incorrecto" },
        { status: 401 }
      );
    }

    const response = NextResponse.json(employee);
    setPosSession(response, Number(employee.id));
    return response;
  } catch (error) {
    console.error("Error authenticating:", error);
    return NextResponse.json(
      { error: "Error de autenticación" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  clearPosSession(response);
  return response;
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
    ALTER TABLE pos.employees
    ADD COLUMN IF NOT EXISTS can_post_sale_lookup BOOLEAN NOT NULL DEFAULT true
  `;
  await sql`
    ALTER TABLE pos.employees
    ADD COLUMN IF NOT EXISTS can_refund_sales BOOLEAN NOT NULL DEFAULT false
  `;
  await sql`
    UPDATE pos.employees
    SET can_access_products = true,
        can_access_cashlogy = true,
        can_access_supplier_payments = true,
        can_post_sale_lookup = true,
        can_refund_sales = true
    WHERE role = 'admin'
  `;
}
