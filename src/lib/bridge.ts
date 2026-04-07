const BRIDGE_URL =
  process.env.NEXT_PUBLIC_BRIDGE_URL || "http://localhost:3001";

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

export async function printTicket(data: {
  orderNumber: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  paymentMethod: string;
  date: string;
  qrData?: string;
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
