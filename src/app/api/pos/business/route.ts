import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const [business] = await sql`
      SELECT name, trade_name, nif, address, city, postal_code, province, phone, invoice_series, next_invoice_number
      FROM pos.business
      LIMIT 1
    `;

    if (!business) {
      return NextResponse.json(
        { error: "No business data found" },
        { status: 404 }
      );
    }

    return NextResponse.json(business);
  } catch (error) {
    console.error("Error fetching business:", error);
    return NextResponse.json(
      { error: "Error al obtener datos de empresa" },
      { status: 500 }
    );
  }
}
