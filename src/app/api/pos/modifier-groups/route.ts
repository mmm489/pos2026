import { NextRequest, NextResponse } from "next/server";

import {
  createModifierGroup,
  listModifierGroups,
} from "@/lib/modifier-groups";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("all") === "true";
    const groups = await listModifierGroups(includeInactive);
    return NextResponse.json(groups);
  } catch (error) {
    console.error("Error fetching modifier groups:", error);
    return NextResponse.json(
      { error: "Error al obtener paginas de toppings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json(
        { error: "El nombre de la pagina es obligatorio" },
        { status: 400 }
      );
    }

    const group = await createModifierGroup({
      name,
      description: body.description ?? null,
      sort_order: body.sort_order,
      active: body.active !== false,
      category_ids: Array.isArray(body.category_ids) ? body.category_ids : [],
    });

    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    console.error("Error creating modifier group:", error);
    return NextResponse.json(
      { error: "Error al crear pagina de toppings" },
      { status: 500 }
    );
  }
}
