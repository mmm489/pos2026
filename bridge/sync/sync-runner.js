/**
 * Hi Cream POS - Dashboard Sync Runner
 * Runs the local POS -> cloud dashboard sync on an interval.
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { runSync } = require("./sync");

const INTERVAL_MS = Number(process.env.DASHBOARD_SYNC_INTERVAL_MS || 5 * 60 * 1000);

function log(message) {
  console.log(`[${new Date().toISOString()}] [SyncRunner] ${message}`);
}

async function runOnce() {
  try {
    await runSync();
  } catch (error) {
    log(`Error inesperado: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function start() {
  log(`Iniciado - sincronizando cada ${Math.round(INTERVAL_MS / 1000)} segundos`);

  await runOnce();

  setInterval(runOnce, INTERVAL_MS);
}

start();
