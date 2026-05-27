import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "ID invàlid" }, { status: 400 });
    }

    const body = await request.json();
    const { name, pin, role, active } = body;

    if (pin !== undefined && !/^\d{4}$/.test(pin)) {
      return NextResponse.json(
        { error: "El PIN ha de ser de 4 dígits numèrics" },
        { status: 400 }
      );
    }

    if (role !== undefined && role !== "admin" && role !== "employee") {
      return NextResponse.json(
        { error: "Rol invàlid" },
        { status: 400 }
      );
    }

    const sql = getDb();
    try {
      const [updated] = await sql`
        UPDATE pos.employees
        SET
          name = COALESCE(${name !== undefined ? name : null}, name),
          pin = COALESCE(${pin !== undefined ? pin : null}, pin),
          role = COALESCE(${role !== undefined ? role : null}, role),
          active = COALESCE(${active !== undefined ? active : null}, active)
        WHERE id = ${id}
        RETURNING id, name, pin, role, active
      `;

      if (!updated) {
        return NextResponse.json(
          { error: "Empleat no trobat" },
          { status: 404 }
        );
      }

      return NextResponse.json(updated);
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
    console.error("Error updating employee:", error);
    return NextResponse.json(
      { error: "Error al actualitzar empleat" },
      { status: 500 }
    );
  }
}
