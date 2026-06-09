require("dotenv").config();
const express = require("express");
const cors = require("cors");
const {
  handleCashlogyInit,
  handleCashlogyClose,
  handleCashlogyCharge,
  handleCashlogyChargeStatus,
  handleCashlogyCancel,
  handleCashlogyRefund,
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
} = require("./routes/cashlogy");
const {
  handleIngenicoCharge,
  handleIngenicoRefund,
  handleIngenicoCancel,
  handleIngenicoQuery,
  handleIngenicoAbort,
  handleVerifoneStatus,
  handleVerifoneHealth,
} = require("./routes/ingenico");
const {
  handlePrintTicket,
  handlePrintKitchenTicket,
  handlePrintCardReceipt,
  handlePrintZReport,
  handlePrinterStatus,
} = require("./routes/printer");

const app = express();
const PORT = process.env.PORT || 3006;

// CORS
const origins = (process.env.CORS_ORIGINS || "http://localhost:3005")
  .split(",")
  .map((s) => s.trim());
app.use(cors({ origin: origins }));
app.use(express.json());

// Logging middleware
app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.url}`);
  next();
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.post("/cashlogy/init", handleCashlogyInit);
app.post("/cashlogy/close", handleCashlogyClose);
app.post("/cashlogy/charge", handleCashlogyCharge);
app.get("/cashlogy/charge/status", handleCashlogyChargeStatus);
app.post("/cashlogy/cancel", handleCashlogyCancel);
app.post("/cashlogy/refund", handleCashlogyRefund);
app.get("/cashlogy/state", handleCashlogyState);
app.post("/cashlogy/backoffice", handleCashlogyBackOffice);
app.get("/cashlogy/backoffice/status", handleCashlogyBackOfficeStatus);
app.post("/cashlogy/backoffice/exit", handleCashlogyBackOfficeExit);
app.post("/cashlogy/dispense", handleCashlogyDispense);
app.get("/cashlogy/dispense/status", handleCashlogyDispenseStatus);
app.post("/cashlogy/dispense/cancel", handleCashlogyDispenseCancel);
app.post("/cashlogy/add-change", handleCashlogyAddChange);
app.get("/cashlogy/add-change/status", handleCashlogyAddChangeStatus);
app.post("/cashlogy/add-change/end", handleCashlogyAddChangeEnd);
app.get("/cashlogy/cert/config", handleCashlogyCertConfig);
app.get("/cashlogy/cert/traffic", handleCashlogyCertTraffic);
app.post("/cashlogy/cert/traffic/clear", handleCashlogyCertTrafficClear);
app.post("/ingenico/charge", handleIngenicoCharge);
app.post("/ingenico/refund", handleIngenicoRefund);
app.post("/ingenico/cancel", handleIngenicoCancel);
app.post("/ingenico/query", handleIngenicoQuery);
app.post("/ingenico/abort", handleIngenicoAbort);
app.get("/ingenico/status", handleVerifoneStatus);
app.get("/ingenico/health", handleVerifoneHealth);
app.post("/printer/ticket", handlePrintTicket);
app.post("/printer/kitchen", handlePrintKitchenTicket);
app.post("/printer/card-receipt", handlePrintCardReceipt);
app.post("/printer/z-report", handlePrintZReport);
app.get("/printer/status", handlePrinterStatus);

app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Hi Cream Bridge running on port ${PORT}`);
});
