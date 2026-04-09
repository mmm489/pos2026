const VERIFONE_URL = process.env.VERIFONE_SERVICE_URL || "http://127.0.0.1:3007";
const TIMEOUT_MS = 130_000; // slightly longer than VerifoneService's 120s timeout

async function handleIngenicoCharge(req, res) {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: "Importe inválido" });
  }

  try {
    console.log(`[Verifone] Enviant cobrament de ${amount}€ a VerifoneService`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`${VERIFONE_URL}/charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = await response.json();

    console.log(`[Verifone] Resposta:`, data);
    return res.json(data);
  } catch (err) {
    console.error("[Verifone] Error:", err.message);

    if (err.name === "AbortError") {
      return res.json({ success: false, error: "Timeout: el datàfon no ha respost" });
    }

    return res.json({
      success: false,
      error: `No s'ha pogut connectar amb VerifoneService: ${err.message}`,
    });
  }
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

module.exports = { handleIngenicoCharge, handleVerifoneStatus, handleVerifoneHealth };
