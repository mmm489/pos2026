const txLog = require("../lib/transaction-log");
const comercia = require("../lib/comercia-instore");

async function forwardToComercia(operation, body) {
  const start = Date.now();
  let data;

  try {
    if (operation === "charge") {
      data = await comercia.charge(body);
    } else if (operation === "refund" || operation === "cancel") {
      data = await comercia.refund({ ...body, operation });
    } else if (operation === "query") {
      data = await comercia.query(body);
    } else if (operation === "abort") {
      data = await comercia.abort();
    } else {
      data = { success: false, error: `Operacion Comercia no soportada: ${operation}` };
    }
  } catch (err) {
    data = {
      success: false,
      error: `No se ha podido comunicar con Comercia InStore: ${err.message}`,
    };
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
  const { amount, orderId } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, error: "Importe invalido" });
  }

  console.log(`[Comercia] Cobrament ${amount} EUR (orderId: ${orderId || "-"})`);
  const data = await forwardToComercia("charge", { amount, orderId });
  console.log("[Comercia] Resposta charge:", data);
  return res.json(data);
}

async function handleIngenicoRefund(req, res) {
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

  console.log(`[Comercia] Devolucion ${amount} EUR (ref: ${originalReference})`);
  const data = await forwardToComercia("refund", { amount, orderId, originalReference });
  console.log("[Comercia] Resposta refund:", data);
  return res.json(data);
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
  console.log("[Comercia] Resposta cancel:", data);
  return res.json(data);
}

async function handleIngenicoQuery(req, res) {
  const { reference, orderId } = req.body;
  if (!reference) {
    return res.status(400).json({
      success: false,
      error: "Falta reference (referencia de la transaccion a consultar)",
    });
  }

  console.log(`[Comercia] Consulta ref ${reference}`);
  const data = await forwardToComercia("query", { reference, orderId });
  console.log("[Comercia] Resposta query:", data);
  return res.json(data);
}

async function handleIngenicoAbort(_req, res) {
  console.log("[Comercia] Abort solicitado desde el POS");
  const data = await forwardToComercia("abort", {});
  return res.json(data);
}

async function handleCardStatus(_req, res) {
  return res.json(await comercia.status());
}

async function handleCardHealth(_req, res) {
  return res.json(await comercia.health());
}

module.exports = {
  handleIngenicoCharge,
  handleIngenicoRefund,
  handleIngenicoCancel,
  handleIngenicoQuery,
  handleIngenicoAbort,
  handleCardStatus,
  handleCardHealth,
};
