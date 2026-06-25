const http = require("node:http");
const https = require("node:https");

const DEFAULT_BASE_URL = "https://127.0.0.1:3010/v1";
const DEFAULT_TIMEOUT_MS = 135_000;

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function getConfig() {
  const baseUrl = (process.env.COMERCIA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const localHttps = /^https:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/)/i.test(baseUrl);
  const allowSelfSigned =
    process.env.COMERCIA_ALLOW_SELF_SIGNED == null
      ? localHttps
      : isTruthy(process.env.COMERCIA_ALLOW_SELF_SIGNED);

  return {
    baseUrl,
    apiKey: process.env.COMERCIA_API_KEY || process.env.APPCONECTOR_KEY || "",
    paymentApp: process.env.COMERCIA_PAYMENT_APP || "comercia",
    deviceId: process.env.COMERCIA_DEVICE_ID || "",
    printReceipt: Number(process.env.COMERCIA_PRINT_RECEIPT ?? 1),
    timeoutMs: Number(process.env.COMERCIA_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    allowSelfSigned,
    simulator: isTruthy(process.env.COMERCIA_SIMULATOR),
    simulatorResult: String(process.env.COMERCIA_SIMULATOR_RESULT || "success").toLowerCase(),
    simulatorDelayMs: Math.max(0, Number(process.env.COMERCIA_SIMULATOR_DELAY_MS || 400)),
  };
}

function amountToMinorUnits(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function parseMaybeJson(value) {
  if (!value || typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getAdditionalData(response) {
  return parseMaybeJson(response?.additionalData) || {};
}

function getTransactionData(response) {
  const additionalData = getAdditionalData(response);
  return parseMaybeJson(additionalData?.transactionData) || {};
}

function accepted(response) {
  const result = response?.result ?? response?.getResult;
  const status = response?.status ?? response?.getStatus;
  const txData = getTransactionData(response);
  const txResult = String(txData?.result || "").toUpperCase();

  return (
    result === 100 ||
    result === "100" ||
    String(result || "").toUpperCase() === "TRANSACTION_ACCEPTED" ||
    status === -1001 ||
    status === "-1001" ||
    status === -1002 ||
    status === "-1002" ||
    txResult === "APPROVED" ||
    txResult === "ACCEPTED"
  );
}

function responseError(response) {
  const additionalData = getAdditionalData(response);
  const txData = getTransactionData(response);
  return (
    response?.error ||
    response?.message ||
    response?.description ||
    additionalData?.msgKO ||
    additionalData?.response ||
    txData?.result ||
    "Operacion no aceptada por Comercia"
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function simulatorReference(prefix = "SIM") {
  return `${prefix}-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

function simulatorReceipt({ amount, reference, operation = "sale" }) {
  const label = operation === "refund" ? "DEVOLUCION SIMULADA" : "VENTA SIMULADA";
  return [
    "COMERCIA INSTORE - SIMULADOR",
    label,
    `IMPORTE: ${Number(amount || 0).toFixed(2)} EUR`,
    `REF: ${reference}`,
    `FECHA: ${new Date().toLocaleString("es-ES")}`,
    "SIN VALOR BANCARIO",
  ].join("\n");
}

async function simulatorResponse({ amount, orderId, originalReference, operation = "sale" }) {
  const config = getConfig();
  await sleep(config.simulatorDelayMs);

  const normalizedResult = ["success", "ok", "approved", "accepted"].includes(config.simulatorResult)
    ? "success"
    : ["cancelled", "canceled", "cancel"].includes(config.simulatorResult)
    ? "cancelled"
    : "failed";
  const reference = originalReference || simulatorReference(operation === "refund" ? "SIM-REFUND" : "SIM-CARD");
  const transactionId = simulatorReference("SIM-TX");
  const amountNumber = Number(amount || 0);

  if (normalizedResult === "success") {
    return {
      success: true,
      provider: "comercia",
      simulated: true,
      operation,
      reference,
      transactionId,
      responseCode: "00",
      authorizationCode: "SIMOK",
      result: "SIMULATED_SUCCESS",
      cashlessOperationId: transactionId,
      cashlessTransactionNumber: reference,
      cashlessAmount: amountNumber,
      cashlessPeripheralId: "SIMULATOR",
      receipt: simulatorReceipt({ amount: amountNumber, reference, operation }),
      raw: {
        simulator: true,
        result: "SUCCESS",
        orderId,
        amount: Math.round(amountNumber * 100),
        reference,
      },
    };
  }

  if (normalizedResult === "cancelled") {
    return {
      success: false,
      provider: "comercia",
      simulated: true,
      operation,
      cancelled: true,
      reference,
      transactionId,
      result: "SIMULATED_CANCELLED",
      error: "Pago simulado cancelado por el usuario",
      raw: {
        simulator: true,
        result: "CANCELLED",
        orderId,
        amount: Math.round(amountNumber * 100),
        reference,
      },
    };
  }

  return {
    success: false,
    provider: "comercia",
    simulated: true,
    operation,
    reference,
    transactionId,
    responseCode: "99",
    result: "SIMULATED_FAILED",
    error: "Pago simulado rechazado",
    raw: {
      simulator: true,
      result: "FAILED",
      orderId,
      amount: Math.round(amountNumber * 100),
      reference,
    },
  };
}

function buildHeaders(config, hasBody = false) {
  const headers = {
    Accept: "application/json",
  };
  if (hasBody) headers["Content-Type"] = "application/json";
  if (config.apiKey) headers["x-apikey"] = config.apiKey;
  return headers;
}

async function requestJson(path, { method = "GET", body, timeoutMs } = {}) {
  const config = getConfig();
  if (!config.apiKey) {
    return {
      ok: false,
      status: 0,
      data: { error: "Falta COMERCIA_API_KEY en bridge/.env" },
    };
  }

  const payload = body ? JSON.stringify(body) : undefined;
  const url = new URL(`${config.baseUrl}${path}`);
  const transport = url.protocol === "https:" ? https : http;
  const headers = buildHeaders(config, Boolean(body));
  if (payload) headers["Content-Length"] = Buffer.byteLength(payload);

  return new Promise((resolve) => {
    const request = transport.request(
      url,
      {
        method,
        headers,
        timeout: timeoutMs || config.timeoutMs,
        rejectUnauthorized: url.protocol === "https:" ? !config.allowSelfSigned : undefined,
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          let data = null;
          if (text) {
            try {
              data = JSON.parse(text);
            } catch {
              data = { raw: text };
            }
          }
          resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode, data });
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Timeout comunicando con Comercia InStore"));
    });
    request.on("error", (err) => {
      resolve({
        ok: false,
        status: 0,
        data: {
          error: `No se ha podido conectar con Comercia InStore: ${err.message}`,
        },
      });
    });
    if (payload) request.write(payload);
    request.end();
  });
}

async function createTransaction() {
  const response = await requestJson("/createTransaction");
  const transactionId = response.data?.transactionId || response.data?.id || response.data?.raw;
  if (!response.ok || !transactionId) {
    return {
      success: false,
      error: response.data?.error || `No se pudo crear transactionId (HTTP ${response.status})`,
      raw: response.data,
    };
  }
  return { success: true, transactionId: String(transactionId) };
}

function baseOperationBody({ transactionId, amountMinor, orderId, originalReference }) {
  const config = getConfig();
  const body = {
    transactionId,
    paymentApp: config.paymentApp,
    amount: amountMinor,
    currencyCode: "EUR",
    otherData: {
      printReceipt: config.printReceipt,
      posId: "pos2026",
      orderId: orderId ? String(orderId) : "pos2026",
    },
  };

  if (config.deviceId) body.deviceId = config.deviceId;
  if (originalReference) body.transactionNumber = String(originalReference);

  return body;
}

function normalizePaymentResponse(raw, transactionId, fallbackReference) {
  const additionalData = getAdditionalData(raw);
  const txData = getTransactionData(raw);
  const reference =
    raw?.transactionNumber ||
    txData?.transactionNumber ||
    txData?.invoice ||
    txData?.transactionReference ||
    fallbackReference ||
    transactionId;
  const authorizationCode =
    raw?.authorizationCode ||
    raw?.authorizationNumber ||
    raw?.authCode ||
    txData?.authorizationNumber ||
    txData?.authorizationCode ||
    txData?.authCode ||
    null;
  const responseCode = raw?.responseCode || txData?.responseCode || txData?.actionCode || raw?.status || null;
  const amountMinor = Number(raw?.amount ?? txData?.amount);

  return {
    success: accepted(raw),
    provider: "comercia",
    operation: "sale",
    reference: reference ? String(reference) : undefined,
    transactionId,
    responseCode: responseCode ? String(responseCode) : undefined,
    authorizationCode: authorizationCode ? String(authorizationCode) : undefined,
    result: String(raw?.result ?? txData?.result ?? raw?.status ?? ""),
    cashlessOperationId: transactionId,
    cashlessTransactionNumber: reference ? String(reference) : undefined,
    cashlessAmount: Number.isFinite(amountMinor) ? amountMinor / 100 : undefined,
    cashlessPeripheralId: raw?.deviceId || txData?.deviceId || undefined,
    receipt: raw?.receipt || additionalData?.receipt || txData?.receipt || undefined,
    additionalData,
    raw,
    error: accepted(raw) ? undefined : responseError(raw),
  };
}

async function charge({ amount, orderId }) {
  const amountMinor = amountToMinorUnits(amount);
  if (!amountMinor) return { success: false, error: "Importe invalido" };
  if (getConfig().simulator) return simulatorResponse({ amount, orderId, operation: "sale" });

  const tx = await createTransaction();
  if (!tx.success) return { success: false, error: tx.error, raw: tx.raw };

  const body = baseOperationBody({ transactionId: tx.transactionId, amountMinor, orderId });
  const response = await requestJson("/payment", { method: "POST", body });
  if (!response.ok) {
    return {
      success: false,
      transactionId: tx.transactionId,
      error: response.data?.error || `Comercia /payment devolvio HTTP ${response.status}`,
      raw: response.data,
    };
  }

  return normalizePaymentResponse(response.data || {}, tx.transactionId);
}

async function refund({ amount, orderId, originalReference, operation = "refund" }) {
  const amountMinor = amountToMinorUnits(amount);
  if (!amountMinor) return { success: false, error: "Importe invalido" };
  if (!originalReference) return { success: false, error: "Falta transactionNumber original" };
  if (getConfig().simulator) return simulatorResponse({ amount, orderId, originalReference, operation });

  const tx = await createTransaction();
  if (!tx.success) return { success: false, error: tx.error, raw: tx.raw };

  const body = baseOperationBody({
    transactionId: tx.transactionId,
    amountMinor,
    orderId,
    originalReference,
  });
  const response = await requestJson("/refund", { method: "POST", body });
  if (!response.ok) {
    return {
      success: false,
      transactionId: tx.transactionId,
      error: response.data?.error || `Comercia /refund devolvio HTTP ${response.status}`,
      raw: response.data,
    };
  }

  return {
    ...normalizePaymentResponse(response.data || {}, tx.transactionId, originalReference),
    operation,
  };
}

async function query({ reference }) {
  if (!reference) return { success: false, error: "Falta reference" };
  if (getConfig().simulator) {
    return simulatorResponse({ amount: 0, originalReference: reference, operation: "query" });
  }

  const config = getConfig();
  const body = { transactionId: String(reference) };
  if (config.deviceId) body.deviceId = config.deviceId;

  const response = await requestJson("/getTransaction", { method: "POST", body, timeoutMs: 30_000 });
  if (!response.ok) {
    return {
      success: false,
      error: response.data?.error || `Comercia /getTransaction devolvio HTTP ${response.status}`,
      raw: response.data,
    };
  }
  return normalizePaymentResponse(response.data || {}, String(reference), String(reference));
}

async function abort() {
  if (getConfig().simulator) {
    return { success: true, cancelled: true, simulated: true, raw: { simulator: true, result: "CANCELLED" } };
  }

  const config = getConfig();
  const body = { paymentApp: config.paymentApp };
  if (config.deviceId) body.deviceId = config.deviceId;

  const response = await requestJson("/cancelTransaction", { method: "POST", body, timeoutMs: 10_000 });
  if (!response.ok) {
    return {
      success: false,
      error: response.data?.error || `Comercia /cancelTransaction devolvio HTTP ${response.status}`,
      raw: response.data,
    };
  }
  return { success: true, cancelled: true, raw: response.data };
}

async function health() {
  if (getConfig().simulator) {
    return {
      status: "ok",
      provider: "comercia",
      simulated: true,
      pinpadInfo: "Comercia InStore SIMULADOR",
      raw: { simulator: true, result: "OK" },
    };
  }

  const response = await requestJson("/getVersion", { timeoutMs: 3_000 });
  if (!response.ok) {
    return {
      status: "offline",
      provider: "comercia",
      error: response.data?.error || `HTTP ${response.status}`,
    };
  }
  return {
    status: "ok",
    provider: "comercia",
    pinpadInfo: `Comercia InStore ${response.data?.version || response.data?.["api-version"] || response.data?.raw || ""}`.trim(),
    raw: response.data,
  };
}

async function status() {
  return health();
}

module.exports = {
  charge,
  refund,
  query,
  abort,
  health,
  status,
};
