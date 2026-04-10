import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const employees = await sql`
      SELECT id, name, pin, role, active
      FROM pos.employees
      ORDER BY active DESC, name ASC
    `;
    return NextResponse.json(employees);
  } catch (error) {
    console.error("Error fetching employees:", error);
    return NextResponse.json(
      { error: "Error al obtener empleados" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, pin, role } = body;

    if (!name || !pin || !role) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios: name, pin, role" },
        { status: 400 }
      );
    }

    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json(
        { error: "El PIN ha de ser de 4 dígits numèrics" },
        { status: 400 }
      );
    }

    if (role !== "admin" && role !== "employee") {
      return NextResponse.json(
        { error: "Rol invàlid" },
        { status: 400 }
      );
    }

    const sql = getDb();
    try {
      const [employee] = await sql`
        INSERT INTO pos.employees (name, pin, role)
        VALUES (${name}, ${pin}, ${role})
        RETURNING id, name, pin, role, active
      `;
      return NextResponse.json(employee, { status: 201 });
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === "23505") {
        return NextResponse.json(
          { error: "Aquest PIN ja està en ús" },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (error) {
    console.error("Error creating employee:", error);
    return NextResponse.json(
      { error: "Error al crear empleat" },
      { status: 500 }
    );
  }
}
