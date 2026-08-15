const assert = require("node:assert/strict");
const http = require("node:http");

const requests = [];
const requestTimeouts = [];
const originalHttpRequest = http.request;
let transactionCounter = 0;

http.request = function captureRequest(url, options, callback) {
  requestTimeouts.push({ path: new URL(url).pathname, timeout: options?.timeout });
  return originalHttpRequest.call(this, url, options, callback);
};

async function main() {
  const server = http.createServer(handleProviderRequest);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    process.env.COMERCIA_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
    process.env.COMERCIA_API_KEY = "contract-key";
    process.env.COMERCIA_PAYMENT_APP = "comercia";
    process.env.COMERCIA_DEVICE_ID = "DEVICE-1";
    process.env.COMERCIA_PRINT_RECEIPT = "1";
    process.env.COMERCIA_TIMEOUT_MS = "999999";
    delete process.env.LOCAL_DATABASE_URL;

    const comercia = require("../lib/comercia-instore");
    const routes = require("../routes/ingenico");

    const sale = await comercia.charge({
      amount: 1.23,
      orderId: "42",
      transactionId: "00000000-0000-0000-0000-000000000042",
      transactionNumber: "S-2026/000042",
    });
    assert.equal(sale.success, true);
    assert.equal(sale.transactionId, "00000000-0000-0000-0000-000000000042");
    assert.equal(sale.reference, "9001");
    assert.equal(sale.authorizationCode, "AUTH-1");
    assert.equal(sale.raw.additionalData.transactionData.track2, "[REDACTED]");
    assert.equal(sale.raw.additionalData.transactionData.cardClient, "**** **** **** 0000");

    const paymentRequest = requests.find((item) => item.path === "/v1/payment");
    assert.equal(paymentRequest.headers["x-apikey"], "contract-key");
    assert.equal(paymentRequest.body.amount, 123);
    assert.equal(paymentRequest.body.transactionId, sale.transactionId);
    assert.equal(paymentRequest.body.transactionNumber, "S-2026/000042");
    assert.equal(paymentRequest.body.otherData.printReceipt, 1);
    assert.equal(paymentRequest.body.otherData.posId, "pos2026");
    assert.equal(paymentRequest.body.deviceId, "DEVICE-1");
    assert.equal(
      requestTimeouts.find((item) => item.path === "/v1/payment")?.timeout,
      120000,
      "Las operaciones de Comercia deben usar 120 segundos",
    );

    const cancelled = await comercia.charge({
      amount: 1.23,
      orderId: "43",
      transactionId: "00000000-0000-0000-0000-000000000043",
      transactionNumber: "S-CANCEL",
    });
    assert.equal(cancelled.success, false);
    assert.equal(cancelled.cancelled, true);
    assert.equal(cancelled.unknown, undefined);

    const unknown = await comercia.charge({
      amount: 1.23,
      orderId: "44",
      transactionId: "00000000-0000-0000-0000-000000000044",
      transactionNumber: "S-UNKNOWN",
    });
    assert.equal(unknown.success, false);
    assert.equal(unknown.unknown, true);

    const query = await comercia.query({ transactionId: sale.transactionId });
    assert.equal(query.success, true);
    assert.equal(query.queryCompleted, true);
    const queryRequest = requests.find((item) => item.path === "/v1/getTransaction");
    assert.equal(queryRequest.method, "GET");
    assert.equal(queryRequest.body.transactionId, sale.transactionId);

    const refund = await comercia.refund({
      amount: 1.23,
      orderId: "42",
      originalReference: "9001",
      transactionId: "00000000-0000-0000-0000-000000000142",
    });
    assert.equal(refund.success, true);
    const refundRequest = requests.find((item) => item.path === "/v1/refund");
    assert.equal(refundRequest.body.transactionId, "00000000-0000-0000-0000-000000000142");
    assert.equal(refundRequest.body.transactionNumber, "9001");

    const print = await comercia.printReceiptCopy({ transactionNumber: "9001" });
    assert.equal(print.success, true);
    assert.equal(requests.find((item) => item.path === "/v1/printReceiptCopy").body.transactionNumber, "9001");

    const abort = await comercia.abort();
    assert.equal(abort.success, true);
    assert.equal(abort.cancelled, true);

    const slowRequest = routes.handleIngenicoCharge(
      { body: { amount: 1, orderId: "45", transactionId: "tx-slow", transactionNumber: "S-SLOW" } },
      responseRecorder(),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const busyResponse = responseRecorder();
    await routes.handleIngenicoCharge(
      { body: { amount: 1, orderId: "46", transactionId: "tx-busy", transactionNumber: "S-BUSY" } },
      busyResponse,
    );
    assert.equal(busyResponse.statusCode, 409);
    assert.equal(busyResponse.body.busy, true);
    await slowRequest;

    const health = await comercia.health();
    assert.equal(health.status, "ok");
    console.log("Comercia production bridge contract: OK");
  } finally {
    http.request = originalHttpRequest;
    await new Promise((resolve) => server.close(resolve));
  }
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return body;
    },
  };
}

async function handleProviderRequest(request, response) {
  let text = "";
  for await (const chunk of request) text += chunk;
  const body = text ? JSON.parse(text) : null;
  requests.push({ method: request.method, path: request.url, headers: request.headers, body });

  if (request.url === "/v1/createTransaction") {
    transactionCounter += 1;
    return send(response, {
      transactionId: `00000000-0000-0000-0000-${String(transactionCounter).padStart(12, "0")}`,
    });
  }
  if (request.url === "/v1/payment" && body.transactionNumber === "S-CANCEL") {
    return send(response, { transactionId: body.transactionId, amount: 123, result: 101, status: -1020 });
  }
  if (request.url === "/v1/payment" && body.transactionNumber === "S-UNKNOWN") {
    return send(response, { transactionId: body.transactionId, amount: 123, result: 0, status: -1021 });
  }
  if (request.url === "/v1/payment" && body.transactionNumber === "S-SLOW") {
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  if (request.url === "/v1/payment") return send(response, transaction("9001", "AUTH-1", body.transactionId));
  if (request.url === "/v1/refund") return send(response, transaction("9002", "AUTH-2", body.transactionId));
  if (request.url === "/v1/getTransaction") return send(response, transaction("9001", "AUTH-1", body.transactionId));
  if (request.url === "/v1/printReceiptCopy") return send(response, { result: 0 });
  if (request.url === "/v1/cancelTransaction") return send(response, { result: 1 });
  if (request.url === "/v1/getVersion") return send(response, { version: "mock-1.9.3" });
  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ errCode: -1, errDescription: "Not found" }));
}

function transaction(transactionNumber, authorizationNumber, transactionId) {
  return {
    transactionId,
    transactionNumber,
    amount: 123,
    result: 100,
    status: -1001,
    additionalData: JSON.stringify({
      transactionData: JSON.stringify({
        result: "APPROVED",
        authorizationNumber,
        track2: "4548810000000000=0000",
        cardClient: "4548810000000000",
      }),
    }),
  };
}

function send(response, body) {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
