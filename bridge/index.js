require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { handleCashlogyCharge, handleCashlogyChargeStatus, handleCashlogyCancel, handleCashlogyState } = require("./routes/cashlogy");
const { handleIngenicoCharge } = require("./routes/ingenico");
const { handlePrintTicket } = require("./routes/printer");

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
app.post("/printer/ticket", handlePrintTicket);

app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Hi Cream Bridge running on port ${PORT}`);
});
