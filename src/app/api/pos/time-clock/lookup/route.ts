import { NextRequest, NextResponse } from "next/server";
import { lookupTimeClockPin } from "@/lib/time-clock";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { pin } = await request.json();
    if (!/^\d{4}$/.test(String(pin ?? ""))) {
      return NextResponse.json({ error: "PIN invalid" }, { status: 400 });
    }

    const result = await lookupTimeClockPin(String(pin));
    if (!result) {
      return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error looking up time clock pin:", error);
    return NextResponse.json(
      { error: "Error comprovant PIN" },
      { status: 500 }
    );
  }
}
