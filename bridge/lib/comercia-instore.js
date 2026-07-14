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

function receiptField(value, maxLength = 80) {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value).replace(/[\r\n]+/g, " ").trim().slice(0, maxLength) || undefined;
}

function maskedCardNumber(value) {
  const card = receiptField(value, 64);
  if (!card) return undefined;
  const digits = card.replace(/\D/g, "");
  if (digits.length < 4) return undefined;
  return `**** **** **** ${digits.slice(-4)}`;
}

function buildComerciaReceipt({ raw, additionalData, txData, reference, authorizationCode, amountMinor, operation }) {
  const merchantName = receiptField(
    txData?.fucName || txData?.merchantName || additionalData?.merchantName
  );
  const merchantId = receiptField(
    txData?.fucId || txData?.fuc || txData?.fucNumber || txData?.merchantId || additionalData?.merchantId
  );
  const terminal = receiptField(
    txData?.terminal || txData?.terminalId || txData?.acquirerTerminalId
  );
  const cardType = receiptField(
    txData?.cardType || txData?.cardBrand || txData?.network || txData?.appLabel
  );
  const card = maskedCardNumber(
    txData?.cardClient || txData?.card || txData?.cardNumber
  );
  const transactionDate = receiptField(
    txData?.transactionDate || txData?.date || txData?.operationDate
  );
  const transactionTime = receiptField(
    txData?.transactionTime || txData?.time || txData?.operationTime
  );
  const transactionType = String(
    txData?.type || txData?.transactionType || raw?.operation || operation || ""
  ).toUpperCase();
  const operationLabel = transactionType.includes("REFUND") || transactionType.includes("DEVOL")
    ? "DEVOLUCION"
    : "VENTA";
  const parsedAmount = Number(amountMinor);
  const amount = Number.isFinite(parsedAmount)
    ? `${(parsedAmount / 100).toFixed(2)} EUR`
    : undefined;

  const lines = [];
  if (merchantName) lines.push(merchantName);
  if (merchantId) lines.push(`COMERCIO: ${merchantId}`);
  if (terminal) lines.push(`TERMINAL: ${terminal}`);
  lines.push(operationLabel);
  if (transactionDate || transactionTime) {
    lines.push(`FECHA: ${[transactionDate, transactionTime].filter(Boolean).join(" ")}`);
  }
  if (amount) lines.push(`IMPORTE: ${amount}`);
  if (cardType) lines.push(`TARJETA: ${cardType}`);
  if (card) lines.push(`NUMERO: ${card}`);
  if (authorizationCode) lines.push(`AUTORIZACION: ${receiptField(authorizationCode, 24)}`);
  if (reference) lines.push(`OPERACION: ${receiptField(reference, 40)}`);
  if (txData?.isContactless === true) lines.push("LECTURA: CONTACTLESS");
  if (txData?.isPinAuthenticated === true) lines.push("VERIFICACION: PIN");
  lines.push("OPERACION ACEPTADA");

  return lines.join("\n");
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

function normalizePaymentResponse(raw, transactionId, fallbackReference, operation = "sale") {
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
  const providerReceipt = raw?.receipt || additionalData?.receipt || txData?.receipt;
  const receipt = providerReceipt || (accepted(raw)
    ? buildComerciaReceipt({
        raw,
        additionalData,
        txData,
        reference,
        authorizationCode,
        amountMinor,
        operation,
      })
    : undefined);

  return {
    success: accepted(raw),
    provider: "comercia",
    operation,
    reference: reference ? String(reference) : undefined,
    transactionId,
    responseCode: responseCode ? String(responseCode) : undefined,
    authorizationCode: authorizationCode ? String(authorizationCode) : undefined,
    result: String(raw?.result ?? txData?.result ?? raw?.status ?? ""),
    cashlessOperationId: transactionId,
    cashlessTransactionNumber: reference ? String(reference) : undefined,
    cashlessAmount: Number.isFinite(amountMinor) ? amountMinor / 100 : undefined,
    cashlessPeripheralId: raw?.deviceId || txData?.deviceId || undefined,
    receipt: receipt || undefined,
    additionalData,
    raw,
    error: accepted(raw) ? undefined : responseError(raw),
  };
}

async function charge({ amount, orderId, transactionId }) {
  const amountMinor = amountToMinorUnits(amount);
  if (!amountMinor) return { success: false, error: "Importe invalido" };

  const tx = transactionId
    ? { success: true, transactionId: String(transactionId) }
    : await createTransaction();
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

async function refund({ amount, orderId, originalReference, operation = "refund", transactionId }) {
  const amountMinor = amountToMinorUnits(amount);
  if (!amountMinor) return { success: false, error: "Importe invalido" };
  if (!originalReference) return { success: false, error: "Falta transactionNumber original" };

  const tx = transactionId
    ? { success: true, transactionId: String(transactionId) }
    : await createTransaction();
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
    ...normalizePaymentResponse(response.data || {}, tx.transactionId, originalReference, "refund"),
    operation,
  };
}

async function query({ reference }) {
  if (!reference) return { success: false, error: "Falta reference" };

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
  createTransaction,
  charge,
  refund,
  query,
  abort,
  health,
  status,
};
