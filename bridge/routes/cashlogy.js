const fs = require("fs");
const path = require("path");

const CASHLOGY_BASE = process.env.CASHLOGY_URL || "http://127.0.0.1:3000";
const CASHLOGY_API = `${CASHLOGY_BASE}/connectorPlus`;
const POLL_INTERVAL_MS = Number(process.env.CASHLOGY_POLL_INTERVAL_MS) || 500;
const INIT_TIMEOUT_MS = Number(process.env.CASHLOGY_INIT_TIMEOUT_MS) || 60_000;
const CHARGE_TIMEOUT_MS = Number(process.env.CASHLOGY_CHARGE_TIMEOUT_MS) || 180_000;
const OPERATION_TIMEOUT_MS = Number(process.env.CASHLOGY_OPERATION_TIMEOUT_MS) || 120_000;
const MACHINE_CODE = process.env.CASHLOGY_MACHINE_CODE || "hicream-pos";
const CHARGE_SCREEN_VISIBLE = parseBoolean(process.env.CASHLOGY_CHARGE_SCREEN_VISIBLE, false);
const CHARGE_TOP_MOST = parseBoolean(process.env.CASHLOGY_CHARGE_TOP_MOST, false);
const CERT_TRAFFIC_LIMIT = Number(process.env.CASHLOGY_CERT_TRAFFIC_LIMIT) || 250;

let currentCharge = null;
const certTraffic = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "si", "s"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function readApiKeyFromFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return "";
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function getCashlogyApiKey() {
  if (process.env.CASHLOGY_API_KEY) return process.env.CASHLOGY_API_KEY.trim();

  const configuredPath = process.env.CASHLOGY_API_KEY_FILE;
  const fromConfiguredFile = readApiKeyFromFile(configuredPath);
  if (fromConfiguredFile) return fromConfiguredFile;

  const userProfile = process.env.USERPROFILE || process.env.HOME || "";
  const defaultDownloadPath = path.join(
    userProfile,
    "Downloads",
    "Integracion API - ConnectorPlus",
    "API-KEY.txt"
  );
  return readApiKeyFromFile(defaultDownloadPath);
}

function normalizeErrorMessage(err) {
  if (!err) return "Error desconegut de Cashlogy";
  if (err.name === "AbortError") return "Timeout comunicant amb Cashlogy";
  return err.message || String(err);
}

async function cashlogyRequest(pathname, method = "GET", body = null, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const apiKey = getCashlogyApiKey();
  const startedAt = Date.now();
  const trafficEntry = {
    id: `${startedAt}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date(startedAt).toISOString(),
    method,
    path: pathname,
    request: body,
    timeoutMs,
    ok: false,
    status: null,
    durationMs: null,
    response: null,
    error: null,
  };

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  const options = { method, signal: controller.signal, headers };
  if (body !== null) options.body = JSON.stringify(body);

  try {
    const response = await fetch(`${CASHLOGY_API}${pathname}`, options);
    const text = await response.text();
    let data = {};

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    if (!response.ok) {
      const detail = text || response.statusText;
      trafficEntry.ok = false;
      trafficEntry.status = response.status;
      trafficEntry.response = data;
      trafficEntry.durationMs = Date.now() - startedAt;
      pushCertTraffic(trafficEntry);
      throw new Error(`Cashlogy HTTP ${response.status}: ${detail}`);
    }

    trafficEntry.ok = true;
    trafficEntry.status = response.status;
    trafficEntry.response = data;
    trafficEntry.durationMs = Date.now() - startedAt;
    pushCertTraffic(trafficEntry);
    return data;
  } catch (err) {
    if (!trafficEntry.durationMs) {
      trafficEntry.durationMs = Date.now() - startedAt;
      trafficEntry.error = normalizeErrorMessage(err);
      pushCertTraffic(trafficEntry);
    }
    if (err.name === "AbortError") {
      throw new Error(`Cashlogy timeout (${timeoutMs}ms) on ${pathname}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function pushCertTraffic(entry) {
  certTraffic.unshift(entry);
  if (certTraffic.length > CERT_TRAFFIC_LIMIT) certTraffic.length = CERT_TRAFFIC_LIMIT;
}

function parseAmountCents(amountCents, amountEuros) {
  if (amountCents !== undefined && amountCents !== null) {
    const cents = Number(amountCents);
    if (!Number.isFinite(cents) || cents <= 0) return null;
    return Math.round(cents);
  }

  const euros = Number(amountEuros);
  if (!Number.isFinite(euros) || euros <= 0) return null;
  return Math.round(euros * 100);
}

function parseCents(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function connectorChargeToState(op) {
  if (!op) {
    return {
      depositedCents: 0,
      dispensedCents: 0,
      status: "depositing",
      connectorStatus: null,
      connectorResult: null,
      error: null,
      finished: false,
    };
  }

  const depositedCents = parseCents(op.amount?.deposited);
  const dispensedCents = parseCents(op.amount?.dispensed);
  const connectorStatus = op.status || null;
  const connectorResult = op.result || null;

  if (connectorStatus === "FINISHED") {
    if (connectorResult === "SUCCESS") {
      return {
        depositedCents,
        dispensedCents,
        status: "done",
        connectorStatus,
        connectorResult,
        error: null,
        finished: true,
      };
    }
    if (connectorResult === "CANCELLED") {
      return {
        depositedCents,
        dispensedCents,
        status: "cancelled",
        connectorStatus,
        connectorResult,
        error: "Operacio cancel.lada",
        finished: true,
      };
    }
    return {
      depositedCents,
      dispensedCents,
      status: "error",
      connectorStatus,
      connectorResult,
      error: connectorResult || "Operacio Cashlogy fallida",
      finished: true,
    };
  }

  if (connectorStatus === "DISPENSE_FAILED") {
    return {
      depositedCents,
      dispensedCents,
      status: "error",
      connectorStatus,
      connectorResult,
      error: "No s'ha pogut dispensar el canvi",
      finished: true,
    };
  }

  const status =
    connectorStatus === "DISPENSING"
      ? "dispensing"
      : connectorStatus === "PROCESSING"
        ? "closing"
        : "depositing";

  return {
    depositedCents,
    dispensedCents,
    status,
    connectorStatus,
    connectorResult,
    error: null,
    finished: false,
  };
}

function updateCurrentChargeFromConnector(op) {
  if (!currentCharge) return null;

  const mapped = connectorChargeToState(op);
  currentCharge.depositedCents = mapped.depositedCents;
  currentCharge.dispensedCents = mapped.dispensedCents;
  currentCharge.status = mapped.status;
  currentCharge.connectorStatus = mapped.connectorStatus;
  currentCharge.connectorResult = mapped.connectorResult;
  currentCharge.error = mapped.error;
  currentCharge.finishedAt = op?.finishedAt || currentCharge.finishedAt || null;
  currentCharge.raw = op || currentCharge.raw || null;
  currentCharge.change = mapped.dispensedCents / 100;

  return mapped;
}

function isChargeActive() {
  return Boolean(
    currentCharge &&
      !["done", "error", "cancelled"].includes(currentCharge.status)
  );
}

async function getPrimaryCashPeripheral() {
  const peripherals = await cashlogyRequest("/peripherals", "GET", null, 8_000);
  const cash = Array.isArray(peripherals.cash) ? peripherals.cash : [];
  return cash.find((p) => p.isPrimary) || cash[0] || null;
}

async function waitForInit() {
  const deadline = Date.now() + INIT_TIMEOUT_MS;
  let lastStatus = null;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    lastStatus = await cashlogyRequest("/init/status", "GET", null, 8_000);
    if (lastStatus.status === "FINISHED") {
      if (lastStatus.result === "SUCCESS") return lastStatus;
      throw new Error(`Init Cashlogy fallit: ${lastStatus.result || "FAILED"}`);
    }
  }

  throw new Error(`Timeout inicialitzant Cashlogy (${INIT_TIMEOUT_MS}ms)`);
}

async function runStartupInit() {
  const init = await cashlogyRequest("/init", "POST", {}, 15_000);
  if (init.result !== "SUCCESS") {
    throw new Error(`No s'ha pogut iniciar Cashlogy: ${init.result || "FAILED"}`);
  }

  const status = await waitForInit();
  const refreshedPeripheral = await getPrimaryCashPeripheral().catch(() => null);
  return { initialized: true, alreadyAvailable: false, status, peripheral: refreshedPeripheral };
}

async function requireCashlogyReady() {
  const peripheral = await getPrimaryCashPeripheral().catch(() => null);
  if (peripheral?.status === "AVAILABLE") {
    return { ready: true, peripheral };
  }

  throw new Error(
    "Cashlogy no esta inicialitzada o no esta disponible. Reinicia el POS per executar la inicialitzacio inicial."
  );
}

async function getChargeOperation(chargeId) {
  const status = await cashlogyRequest("/charge/status", "GET", null, 8_000);
  return chargeId ? status?.[chargeId] || null : status;
}

async function cancelCurrentCharge() {
  if (!currentCharge?.chargeId) return { success: true, skipped: true };
  currentCharge.cancelRequested = true;
  const result = await cashlogyRequest(
    `/charge/${currentCharge.chargeId}/cancel`,
    "POST",
    {},
    10_000
  );
  currentCharge.status = "cancelled";
  currentCharge.error = "Operacio cancel.lada";
  return result;
}

function handleCashlogyChargeStatus(_req, res) {
  if (!currentCharge) return res.json({ active: false });

  const amountCents = currentCharge.amountCents || 0;
  const depositedCents = currentCharge.depositedCents || 0;
  const dispensedCents = currentCharge.dispensedCents || 0;
  const active = !["done", "error", "cancelled"].includes(currentCharge.status);

  return res.json({
    active,
    amountCents,
    depositedCents,
    dispensedCents,
    status: currentCharge.status,
    connectorStatus: currentCharge.connectorStatus || null,
    connectorResult: currentCharge.connectorResult || null,
    change: dispensedCents / 100,
    error: currentCharge.error || null,
    chargeId: currentCharge.chargeId || null,
    depositId: currentCharge.chargeId || null,
  });
}

async function handleCashlogyCharge(req, res) {
  const amountCents = parseAmountCents(req.body?.amountCents, req.body?.amount);

  if (!amountCents) {
    return res.status(400).json({ success: false, error: "Import invalid" });
  }

  if (isChargeActive()) {
    return res.status(409).json({
      success: false,
      error: "Ja hi ha un cobrament en curs. Espera que acabi o cancel.la'l.",
      chargeId: currentCharge.chargeId,
    });
  }

  const ticketNumber =
    req.body?.ticketNumber ||
    req.body?.orderId ||
    `cash-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;

  currentCharge = {
    chargeId: null,
    amountCents,
    depositedCents: 0,
    dispensedCents: 0,
    status: "initializing",
    connectorStatus: null,
    connectorResult: null,
    change: 0,
    error: null,
    cancelRequested: false,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    raw: null,
  };

  try {
    console.log(`[Cashlogy] Charge ${amountCents} cents (${ticketNumber})`);
    await requireCashlogyReady();

    currentCharge.status = "depositing";
    const start = await cashlogyRequest(
      "/charge",
      "POST",
      {
        price: amountCents,
        ticketNumber,
        machineCode: req.body?.machineCode || MACHINE_CODE,
        secondScreen: Boolean(req.body?.secondScreen),
        processManually: Boolean(req.body?.processManually),
        screenVisible: parseBoolean(req.body?.screenVisible, CHARGE_SCREEN_VISIBLE),
        topMost: parseBoolean(req.body?.topMost, CHARGE_TOP_MOST),
        type: req.body?.type || "CASH",
        peripheralId: req.body?.peripheralId || "",
      },
      15_000
    );

    if (start.result !== "SUCCESS" || !start.id) {
      throw new Error(`No s'ha pogut iniciar el cobrament: ${start.result || "FAILED"}`);
    }

    currentCharge.chargeId = start.id;
    currentCharge.startedAt = start.startedAt || currentCharge.startedAt;

    const deadline = Date.now() + CHARGE_TIMEOUT_MS;
    let finalState = null;

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const op = await getChargeOperation(currentCharge.chargeId);
      const mapped = updateCurrentChargeFromConnector(op);
      if (mapped?.finished) {
        finalState = mapped;
        break;
      }
    }

    if (!finalState) {
      currentCharge.status = "error";
      currentCharge.error = "Timeout: cobrament Cashlogy sense resposta final";
      try {
        await cancelCurrentCharge();
      } catch (cancelErr) {
        console.warn("[Cashlogy] Error cancelling timed-out charge:", normalizeErrorMessage(cancelErr));
      }
      return res.json({ success: false, error: currentCharge.error, chargeId: currentCharge.chargeId });
    }

    if (finalState.status === "done") {
      console.log(
        `[Cashlogy] Charge OK id=${currentCharge.chargeId} deposited=${currentCharge.depositedCents} dispensed=${currentCharge.dispensedCents}`
      );
      return res.json({
        success: true,
        change: currentCharge.dispensedCents / 100,
        deposited: currentCharge.depositedCents / 100,
        chargeId: currentCharge.chargeId,
        depositId: currentCharge.chargeId,
      });
    }

    return res.json({
      success: false,
      error: currentCharge.error || "Cobrament Cashlogy no completat",
      chargeId: currentCharge.chargeId,
      deposited: currentCharge.depositedCents / 100,
      changeOwed: Math.max(0, amountCents - currentCharge.dispensedCents) / 100,
    });
  } catch (err) {
    const message = normalizeErrorMessage(err);
    console.error("[Cashlogy] Charge error:", message);
    currentCharge.status = "error";
    currentCharge.error = message;
    return res.status(502).json({ success: false, error: message });
  }
}

async function handleCashlogyCancel(_req, res) {
  try {
    if (!currentCharge || !currentCharge.chargeId) {
      return res.json({ success: true, skipped: true });
    }
    console.log(`[Cashlogy] Cancelling charge ${currentCharge.chargeId}`);
    await cancelCurrentCharge();
    return res.json({ success: true, chargeId: currentCharge.chargeId });
  } catch (err) {
    const message = normalizeErrorMessage(err);
    console.error("[Cashlogy] Cancel error:", message);
    return res.status(502).json({ success: false, error: message });
  }
}

async function handleCashlogyInit(_req, res) {
  try {
    const data = await runStartupInit();
    return res.json({ success: true, ...data });
  } catch (err) {
    const message = normalizeErrorMessage(err);
    return res.status(502).json({ success: false, error: message });
  }
}

async function handleCashlogyClose(_req, res) {
  try {
    const data = await cashlogyRequest("/close", "POST", {}, 15_000);
    return res.json({ success: data.result === "SUCCESS", ...data });
  } catch (err) {
    const message = normalizeErrorMessage(err);
    return res.status(502).json({ success: false, error: message });
  }
}

async function handleCashlogyState(_req, res) {
  try {
    const [status, peripherals, model, accounting, errors] = await Promise.all([
      cashlogyRequest("/status", "GET", null, 8_000).catch((err) => ({ error: normalizeErrorMessage(err) })),
      cashlogyRequest("/peripherals", "GET", null, 8_000).catch((err) => ({ error: normalizeErrorMessage(err) })),
      cashlogyRequest("/cashlogy/model", "GET", null, 8_000).catch((err) => ({ error: normalizeErrorMessage(err) })),
      cashlogyRequest("/cashlogy/accounting", "GET", null, 8_000).catch((err) => ({ error: normalizeErrorMessage(err) })),
      cashlogyRequest("/errors", "GET", null, 8_000).catch((err) => ({ error: normalizeErrorMessage(err) })),
    ]);

    const cash = Array.isArray(peripherals.cash) ? peripherals.cash : [];
    const primaryCash = cash.find((p) => p.isPrimary) || cash[0] || null;
    const accountingItems = Array.isArray(accounting.items) ? accounting.items : [];
    const totalAmount =
      parseCents(accounting.recyclers?.amount) +
      parseCents(accounting.stacker?.amount) +
      parseCents(accounting.coinbox?.amount) +
      parseCents(accounting.safebox?.amount);

    return res.json({
      ok: !status.error && !peripherals.error,
      online: primaryCash?.status === "AVAILABLE",
      status,
      peripherals,
      model,
      accounting,
      errors,
      denominations: accountingItems,
      totalAmount,
      total: totalAmount / 100,
    });
  } catch (err) {
    const message = normalizeErrorMessage(err);
    console.error("[Cashlogy] State error:", message);
    return res.status(502).json({ error: message });
  }
}

async function handleCashlogyBackOffice(req, res) {
  try {
    await requireCashlogyReady();
    const body = {
      operations: {
        addChange: true,
        giveChange: true,
        closure: true,
        withdrawCash: true,
        collect: true,
        completeEmpty: true,
        cashlogyState: true,
        recyclersSelfprotection: true,
        accountingMismatch: true,
        maintenance: true,
        ...(req.body?.operations || {}),
      },
      topMost: req.body?.topMost !== false,
      screenVisible: req.body?.screenVisible !== false,
    };
    const data = await cashlogyRequest("/backOffice", "POST", body, 15_000);
    return res.json({ success: data.result === "SUCCESS", ...data });
  } catch (err) {
    const message = normalizeErrorMessage(err);
    return res.status(502).json({ success: false, error: message });
  }
}

async function handleCashlogyBackOfficeStatus(_req, res) {
  try {
    const data = await cashlogyRequest("/backOffice/status", "GET", null, 8_000);
    return res.json(data);
  } catch (err) {
    const message = normalizeErrorMessage(err);
    return res.status(502).json({ success: false, error: message });
  }
}

async function handleCashlogyBackOfficeExit(_req, res) {
  try {
    const data = await cashlogyRequest("/backOffice/exit", "POST", {}, 10_000);
    return res.json({ success: data.success !== false, ...data });
  } catch (err) {
    const message = normalizeErrorMessage(err);
    return res.status(502).json({ success: false, error: message });
  }
}

async function handleCashlogyDispense(req, res) {
  const amountCents = parseAmountCents(req.body?.amountCents, req.body?.amount);
  if (!amountCents) return res.status(400).json({ success: false, error: "Import invalid" });

  try {
    await requireCashlogyReady();
    const data = await cashlogyRequest(
      "/dispense",
      "POST",
      {
        amount: amountCents,
        onlyCoins: Boolean(req.body?.onlyCoins),
        screenVisible: req.body?.screenVisible !== false,
        topMost: req.body?.topMost !== false,
      },
      15_000
    );
    return res.json({ success: data.result === "SUCCESS", ...data });
  } catch (err) {
    const message = normalizeErrorMessage(err);
    return res.status(502).json({ success: false, error: message });
  }
}

async function handleCashlogyDispenseStatus(_req, res) {
  try {
    const data = await cashlogyRequest("/dispense/status", "GET", null, 8_000);
    return res.json(data);
  } catch (err) {
    const message = normalizeErrorMessage(err);
    return res.status(502).json({ success: false, error: message });
  }
}

async function handleCashlogyDispenseCancel(_req, res) {
  try {
    const data = await cashlogyRequest("/dispense/cancel", "POST", {}, 10_000);
    return res.json({ success: data.success !== false, ...data });
  } catch (err) {
    const message = normalizeErrorMessage(err);
    return res.status(502).json({ success: false, error: message });
  }
}

async function handleCashlogyAddChange(req, res) {
  try {
    await requireCashlogyReady();
    const data = await cashlogyRequest(
      "/addChange",
      "POST",
      {
        mode: req.body?.mode || "NORMAL",
        coins: req.body?.coins || { acceptAll: false, destination: "DEFAULT" },
        bills: req.body?.bills || { acceptAll: false, destination: "DEFAULT" },
        topMost: req.body?.topMost !== false,
        screenVisible: req.body?.screenVisible !== false,
      },
      15_000
    );
    return res.json({ success: data.result === "SUCCESS", ...data });
  } catch (err) {
    const message = normalizeErrorMessage(err);
    return res.status(502).json({ success: false, error: message });
  }
}

async function handleCashlogyAddChangeStatus(_req, res) {
  try {
    const data = await cashlogyRequest("/addChange/status", "GET", null, 8_000);
    return res.json(data);
  } catch (err) {
    const message = normalizeErrorMessage(err);
    return res.status(502).json({ success: false, error: message });
  }
}

async function handleCashlogyAddChangeEnd(_req, res) {
  try {
    const data = await cashlogyRequest("/addChange/end", "POST", {}, 10_000);
    return res.json({ success: data.success !== false, ...data });
  } catch (err) {
    const message = normalizeErrorMessage(err);
    return res.status(502).json({ success: false, error: message });
  }
}

function handleCashlogyCertConfig(_req, res) {
  const cashlogyUrl = new URL(CASHLOGY_BASE);
  const protocol = cashlogyUrl.protocol === "https:" ? "wss:" : "ws:";
  const notificationsUrl = `${protocol}//${cashlogyUrl.host}/notifications`;
  res.json({
    cashlogyBase: CASHLOGY_BASE,
    notificationsUrl,
    apiKeyConfigured: Boolean(getCashlogyApiKey()),
    machineCode: MACHINE_CODE,
    trafficLimit: CERT_TRAFFIC_LIMIT,
  });
}

function handleCashlogyCertTraffic(_req, res) {
  res.json({
    count: certTraffic.length,
    items: certTraffic,
  });
}

function handleCashlogyCertTrafficClear(_req, res) {
  certTraffic.length = 0;
  res.json({ success: true });
}

module.exports = {
  handleCashlogyInit,
  handleCashlogyClose,
  handleCashlogyCharge,
  handleCashlogyChargeStatus,
  handleCashlogyCancel,
  handleCashlogyState,
  handleCashlogyBackOffice,
  handleCashlogyBackOfficeStatus,
  handleCashlogyBackOfficeExit,
  handleCashlogyDispense,
  handleCashlogyDispenseStatus,
  handleCashlogyDispenseCancel,
  handleCashlogyAddChange,
  handleCashlogyAddChangeStatus,
  handleCashlogyAddChangeEnd,
  handleCashlogyCertConfig,
  handleCashlogyCertTraffic,
  handleCashlogyCertTrafficClear,
};
