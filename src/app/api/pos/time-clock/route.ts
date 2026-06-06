import { NextResponse } from "next/server";
import { listTimeClockSummary } from "@/lib/time-clock";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listTimeClockSummary());
  } catch (error) {
    console.error("Error listing time clock summary:", error);
    return NextResponse.json(
      { error: "Error carregant fitxatges" },
      { status: 500 }
    );
  }
}
