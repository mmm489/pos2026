import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type CustomerDisplaySnapshot = {
  status: "idle" | "active" | "checkout";
  employeeName: string | null;
  items: unknown[];
  itemCount: number;
  total: number;
  updatedAt: string;
};

const EMPTY_SNAPSHOT: CustomerDisplaySnapshot = {
  status: "idle",
  employeeName: null,
  items: [],
  itemCount: 0,
  total: 0,
  updatedAt: new Date(0).toISOString(),
};

const globalForCustomerDisplay = globalThis as typeof globalThis & {
  hicreamCustomerDisplaySnapshot?: CustomerDisplaySnapshot;
};

function normalizeSnapshot(value: Partial<CustomerDisplaySnapshot>): CustomerDisplaySnapshot {
  const status = value.status === "checkout" || value.status === "active" ? value.status : "idle";
  const items = Array.isArray(value.items) ? value.items : [];
  const total = Number(value.total || 0);
  const itemCount = Number.isFinite(Number(value.itemCount)) ? Number(value.itemCount) : items.length;

  return {
    status,
    employeeName: value.employeeName ? String(value.employeeName) : null,
    items,
    itemCount,
    total: Number.isFinite(total) ? total : 0,
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  return NextResponse.json(globalForCustomerDisplay.hicreamCustomerDisplaySnapshot || EMPTY_SNAPSHOT);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<CustomerDisplaySnapshot>;
    const snapshot = normalizeSnapshot(body);
    globalForCustomerDisplay.hicreamCustomerDisplaySnapshot = snapshot;
    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json({ error: "Snapshot invalid" }, { status: 400 });
  }
}
