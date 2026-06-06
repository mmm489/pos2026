import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql = getDb();
    await ensureEmployeeAccessSchema(sql);
    const employees = await sql`
      SELECT id, name, role, active,
             can_access_cashlogy, can_access_supplier_payments, can_access_products
      FROM pos.employees
      ORDER BY active DESC, name ASC
    `;
    return NextResponse.json(employees);
  } catch (error) {
    console.error("Error fetching employees:", error);
    return NextResponse.json(
      { error: "Error al obtener empleados" },
      { status: 500 },
    );
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "La gestion de empleados se hace solo desde el dashboard." },
    { status: 405 },
  );
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
