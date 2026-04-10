const CASHLOGY_BASE = process.env.CASHLOGY_URL || "http://127.0.0.1:3000";
const CASHLOGY_API = `${CASHLOGY_BASE}/connectorPlus`;
const CASHLOGY_API_KEY = process.env.CASHLOGY_API_KEY || "";
const POLL_INTERVAL = 500;
// Separate timeouts so that a slow deposit doesn't eat into dispense time
const DEPOSIT_TIMEOUT_MS = Number(process.env.CASHLOGY_DEPOSIT_TIMEOUT_MS) || 180_000; // 3 min
const DEPOSIT_END_TIMEOUT_MS = Number(process.env.CASHLOGY_DEPOSIT_END_TIMEOUT_MS) || 15_000;
const DISPENSE_TIMEOUT_MS = Number(process.env.CASHLOGY_DISPENSE_TIMEOUT_MS) || 30_000;

// Shared state so the frontend can poll progress
let currentCharge = null; // { amountCents, depositedCents, status, change, error }

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function cashlogyRequest(path, method = "GET", body = null, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const options = {
    method,
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      ...(CASHLOGY_API_KEY && { X_API_KEY: CASHLOGY_API_KEY }),
    },
  };
  if (body !== null) options.body = JSON.stringify(body);

  try {
    const res = await fetch(`${CASHLOGY_API}${path}`, options);
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Cashlogy HTTP ${res.status}: ${text}`);
    }
    return text ? JSON.parse(text) : {};
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Cashlogy timeout (${timeoutMs}ms) on ${path}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * GET /cashlogy/charge/status — frontend polls this for real-time progress
 */
function handleCashlogyChargeStatus(_req, res) {
  if (!currentCharge) {
    return res.json({ active: false });
  }
  const { amountCents, depositedCents, status, change, error, depositId } = currentCharge;
  return res.json({
    active: true,
    amountCents,
    depositedCents,
    status, // "depositing" | "closing" | "dispensing" | "done" | "error" | "cancelled"
    change: change ?? null,
    error: error ?? null,
    depositId: depositId ?? null,
  });
}

/**
 * Charge flow using deposit + dispense (same as BDP):
 * 1. POST /deposit       → open cash intake
 * 2. GET  /deposit/status → poll until deposited >= amount
 * 3. POST /deposit/end    → close cash intake
 * 4. POST /dispense       → dispense change if needed
 */
async function handleCashlogyCharge(req, res) {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: "Import invàlid" });
  }

  // Idempotency guard: reject if there's an active charge in progress
  if (currentCharge && ["depositing", "closing", "dispensing"].includes(currentCharge.status)) {
    console.warn("[Cashlogy] Rebutjant nova càrrega — ja hi ha una operació activa:", currentCharge.status);
    return res.status(409).json({
      success: false,
      error: "Ja hi ha un cobrament en curs. Espera que acabi o cancel·la'l.",
    });
  }

  const amountCents = Math.round(amount * 100);

  // Initialize shared state
  currentCharge = { amountCents, depositedCents: 0, status: "depositing", change: null, error: null, depositId: null };

  try {
    // 1. Start deposit
    console.log(`[Cashlogy] Iniciant dipòsit: ${amountCents} cèntims (${amount.toFixed(2)}€)`);
    const depositRes = await cashlogyRequest("/deposit", "POST", {});
    console.log("[Cashlogy] Deposit response:", JSON.stringify(depositRes));

    if (!depositRes.id) {
      currentCharge.status = "error";
      currentCharge.error = "No s'ha rebut ID de dipòsit";
      return res.json({ success: false, error: currentCharge.error });
    }

    currentCharge.depositId = depositRes.id;

    // 2. Poll until enough money or timeout
    const deadline = Date.now() + DEPOSIT_TIMEOUT_MS;
    let depositedCents = 0;

    while (Date.now() < deadline) {
      // Check if cancelled by frontend
      if (currentCharge.status === "cancelled") {
        console.log("[Cashlogy] Cancel·lat pel frontend");
        try { await cashlogyRequest("/deposit/end", "POST", {}); } catch {}
        return res.json({ success: false, error: "Cancel·lat per l'usuari" });
      }

      await sleep(POLL_INTERVAL);

      const status = await cashlogyRequest("/deposit/status");

      if (status.deposited) {
        const dep = status.deposited;
        depositedCents = (dep.coinbox || 0) + (dep.recyclers || 0) + (dep.safebox || 0) + (dep.stacker || 0);
        currentCharge.depositedCents = depositedCents;
      }

      if (status.status === "FINISHED") {
        if (status.result !== "SUCCESS") {
          currentCharge.status = "cancelled";
          currentCharge.error = status.result || "Dipòsit cancel·lat";
          return res.json({ success: false, error: currentCharge.error });
        }
        break;
      }

      if (depositedCents >= amountCents) {
        console.log(`[Cashlogy] Prou diners: ${depositedCents} cèntims`);
        currentCharge.status = "closing";
        try {
          await cashlogyRequest("/deposit/end", "POST", {});
        } catch (e) {
          console.error("[Cashlogy] Error tancant dipòsit:", e.message);
        }
        // Wait for FINISHED
        const endDeadline = Date.now() + DEPOSIT_END_TIMEOUT_MS;
        while (Date.now() < endDeadline) {
          await sleep(POLL_INTERVAL);
          const endStatus = await cashlogyRequest("/deposit/status");
          if (endStatus.status === "FINISHED") break;
        }
        break;
      }
    }

    if (depositedCents < amountCents && Date.now() >= deadline) {
      currentCharge.status = "error";
      currentCharge.error = "Timeout: no s'han introduït prou diners";
      try { await cashlogyRequest("/deposit/end", "POST", {}); } catch {}
      return res.json({ success: false, error: currentCharge.error });
    }

    // 4. Dispense change if needed
    const changeCents = depositedCents - amountCents;
    const changeEur = changeCents / 100;
    currentCharge.change = changeEur;

    if (changeCents > 0) {
      currentCharge.status = "dispensing";
      console.log(`[Cashlogy] Dispensant canvi: ${changeCents} cèntims (${changeEur.toFixed(2)}€)`);
      try {
        await cashlogyRequest("/dispense", "POST", { amount: changeCents });
        const dispDeadline = Date.now() + DISPENSE_TIMEOUT_MS;
        while (Date.now() < dispDeadline) {
          await sleep(POLL_INTERVAL);
          const dispStatus = await cashlogyRequest("/status");
          if (dispStatus.status !== "busy") break;
        }
      } catch (dispErr) {
        // IMPORTANT: do NOT treat dispense failure as success.
        // If the machine cannot return change (no coins/bills, hardware error),
        // the employee must know so they can give change manually.
        console.error("[Cashlogy] Error dispensant canvi:", dispErr.message);
        currentCharge.status = "error";
        currentCharge.error = `No s'ha pogut dispensar el canvi (${changeEur.toFixed(2)}€): ${dispErr.message}`;
        return res.json({
          success: false,
          error: currentCharge.error,
          deposited: depositedCents / 100,
          changeOwed: changeEur,
          depositId: currentCharge.depositId,
        });
      }
    }

    currentCharge.status = "done";
    console.log(`[Cashlogy] Cobrament OK — rebut: ${depositedCents} cèntims, canvi: ${changeEur.toFixed(2)}€`);
    return res.json({
      success: true,
      change: changeEur,
      deposited: depositedCents / 100,
      depositId: currentCharge.depositId,
    });
  } catch (err) {
    console.error("[Cashlogy] Error:", err.message);
    currentCharge.status = "error";
    currentCharge.error = err.message;
    return res.json({ success: false, error: err.message });
  }
}

async function handleCashlogyCancel(_req, res) {
  try {
    console.log("[Cashlogy] Cancel·lant operació en curs...");
    if (currentCharge) currentCharge.status = "cancelled";
    const endRes = await cashlogyRequest("/deposit/end", "POST", {});
    console.log("[Cashlogy] Cancel response:", JSON.stringify(endRes));
    return res.json({ success: true });
  } catch (err) {
    console.error("[Cashlogy] Cancel error:", err.message);
    return res.json({ success: false, error: err.message });
  }
}

async function handleCashlogyState(_req, res) {
  try {
    const state = await cashlogyRequest("/cashlogyState", "POST", {});
    console.log("[Cashlogy] State:", JSON.stringify(state));
    return res.json(state);
  } catch (err) {
    console.error("[Cashlogy] State error:", err.message);
    return res.status(502).json({ error: err.message });
  }
}

module.exports = { handleCashlogyCharge, handleCashlogyChargeStatus, handleCashlogyCancel, handleCashlogyState };
