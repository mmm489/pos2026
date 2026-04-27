require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { handleCashlogyCharge, handleCashlogyChargeStatus, handleCashlogyCancel, handleCashlogyState } = require("./routes/cashlogy");
const {
  handleIngenicoCharge,
  handleIngenicoRefund,
  handleIngenicoCancel,
  handleVerifoneStatus,
  handleVerifoneHealth,
} = require("./routes/ingenico");
const { handlePrintTicket, handlePrintKitchenTicket } = require("./routes/printer");

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
app.post("/cashlogy/charge", handleCashlogyCharge);
app.get("/cashlogy/charge/status", handleCashlogyChargeStatus);
app.post("/cashlogy/cancel", handleCashlogyCancel);
app.get("/cashlogy/state", handleCashlogyState);
app.post("/ingenico/charge", handleIngenicoCharge);
app.post("/ingenico/refund", handleIngenicoRefund);
app.post("/ingenico/cancel", handleIngenicoCancel);
app.get("/ingenico/status", handleVerifoneStatus);
app.get("/ingenico/health", handleVerifoneHealth);
app.post("/printer/ticket", handlePrintTicket);
app.post("/printer/kitchen", handlePrintKitchenTicket);

app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Hi Cream Bridge running on port ${PORT}`);
});
