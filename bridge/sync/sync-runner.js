/**
 * Hi Cream POS — Sync Runner
 * Ejecuta la sincronización local → Neon cada 5 minutos
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { runSync } = require("./sync");

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

function log(msg) {
  console.log(`[${new Date().toISOString()}] [SyncRunner] ${msg}`);
}

async function start() {
  log("Iniciado — sincronizando cada 5 minutos");

  // Primera sync al arrancar
  await runSync();

  // Repetir cada 5 min
  setInterval(async () => {
    await runSync();
  }, INTERVAL_MS);
}

start();
