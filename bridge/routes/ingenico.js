const txLog = require("../lib/transaction-log");
const comercia = require("../lib/comercia-instore");

let activeOperation = null;

async function forwardToComercia(operation, body) {
  const exclusive = ["charge", "refund", "cancel", "query", "print-receipt"].includes(operation);
  if (exclusive && activeOperation) {
    return {
      success: false,
      busy: true,
      error: `Hay otra operacion en curso (${activeOperation})`,
    };
  }

  const start = Date.now();
  let data;

  try {
    if (exclusive) activeOperation = operation;
    if (operation === "prepare") {
      data = await comercia.createTransaction();
    } else if (operation === "charge") {
      data = await comercia.charge(body);
    } else if (operation === "refund" || operation === "cancel") {
      data = await comercia.refund({ ...body, operation });
    } else if (operation === "query") {
      data = await comercia.query(body);
    } else if (operation === "abort") {
      data = await comercia.abort();
    } else if (operation === "print-receipt") {
      data = await comercia.printReceiptCopy(body);
    } else {
      data = { success: false, error: `Operacion Comercia no soportada: ${operation}` };
    }
  } catch (err) {
    data = {
      success: false,
      error: `No se ha podido comunicar con Comercia InStore: ${err.message}`,
    };
  } finally {
    if (exclusive) activeOperation = null;
  }

  txLog
    .log({
      operation,
      request: body,
      response: data,
      durationMs: Date.now() - start,
    })
    .catch(() => {});

  return data;
}

async function handleIngenicoCharge(req, res) {
  const { amount, orderId, transactionId, transactionNumber } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: "Importe invalido" });
  }

  console.log(`[Comercia] Cobrament ${amount} EUR (orderId: ${orderId || "-"})`);
  const data = await forwardToComercia("charge", { amount, orderId, transactionId, transactionNumber });
  logResult("charge", data);
  return res.status(data.busy ? 409 : 200).json(data);
}

async function handleIngenicoRefund(req, res) {
  const { amount, orderId, originalReference, transactionId } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: "Importe invalido" });
  }
  if (!originalReference) {
    return res.status(400).json({
      success: false,
      error: "Falta originalReference (referencia de la venta original)",
    });
  }

  console.log(`[Comercia] Devolucion ${amount} EUR (ref: ${originalReference})`);
  const data = await forwardToComercia("refund", { amount, orderId, originalReference, transactionId });
  logResult("refund", data);
  return res.status(data.busy ? 409 : 200).json(data);
}

async function handleIngenicoCancel(req, res) {
  const { amount, orderId, originalReference } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: "Importe invalido" });
  }
  if (!originalReference) {
    return res.status(400).json({
      success: false,
      error: "Falta originalReference (referencia de la venta original)",
    });
  }

  console.log(`[Comercia] Anulacion ${amount} EUR (ref: ${originalReference})`);
  const data = await forwardToComercia("cancel", { amount, orderId, originalReference });
  logResult("cancel", data);
  return res.status(data.busy ? 409 : 200).json(data);
}

async function handleIngenicoQuery(req, res) {
  const { transactionId, orderId } = req.body;
  if (!transactionId) {
    return res.status(400).json({
      success: false,
      error: "Falta transactionId (UUID de la transaccion a consultar)",
    });
  }

  console.log(`[Comercia] Consulta transactionId ${transactionId}`);
  const data = await forwardToComercia("query", { transactionId, orderId });
  logResult("query", data);
  return res.status(data.busy ? 409 : 200).json(data);
}

async function handleIngenicoPrintReceipt(req, res) {
  const { transactionNumber } = req.body;
  if (!transactionNumber) {
    return res.status(400).json({ success: false, error: "Falta transactionNumber" });
  }
  const data = await forwardToComercia("print-receipt", { transactionNumber });
  logResult("print-receipt", data);
  return res.status(data.busy ? 409 : 200).json(data);
}

async function handleIngenicoAbort(_req, res) {
  console.log("[Comercia] Abort solicitado desde el POS");
  const data = await forwardToComercia("abort", {});
  return res.json(data);
}

async function handleIngenicoPrepare(_req, res) {
  const data = await forwardToComercia("prepare", {});
  return res.json(data);
}

async function handleCardStatus(_req, res) {
  return res.json(await comercia.status());
}

async function handleCardHealth(_req, res) {
  return res.json(await comercia.health());
}

function logResult(operation, data) {
  console.log(
    `[Comercia] ${operation}: success=${Boolean(data?.success)} result=${data?.result ?? "-"} reference=${data?.reference || "-"}`
  );
}

module.exports = {
  handleIngenicoCharge,
  handleIngenicoPrepare,
  handleIngenicoRefund,
  handleIngenicoCancel,
  handleIngenicoQuery,
  handleIngenicoAbort,
  handleIngenicoPrintReceipt,
  handleCardStatus,
  handleCardHealth,
};
