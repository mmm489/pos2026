/**
 * Hi Cream POS - Dashboard Sync Runner
 * Uses the shop schedule to avoid keeping Neon awake while the shop is closed.
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { runSync } = require("./sync");

const TIME_ZONE = process.env.DASHBOARD_SYNC_TIMEZONE || "Europe/Madrid";
const DAY_INTERVAL_MS = Number(process.env.DASHBOARD_SYNC_DAY_INTERVAL_MS || 30 * 60 * 1000);
const PEAK_INTERVAL_MS = Number(process.env.DASHBOARD_SYNC_PEAK_INTERVAL_MS || 5 * 60 * 1000);
const NIGHT_CHECK_INTERVAL_MS = Number(
  process.env.DASHBOARD_SYNC_NIGHT_CHECK_INTERVAL_MS || 30 * 60 * 1000,
);

const DAY_START_HOUR = 7;
const PEAK_START_HOUR = 19;
const NIGHT_START_HOUR = 1;

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function log(message) {
  console.log(`[${new Date().toISOString()}] [SyncRunner] ${message}`);
}

function getLocalClock(date = new Date()) {
  const values = Object.fromEntries(
    clockFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function getSchedule(date = new Date()) {
  const clock = getLocalClock(date);

  if (clock.hour >= NIGHT_START_HOUR && clock.hour < DAY_START_HOUR) {
    return {
      mode: "closed",
      shouldSync: false,
      intervalMs: NIGHT_CHECK_INTERVAL_MS,
      clock,
    };
  }

  if (clock.hour >= PEAK_START_HOUR || clock.hour < NIGHT_START_HOUR) {
    return {
      mode: "peak",
      shouldSync: true,
      intervalMs: PEAK_INTERVAL_MS,
      clock,
    };
  }

  return {
    mode: "day",
    shouldSync: true,
    intervalMs: DAY_INTERVAL_MS,
    clock,
  };
}

function millisecondsUntilNextSlot(intervalMs, clock) {
  const intervalMinutes = Math.max(1, Math.round(intervalMs / 60000));
  const elapsedMs = (clock.minute * 60 + clock.second) * 1000;
  const slotMs = intervalMinutes * 60 * 1000;
  const remainder = elapsedMs % slotMs;
  return remainder === 0 ? slotMs : slotMs - remainder;
}

async function tick() {
  const schedule = getSchedule();

  if (schedule.shouldSync) {
    try {
      await runSync();
    } catch (error) {
      log(`Error inesperado: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    log("Heladeria cerrada (01:00-07:00 Europe/Madrid) - Neon no se consulta");
  }

  const nextSchedule = getSchedule();
  const delayMs = millisecondsUntilNextSlot(nextSchedule.intervalMs, nextSchedule.clock);
  log(
    `Modo ${nextSchedule.mode}; proxima comprobacion en ${Math.round(delayMs / 60000)} minutos`,
  );
  setTimeout(tick, delayMs);
}

function start() {
  log(
    `Iniciado (${TIME_ZONE}) - dia 30 min, pico 19:00-01:00 cada ${Math.round(
      PEAK_INTERVAL_MS / 60000,
    )} min, cerrado 01:00-07:00 sin Neon`,
  );
  void tick();
}

module.exports = {
  getLocalClock,
  getSchedule,
  millisecondsUntilNextSlot,
};

if (require.main === module) {
  start();
}
