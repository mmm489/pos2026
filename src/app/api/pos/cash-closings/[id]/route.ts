import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 });
    }
    const sql = getDb();
    const [row] = await sql`
      SELECT c.*, e.name AS employee_name
      FROM pos.cash_closings c
      LEFT JOIN pos.employees e ON e.id = c.employee_id
      WHERE c.id = ${id}
    `;
    if (!row) {
      return NextResponse.json({ error: "Tancament no trobat" }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (error) {
    console.error("Error fetching cash closing detail:", error);
    return NextResponse.json(
      { error: "Error al obtener detalle" },
      { status: 500 }
    );
  }
}
