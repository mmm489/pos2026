import { NextRequest, NextResponse } from "next/server";

import { rawQuery } from "@/lib/db";
import { ensurePostSaleSchema } from "@/lib/post-sale-schema";
import { getAuthenticatedEmployee } from "@/lib/pos-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const employee = await getAuthenticatedEmployee(request);
  if (!employee) return NextResponse.json({ error: "Sessio POS no valida" }, { status: 401 });
  if (!employee.can_post_sale_lookup) return NextResponse.json({ error: "No tens permis" }, { status: 403 });
  await ensurePostSaleSchema();
  const incidents = await rawQuery(
    `SELECT o.id, o.order_number, o.total, o.card_payment_status, o.cashless_operation_id,
            o.card_payment_error, o.created_at, e.name AS employee_name
     FROM pos.orders o
     LEFT JOIN pos.employees e ON e.id = o.employee_id
     WHERE o.payment_method IN ('card', 'parked')
       AND o.card_payment_status IN ('awaiting', 'unknown', 'failed')
       AND o.created_at >= NOW() - INTERVAL '30 days'
     ORDER BY o.created_at DESC`,
  );
  return NextResponse.json(incidents);
}

