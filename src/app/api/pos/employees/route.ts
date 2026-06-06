import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql = getDb();
    const employees = await sql`
      SELECT id, name, role, active
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
