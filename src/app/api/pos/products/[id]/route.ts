import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureModifierSchema, normalizeModifierGroupId, setProductModifierGroup } from "@/lib/modifier-groups";

export const dynamic = "force-dynamic";

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
    const { name, category_id, price, vat_rate, image_url, active, sort_order } = body;
    const modifierIncludedCount = cleanInteger(body.modifier_included_count, 0);
    const modifierExtraPrice = cleanMoney(body.modifier_extra_price, 0);

    const sql = getDb();
    await ensureModifierSchema();

    // Build update dynamically using tagged template
    const [updated] = await sql`
      UPDATE pos.products
      SET
        name = COALESCE(${name !== undefined ? name : null}, name),
        category_id = COALESCE(${category_id !== undefined ? category_id : null}, category_id),
        price = COALESCE(${price !== undefined ? price : null}, price),
        vat_rate = COALESCE(${vat_rate !== undefined ? vat_rate : null}, vat_rate),
        image_url = CASE WHEN ${image_url !== undefined} THEN ${image_url ?? null} ELSE image_url END,
        active = COALESCE(${active !== undefined ? active : null}, active),
        sort_order = COALESCE(${sort_order !== undefined ? sort_order : null}, sort_order)
      WHERE id = ${id}
      RETURNING id, name, category_id, price, vat_rate, image_url, active, sort_order
    `;

    if (!updated) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    if (body.modifier_group_id !== undefined) {
      await setProductModifierGroup(
        id,
        normalizeModifierGroupId(body.modifier_group_id),
        modifierIncludedCount,
        modifierExtraPrice
      );
    }

    const [product] = await sql`
      SELECT p.id, p.name, p.category_id, p.price, p.vat_rate, p.image_url, p.active, p.sort_order,
             c.name AS category_name, c.color AS category_color,
             pmg.group_id AS modifier_group_id,
             pmg.included_count AS modifier_included_count,
             pmg.extra_price AS modifier_extra_price
      FROM pos.products p
      JOIN pos.categories c ON c.id = p.category_id
      LEFT JOIN pos.product_modifier_groups pmg ON pmg.product_id = p.id
      WHERE p.id = ${id}
    `;

    return NextResponse.json(product ?? updated);
  } catch (error) {
    console.error("Error updating product:", error);
    return NextResponse.json(
      { error: "Error al actualizar producto" },
      { status: 500 }
    );
  }
}

function cleanInteger(value: unknown, fallback: number) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function cleanMoney(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : fallback;
}
