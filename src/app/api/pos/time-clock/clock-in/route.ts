import { NextRequest, NextResponse } from "next/server";
import { clockIn } from "@/lib/time-clock";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { pin } = await request.json();
    if (!/^\d{4}$/.test(String(pin ?? ""))) {
      return NextResponse.json({ error: "PIN invalid" }, { status: 400 });
    }

    const result = await clockIn(String(pin));
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error clocking in:", error);
    return NextResponse.json(
      { error: "Error registrant entrada" },
      { status: 500 }
    );
  }
}
