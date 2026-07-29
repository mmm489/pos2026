import { NextRequest, NextResponse } from "next/server";
import { clockOut } from "@/lib/time-clock";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { pin } = await request.json();
    if (!/^\d{4}$/.test(String(pin ?? ""))) {
      return NextResponse.json({ error: "PIN invalid" }, { status: 400 });
    }

    const result = await clockOut(String(pin));
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          employee: "employee" in result ? result.employee : null,
          code: "code" in result ? result.code : null,
          scheduleUrl: "scheduleUrl" in result ? result.scheduleUrl : null,
        },
        { status: result.status }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error clocking out:", error);
    return NextResponse.json(
      { error: "Error registrant sortida" },
      { status: 500 }
    );
  }
}
