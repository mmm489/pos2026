import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * Recent card-datafono interactions for admin debugging / reconciliation.
 * Filters: ?operation=charge|refund|cancel|query|abort, ?reference=xxx,
 * ?date=YYYY-MM-DD. Default: last 100 entries.
 */
export async function GET(request: NextRequest) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(request.url);
    const operation = searchParams.get("operation");
    const reference = searchParams.get("reference");
    const date = searchParams.get("date");

    let rows;
    if (operation && reference) {
      rows = await sql`
        SELECT * FROM pos.card_transactions
        WHERE operation = ${operation} AND reference = ${reference}
        ORDER BY created_at DESC
        LIMIT 100
      `;
    } else if (operation) {
      rows = await sql`
        SELECT * FROM pos.card_transactions
        WHERE operation = ${operation}
        ORDER BY created_at DESC
        LIMIT 100
      `;
    } else if (reference) {
      rows = await sql`
        SELECT * FROM pos.card_transactions
        WHERE reference = ${reference}
        ORDER BY created_at DESC
        LIMIT 100
      `;
    } else if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      rows = await sql`
        SELECT * FROM pos.card_transactions
        WHERE created_at >= ${date + "T00:00:00Z"}::timestamptz
          AND created_at < (${date + "T00:00:00Z"}::timestamptz + INTERVAL '1 day')
        ORDER BY created_at DESC
        LIMIT 200
      `;
    } else {
      rows = await sql`
        SELECT * FROM pos.card_transactions
        ORDER BY created_at DESC
        LIMIT 100
      `;
    }

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Error fetching card transactions:", error);
    return NextResponse.json(
      { error: "Error al cargar transaccions" },
      { status: 500 }
    );
  }
}
