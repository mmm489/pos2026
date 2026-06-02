"use client";

export const CUSTOMER_DISPLAY_CHANNEL = "hicream-customer-display";
export const CUSTOMER_DISPLAY_STORAGE_KEY = "hicream_customer_display_snapshot";

export type CustomerDisplayStatus = "idle" | "active" | "checkout";

export interface CustomerDisplayModifier {
  lineId: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  note: string | null;
}

export interface CustomerDisplayLine {
  lineId: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  note: string | null;
  modifiers: CustomerDisplayModifier[];
}

export interface CustomerDisplaySnapshot {
  status: CustomerDisplayStatus;
  employeeName: string | null;
  items: CustomerDisplayLine[];
  itemCount: number;
  total: number;
  updatedAt: string;
}

export function publishCustomerDisplaySnapshot(snapshot: CustomerDisplaySnapshot) {
  if (typeof window === "undefined") return;

  const next = {
    ...snapshot,
    updatedAt: new Date().toISOString(),
  };
  const serialized = JSON.stringify(next);

  try {
    window.localStorage.setItem(CUSTOMER_DISPLAY_STORAGE_KEY, serialized);
  } catch {
    // Local storage can be unavailable in private/kiosk modes.
  }

  try {
    const channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
    channel.postMessage(next);
    channel.close();
  } catch {
    // BroadcastChannel is best-effort; localStorage is the fallback.
  }

  try {
    void fetch("/api/pos/customer-display", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: serialized,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Server sync is best-effort; same-profile browser storage still works.
  }

  window.dispatchEvent(
    new CustomEvent<CustomerDisplaySnapshot>(CUSTOMER_DISPLAY_CHANNEL, {
      detail: next,
    })
  );
}

export function readCustomerDisplaySnapshot(): CustomerDisplaySnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CUSTOMER_DISPLAY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CustomerDisplaySnapshot) : null;
  } catch {
    return null;
  }
}

export function subscribeCustomerDisplay(
  callback: (snapshot: CustomerDisplaySnapshot) => void
) {
  if (typeof window === "undefined") return () => {};

  let channel: BroadcastChannel | null = null;

  const handleMessage = (event: MessageEvent<CustomerDisplaySnapshot>) => {
    callback(event.data);
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== CUSTOMER_DISPLAY_STORAGE_KEY || !event.newValue) return;
    try {
      callback(JSON.parse(event.newValue) as CustomerDisplaySnapshot);
    } catch {
      // Ignore malformed stale values.
    }
  };
  const handleLocalEvent = (event: Event) => {
    callback((event as CustomEvent<CustomerDisplaySnapshot>).detail);
  };

  try {
    channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
    channel.addEventListener("message", handleMessage);
  } catch {
    channel = null;
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(CUSTOMER_DISPLAY_CHANNEL, handleLocalEvent);

  return () => {
    if (channel) {
      channel.removeEventListener("message", handleMessage);
      channel.close();
    }
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(CUSTOMER_DISPLAY_CHANNEL, handleLocalEvent);
  };
}
