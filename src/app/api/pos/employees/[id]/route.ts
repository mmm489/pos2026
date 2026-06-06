import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PATCH() {
  return NextResponse.json(
    { error: "La gestion de empleados se hace solo desde el dashboard." },
    { status: 405 },
  );
}
