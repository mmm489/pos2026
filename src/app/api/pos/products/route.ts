import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureModifierSchema, normalizeModifierGroupId, setProductModifierGroup } from "@/lib/modifier-groups";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("all") === "true";
    await ensureModifierSchema();

    const products = includeInactive
      ? await sql`
          SELECT p.id, p.name, p.category_id, p.price, p.vat_rate, p.image_url, p.active, p.sort_order,
                 c.name AS category_name, c.color AS category_color,
                 pmg.group_id AS modifier_group_id
          FROM pos.products p
          JOIN pos.categories c ON c.id = p.category_id
          LEFT JOIN pos.product_modifier_groups pmg ON pmg.product_id = p.id
          ORDER BY p.active DESC, c.sort_order ASC, p.sort_order ASC
        `
      : await sql`
          SELECT p.id, p.name, p.category_id, p.price, p.vat_rate, p.image_url, p.active, p.sort_order,
                 c.name AS category_name, c.color AS category_color,
                 pmg.group_id AS modifier_group_id
          FROM pos.products p
          JOIN pos.categories c ON c.id = p.category_id
          LEFT JOIN pos.product_modifier_groups pmg ON pmg.product_id = p.id
          WHERE p.active = true
          ORDER BY c.sort_order ASC, p.sort_order ASC
        `;

    return NextResponse.json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      { error: "Error al obtener productos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, category_id, price, vat_rate, image_url, sort_order, active } = body;
    const modifierGroupId = normalizeModifierGroupId(body.modifier_group_id);

    if (!name || !category_id || price == null) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios: name, category_id, price" },
        { status: 400 }
      );
    }

    const sql = getDb();
    await ensureModifierSchema();
    const [product] = await sql`
      INSERT INTO pos.products (name, category_id, price, vat_rate, image_url, active, sort_order)
      VALUES (${name}, ${category_id}, ${price}, ${vat_rate ?? 10}, ${image_url || null}, ${active !== false}, ${sort_order || 0})
      RETURNING id, name, category_id, price, vat_rate, image_url, active, sort_order
    `;
    await setProductModifierGroup(Number(product.id), modifierGroupId);
    return NextResponse.json({ ...product, modifier_group_id: modifierGroupId }, { status: 201 });
  } catch (error) {
    console.error("Error creating product:", error);
    return NextResponse.json(
      { error: "Error al crear producto" },
      { status: 500 }
    );
  }
}
