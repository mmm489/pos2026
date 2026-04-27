const BRIDGE_URL =
  process.env.NEXT_PUBLIC_BRIDGE_URL || "http://localhost:3006";

export async function chargeCashlogy(amount: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);

  try {
    const res = await fetch(`${BRIDGE_URL}/cashlogy/charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
      signal: controller.signal,
    });
    // Parse even on HTTP errors — bridge returns JSON with error details
    let data: {
      success: boolean;
      change?: number;
      deposited?: number;
      changeOwed?: number;
      depositId?: string;
      error?: string;
    };
    try {
      data = await res.json();
    } catch {
      return { success: false, error: `HTTP ${res.status}: respuesta inválida de la Cashlogy` };
    }
    return data;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return { success: false, error: "Timeout: la Cashlogy no respondió" };
    }
    return { success: false, error: "Error de conexión con la Cashlogy" };
  } finally {
    clearTimeout(timeout);
  }
}

export interface IngenicoResult {
  success: boolean;
  operation?: "sale" | "refund" | "cancel";
  // Reference (factura) sent to REDSYS — store this to enable later refund/cancel.
  reference?: string;
  responseCode?: string;
  authorizationCode?: string;
  result?: string;
  receipt?: string;
  // Legacy field kept for compatibility — same value as reference.
  transactionId?: string;
  error?: string;
}

// Frontend timeout must be longer than bridge (135s) and service (120s).
const INGENICO_TIMEOUT_MS = 150_000;

export async function chargeIngenico(amount: number, orderId?: string): Promise<IngenicoResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INGENICO_TIMEOUT_MS);

  try {
    const res = await fetch(`${BRIDGE_URL}/ingenico/charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, orderId }),
      signal: controller.signal,
    });
    return (await res.json()) as IngenicoResult;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return { success: false, error: "Timeout: el datáfono no respondió" };
    }
    return { success: false, error: "Error de conexión con el datáfono" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Refund a previous card sale.
 * `originalReference` is the `reference` returned by the original chargeIngenico().
 */
export async function refundIngenico(
  amount: number,
  originalReference: string,
  orderId?: string
): Promise<IngenicoResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INGENICO_TIMEOUT_MS);

  try {
    const res = await fetch(`${BRIDGE_URL}/ingenico/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, orderId, originalReference }),
      signal: controller.signal,
    });
    return (await res.json()) as IngenicoResult;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return { success: false, error: "Timeout: el datáfono no respondió" };
    }
    return { success: false, error: "Error de conexión con el datáfono" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Read-only consultation: ask the datáfono what REDSYS recorded for a given reference.
 * Use this to recover from crashes mid-payment when the local order state is uncertain.
 * Does NOT modify any local state — caller decides what to do with the result.
 */
export async function queryIngenicoTransaction(
  reference: string,
  orderId?: string
): Promise<IngenicoResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INGENICO_TIMEOUT_MS);

  try {
    const res = await fetch(`${BRIDGE_URL}/ingenico/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference, orderId }),
      signal: controller.signal,
    });
    return (await res.json()) as IngenicoResult;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return { success: false, error: "Timeout: el datáfono no respondió" };
    }
    return { success: false, error: "Error de conexión con el datáfono" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Cancel a previous card sale (same-day annulment, before settlement).
 * For sales already settled, use refundIngenico() instead.
 */
export async function cancelIngenico(
  amount: number,
  originalReference: string,
  orderId?: string
): Promise<IngenicoResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INGENICO_TIMEOUT_MS);

  try {
    const res = await fetch(`${BRIDGE_URL}/ingenico/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, orderId, originalReference }),
      signal: controller.signal,
    });
    return (await res.json()) as IngenicoResult;
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
  depositId?: string | null;
}

export async function getCashlogyChargeStatus(): Promise<CashlogyChargeStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const res = await fetch(`${BRIDGE_URL}/cashlogy/charge/status`, { signal: controller.signal });
    if (!res.ok) return { active: false };
    return await res.json();
  } catch {
    return { active: false };
  } finally {
    clearTimeout(timeout);
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

/**
 * Print a Z closing report. Format is different from a regular ticket
 * (no items, has VAT breakdown table, invoice range, signature line).
 */
export async function printZReport(closing: {
  z_label?: string | null;
  closed_at: string;
  total_cash: number;
  total_card: number;
  total_sales: number;
  total_base: number;
  total_vat: number;
  vat_breakdown?: Record<string, { base: number; vat: number; total: number }>;
  ticket_count: number;
  cash_count?: number;
  card_count?: number;
  cancelled_count?: number;
  total_refunded?: number;
  first_invoice?: string | null;
  last_invoice?: string | null;
  notes?: string | null;
  business_snapshot?: {
    name: string;
    trade_name?: string;
    nif: string;
    address: string;
    city: string;
    postal_code: string;
    province: string;
    phone?: string;
  } | null;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${BRIDGE_URL}/printer/z-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(closing),
      signal: controller.signal,
    });
    return (await res.json()) as { success: boolean; error?: string };
  } catch {
    return { success: false, error: "Error de conexión con la impresora" };
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
