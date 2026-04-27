const VERIFONE_URL = process.env.VERIFONE_SERVICE_URL || "http://127.0.0.1:3007";
const TIMEOUT_MS = 135_000; // longer than VerifoneService's 120s timeout, shorter than frontend's 150s

/**
 * Forwards an operation (charge/refund/cancel) to the local VerifoneService.
 * VerifoneService does the polling and returns the final result.
 */
async function forwardToVerifone(opPath, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${VERIFONE_URL}${opPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    // Always parse — VerifoneService returns JSON even on error.
    let data;
    try {
      data = await response.json();
    } catch {
      return { success: false, error: `HTTP ${response.status}: respuesta inválida del datáfono` };
    }
    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      return { success: false, error: "Timeout: el datàfon no ha respost" };
    }
    return { success: false, error: `No s'ha pogut connectar amb VerifoneService: ${err.message}` };
  } finally {
    clearTimeout(timeout);
  }
}

async function handleIngenicoCharge(req, res) {
  const { amount, orderId } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: "Importe inválido" });
  }
  console.log(`[Verifone] Cobrament ${amount}€ (orderId: ${orderId || "—"})`);
  const data = await forwardToVerifone("/charge", { amount, orderId });
  console.log(`[Verifone] Resposta charge:`, data);
  return res.json(data);
}

async function handleIngenicoRefund(req, res) {
  const { amount, orderId, originalReference } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: "Importe inválido" });
  }
  if (!originalReference) {
    return res.status(400).json({
      success: false,
      error: "Falta originalReference (referència de la venda original)",
    });
  }
  console.log(`[Verifone] Devolució ${amount}€ (ref: ${originalReference})`);
  const data = await forwardToVerifone("/refund", { amount, orderId, originalReference });
  console.log(`[Verifone] Resposta refund:`, data);
  return res.json(data);
}

async function handleIngenicoCancel(req, res) {
  const { amount, orderId, originalReference } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: "Importe inválido" });
  }
  if (!originalReference) {
    return res.status(400).json({
      success: false,
      error: "Falta originalReference (referència de la venda original)",
    });
  }
  console.log(`[Verifone] Anul·lació ${amount}€ (ref: ${originalReference})`);
  const data = await forwardToVerifone("/cancel", { amount, orderId, originalReference });
  console.log(`[Verifone] Resposta cancel:`, data);
  return res.json(data);
}

async function handleVerifoneStatus(_req, res) {
  try {
    const response = await fetch(`${VERIFONE_URL}/charge/status`);
    const data = await response.json();
    return res.json(data);
  } catch (err) {
    return res.json({ active: false, status: "disconnected", error: err.message });
  }
}

async function handleVerifoneHealth(_req, res) {
  try {
    const response = await fetch(`${VERIFONE_URL}/health`);
    const data = await response.json();
    return res.json(data);
  } catch (err) {
    return res.json({ status: "offline", error: err.message });
  }
}

module.exports = {
  handleIngenicoCharge,
  handleIngenicoRefund,
  handleIngenicoCancel,
  handleVerifoneStatus,
  handleVerifoneHealth,
};
