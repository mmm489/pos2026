const BRIDGE_URL =
  process.env.NEXT_PUBLIC_BRIDGE_URL || "http://localhost:3006";

export type CashlogyChargeResult = {
  success: boolean;
  change?: number;
  deposited?: number;
  dispensed?: number;
  pendingDispense?: number;
  cashless?: number;
  changeOwed?: number;
  depositId?: string;
  chargeId?: string;
  connectorStatus?: string | null;
  connectorResult?: string | null;
  connectorType?: string | null;
  cashlessPeripheralId?: string | null;
  cashlessOperationId?: string | null;
  cashlessTransactionNumber?: string | null;
  cashlessAmount?: number | null;
  cancelled?: boolean;
  warning?: string | null;
  error?: string;
};

export async function chargeCashlogy(amount: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);

  try {
    const res = await fetch(`${BRIDGE_URL}/cashlogy/charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, screenVisible: false, topMost: false }),
      signal: controller.signal,
    });
    // Parse even on HTTP errors — bridge returns JSON with error details
    let data: CashlogyChargeResult;
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

export async function chargeCashlogyCashless(amount: number, peripheralId = "") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);

  try {
    const res = await fetch(`${BRIDGE_URL}/cashlogy/charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        screenVisible: true,
        topMost: true,
        type: "CASHLESS",
        peripheralId,
      }),
      signal: controller.signal,
    });
    let data: CashlogyChargeResult;
    try {
      data = await res.json();
    } catch {
      return { success: false, error: `HTTP ${res.status}: respuesta invalida de Cashlogy SNEXT` };
    }
    return data;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return { success: false, error: "Timeout: SNEXT no respondio" };
    }
    return { success: false, error: "Error de conexion con SNEXT" };
  } finally {
    clearTimeout(timeout);
  }
}

export interface IngenicoResult {
  success: boolean;
  operation?: "sale" | "refund" | "cancel";
  // Card provider reference: store this to enable later refund/cancel.
  reference?: string;
  responseCode?: string;
  authorizationCode?: string;
  result?: string;
  receipt?: string;
  // Legacy field kept for compatibility — same value as reference.
  transactionId?: string;
  cashlessPeripheralId?: string | null;
  cashlessOperationId?: string | null;
  cashlessTransactionNumber?: string | null;
  cashlessAmount?: number | null;
  unknown?: boolean;
  cancelled?: boolean;
  busy?: boolean;
  queryCompleted?: boolean;
  error?: string;
}

// Frontend timeout must be longer than bridge (135s) and service (120s).
const INGENICO_TIMEOUT_MS = 150_000;

export async function prepareIngenicoTransaction(): Promise<IngenicoResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${BRIDGE_URL}/ingenico/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: controller.signal,
    });
    return (await res.json()) as IngenicoResult;
  } catch (error) {
    return {
      success: false,
      error:
        (error as Error).name === "AbortError"
          ? "Timeout creando la operacion de tarjeta"
          : "No se pudo preparar la operacion de tarjeta",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function chargeIngenico(
  amount: number,
  orderId?: string,
  transactionId?: string,
  transactionNumber?: string,
): Promise<IngenicoResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INGENICO_TIMEOUT_MS);

  try {
    const res = await fetch(`${BRIDGE_URL}/ingenico/charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, orderId, transactionId, transactionNumber }),
      signal: controller.signal,
    });
    return (await res.json()) as IngenicoResult;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return {
        success: false,
        unknown: true,
        transactionId,
        error: "Timeout: el datáfono no respondió",
      };
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
  orderId?: string,
  transactionId?: string,
): Promise<IngenicoResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INGENICO_TIMEOUT_MS);

  try {
    const res = await fetch(`${BRIDGE_URL}/ingenico/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, orderId, originalReference, transactionId }),
      signal: controller.signal,
    });
    return (await res.json()) as IngenicoResult;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return {
        success: false,
        unknown: true,
        transactionId,
        error: "Timeout: el datáfono no respondió",
      };
    }
    return { success: false, error: "Error de conexión con el datáfono" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Probe the datáfono health. Used by the POS to disable "Targeta" when offline.
 * Returns quickly — short timeout so a polling loop never blocks the UI thread.
 */
export async function getIngenicoHealth(): Promise<{
  online: boolean;
  pinpadInfo?: string;
  error?: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const res = await fetch(`${BRIDGE_URL}/ingenico/health`, { signal: controller.signal });
    if (!res.ok) return { online: false, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { status?: string; pinpadInfo?: string; error?: string };
    return {
      online: data.status === "ok",
      pinpadInfo: data.pinpadInfo,
      error: data.error,
    };
  } catch {
    return { online: false, error: "No connectat" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Abort an in-flight card operation. Tells the datáfono to stop waiting for
 * the card and signals the polling loop to bail out. Short timeout — this
 * should be near-instant and is fire-and-forget from the UI's perspective.
 */
export async function abortIngenico(): Promise<{ success: boolean; cancelled?: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${BRIDGE_URL}/ingenico/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    return (await res.json()) as { success: boolean; cancelled?: boolean; error?: string };
  } catch {
    return { success: false, error: "Error de conexión con el datáfono" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Read-only consultation: ask the datáfono what the card provider recorded for a given transaction UUID.
 * Use this to recover from crashes mid-payment when the local order state is uncertain.
 * Does NOT modify any local state — caller decides what to do with the result.
 */
export async function queryIngenicoTransaction(
  transactionId: string,
  orderId?: string
): Promise<IngenicoResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INGENICO_TIMEOUT_MS);

  try {
    const res = await fetch(`${BRIDGE_URL}/ingenico/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId, orderId }),
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
  dispensedCents?: number;
  pendingDispenseCents?: number;
  cashlessCents?: number;
  status?: string;
  connectorStatus?: string | null;
  connectorResult?: string | null;
  connectorType?: string | null;
  change?: number | null;
  pendingDispense?: number | null;
  cashless?: number | null;
  cashlessPeripheralId?: string | null;
  cashlessOperationId?: string | null;
  cashlessTransactionNumber?: string | null;
  cashlessAmount?: number | null;
  error?: string | null;
  warning?: string | null;
  chargeId?: string | null;
  depositId?: string | null;
}

export async function printIngenicoReceiptCopy(
  transactionNumber: string,
): Promise<{ success: boolean; result?: number; busy?: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const res = await fetch(`${BRIDGE_URL}/ingenico/print-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionNumber }),
      signal: controller.signal,
    });
    return await res.json();
  } catch (error) {
    return {
      success: false,
      error: (error as Error).name === "AbortError"
        ? "Timeout imprimint la copia al datafon"
        : "No s'ha pogut contactar amb el datafon",
    };
  } finally {
    clearTimeout(timeout);
  }
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

export async function getPrinterStatus(): Promise<{
  receipt: { connected: boolean; error?: string };
  kitchen: { connected: boolean; error?: string };
  bridgeOnline: boolean;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const res = await fetch(`${BRIDGE_URL}/printer/status`, { signal: controller.signal });
    if (!res.ok) {
      return {
        receipt: { connected: false, error: `HTTP ${res.status}` },
        kitchen: { connected: false, error: `HTTP ${res.status}` },
        bridgeOnline: true,
      };
    }
    const data = (await res.json()) as {
      receipt: { connected: boolean; error?: string };
      kitchen: { connected: boolean; error?: string };
    };
    return { ...data, bridgeOnline: true };
  } catch {
    return {
      receipt: { connected: false, error: "Bridge offline" },
      kitchen: { connected: false, error: "Bridge offline" },
      bridgeOnline: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function postCashlogyAction<T>(
  path: string,
  body?: Record<string, unknown>,
  timeoutMs = 15_000
): Promise<T & { success?: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BRIDGE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : "{}",
      signal: controller.signal,
    });
    return (await res.json()) as T & { success?: boolean; error?: string };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return { success: false, error: "Timeout comunicant amb la Cashlogy" } as T & {
        success: boolean;
        error: string;
      };
    }
    return { success: false, error: "Error de connexio amb la Cashlogy" } as T & {
      success: boolean;
      error: string;
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function initCashlogy() {
  return postCashlogyAction("/cashlogy/init", undefined, 70_000);
}

export function closeCashlogy() {
  return postCashlogyAction("/cashlogy/close");
}

export function openCashlogyBackOffice() {
  return postCashlogyAction("/cashlogy/backoffice", { topMost: true, screenVisible: true });
}

export function exitCashlogyBackOffice() {
  return postCashlogyAction("/cashlogy/backoffice/exit");
}

export function startCashlogyAddChange() {
  return postCashlogyAction("/cashlogy/add-change", {
    mode: "NORMAL",
    topMost: true,
    screenVisible: true,
  });
}

export function endCashlogyAddChange() {
  return postCashlogyAction("/cashlogy/add-change/end");
}

export function dispenseCashlogy(amount: number, onlyCoins = false) {
  return postCashlogyAction(
    "/cashlogy/dispense",
    { amount, onlyCoins, topMost: true, screenVisible: true },
    30_000
  );
}

export function cancelCashlogyDispense() {
  return postCashlogyAction("/cashlogy/dispense/cancel");
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
  serviceType?: "dine_in" | "takeaway";
  items: {
    name: string;
    qty: number;
    notes?: string | null;
    modifiers?: { name: string; qty: number; notes?: string | null }[];
  }[];
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
 * Print a bank card receipt on the receipt printer.
 * Two copies should be printed for every approved card sale: merchant + customer.
 */
export async function printCardReceipt(
  receipt: string,
  copy: "merchant" | "customer",
  orderNumber?: string
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${BRIDGE_URL}/printer/card-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receipt, copy, orderNumber }),
      signal: controller.signal,
    });
    return (await res.json()) as { success: boolean; error?: string };
  } catch {
    return { success: false, error: "Error de conexión con la impresora" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function printRectifyingTicket(data: {
  refund: {
    rectifying_invoice_number: string | null;
    amount: number;
    total_base: number;
    total_vat: number;
    reason: string;
    items: { product_name: string; qty: number; unit_price: number }[];
  };
  originalInvoiceNumber?: string;
  orderNumber?: string;
  date?: string;
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
    const res = await fetch(`${BRIDGE_URL}/printer/rectifying-ticket`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    return (await res.json()) as { success: boolean; error?: string };
  } catch {
    return { success: false, error: "Error de conexion con la impresora" };
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
  supplier_payments_total?: number;
  supplier_payments_count?: number;
  expected_cash_after_supplier_payments?: number;
  supplier_payments_snapshot?: {
    id: number;
    supplier_name: string;
    amount: number;
    reason: string | null;
    created_at: string;
  }[];
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
  tableNumber?: string;
  serviceType?: "dine_in" | "takeaway";
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
