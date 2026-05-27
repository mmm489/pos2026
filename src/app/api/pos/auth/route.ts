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
    const [employee] = await sql`
      SELECT id, name, role
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
