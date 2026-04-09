const BRIDGE_URL =
  process.env.NEXT_PUBLIC_BRIDGE_URL || "http://localhost:3006";

export async function chargeCashlogy(amount: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(`${BRIDGE_URL}/cashlogy/charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
      signal: controller.signal,
    });
    return (await res.json()) as {
      success: boolean;
      change?: number;
      error?: string;
    };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return { success: false, error: "Timeout: la Cashlogy no respondió" };
    }
    return { success: false, error: "Error de conexión con la Cashlogy" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function chargeIngenico(amount: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(`${BRIDGE_URL}/ingenico/charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
      signal: controller.signal,
    });
    return (await res.json()) as {
      success: boolean;
      transactionId?: string;
      error?: string;
    };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return { success: false, error: "Timeout: el datáfono no respondió" };
    }
    return { success: false, error: "Error de conexión con el datáfono" };
  } finally {
    clearTimeout(timeout);
  }
}

export interface CashlogyChargeStatus {
  active: boolean;
  amountCents?: number;
  depositedCents?: number;
  status?: string;
  change?: number | null;
  error?: string | null;
}

export async function getCashlogyChargeStatus(): Promise<CashlogyChargeStatus> {
  try {
    const res = await fetch(`${BRIDGE_URL}/cashlogy/charge/status`);
    return await res.json();
  } catch {
    return { active: false };
  }
}

export async function cancelCashlogy() {
  try {
    const res = await fetch(`${BRIDGE_URL}/cashlogy/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    return (await res.json()) as { success: boolean; error?: string };
  } catch {
    return { success: false, error: "Error de connexió amb la Cashlogy" };
  }
}

export async function getCashlogyState() {
  try {
    const res = await fetch(`${BRIDGE_URL}/cashlogy/state`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (error) {
    return { error: (error as Error).message };
  }
}

export async function printKitchenTicket(data: {
  orderNumber: string;
  tableNumber?: string;
  items: { name: string; qty: number; notes?: string | null }[];
  date?: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${BRIDGE_URL}/printer/kitchen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    return (await res.json()) as { success: boolean; error?: string };
  } catch {
    return { success: false, error: "Error de conexión con la impresora de cocina" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function printTicket(data: {
  orderNumber: string;
  invoiceNumber?: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  totalBase?: number;
  totalVat?: number;
  vatRate?: number;
  paymentMethod: string;
  date: string;
  qrData?: string;
  business?: {
    name: string;
    trade_name: string;
    nif: string;
    address: string;
    city: string;
    postal_code: string;
    province: string;
    phone?: string;
  };
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${BRIDGE_URL}/printer/ticket`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    return (await res.json()) as { success: boolean; error?: string };
  } catch {
    return { success: false, error: "Error de conexión con la impresora" };
  } finally {
    clearTimeout(timeout);
  }
}
