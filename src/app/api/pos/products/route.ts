import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const products = await sql`
      SELECT p.id, p.name, p.category_id, p.price, p.image_url, p.active, p.sort_order,
             c.name AS category_name, c.color AS category_color
      FROM pos.products p
      JOIN pos.categories c ON c.id = p.category_id
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
    const { name, category_id, price, image_url, sort_order } = body;

    if (!name || !category_id || price == null) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios: name, category_id, price" },
        { status: 400 }
      );
    }

    const sql = getDb();
    const [product] = await sql`
      INSERT INTO pos.products (name, category_id, price, image_url, sort_order)
      VALUES (${name}, ${category_id}, ${price}, ${image_url || null}, ${sort_order || 0})
      RETURNING id, name, category_id, price, image_url, active, sort_order
    `;
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("Error creating product:", error);
    return NextResponse.json(
      { error: "Error al crear producto" },
      { status: 500 }
    );
  }
}
