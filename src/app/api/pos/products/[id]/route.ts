import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json();
    const { name, category_id, price, image_url, active, sort_order } = body;

    const sql = getDb();

    // Build update dynamically using tagged template
    const [updated] = await sql`
      UPDATE pos.products
      SET
        name = COALESCE(${name !== undefined ? name : null}, name),
        category_id = COALESCE(${category_id !== undefined ? category_id : null}, category_id),
        price = COALESCE(${price !== undefined ? price : null}, price),
        image_url = CASE WHEN ${image_url !== undefined} THEN ${image_url ?? null} ELSE image_url END,
        active = COALESCE(${active !== undefined ? active : null}, active),
        sort_order = COALESCE(${sort_order !== undefined ? sort_order : null}, sort_order)
      WHERE id = ${id}
      RETURNING id, name, category_id, price, image_url, active, sort_order
    `;

    if (!updated) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating product:", error);
    return NextResponse.json(
      { error: "Error al actualizar producto" },
      { status: 500 }
    );
  }
}
