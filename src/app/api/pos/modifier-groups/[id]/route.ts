import { NextRequest, NextResponse } from "next/server";

import { updateModifierGroup } from "@/lib/modifier-groups";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "ID invalido" }, { status: 400 });
    }

    const body = await request.json();
    const group = await updateModifierGroup(id, {
      name: body.name,
      description: body.description,
      sort_order: body.sort_order,
      active: body.active,
      category_ids: Array.isArray(body.category_ids) ? body.category_ids : undefined,
    });

    if (!group) {
      return NextResponse.json({ error: "Pagina no encontrada" }, { status: 404 });
    }

    return NextResponse.json(group);
  } catch (error) {
    console.error("Error updating modifier group:", error);
    return NextResponse.json(
      { error: "Error al actualizar pagina de toppings" },
      { status: 500 }
    );
  }
}
