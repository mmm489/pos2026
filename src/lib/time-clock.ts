import type { PoolClient } from "pg";
import { rawQuery, withTransaction } from "@/lib/db";

const TIME_CLOCK_CUTOFF_HOUR = 2;
export const AUTO_CUTOFF_PENDING_SOURCE = "auto_cutoff_pending";

const TIME_CLOCK_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS pos.time_clock_sessions (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES pos.employees(id),
    business_date DATE NOT NULL,
    clock_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    clock_out_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    source VARCHAR(40) NOT NULL DEFAULT 'pos',
    device_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced BOOLEAN NOT NULL DEFAULT false,
    CHECK (clock_out_at IS NULL OR clock_out_at >= clock_in_at)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_time_clock_one_open_per_employee
   ON pos.time_clock_sessions(employee_id)
   WHERE status = 'open'`,
  `CREATE INDEX IF NOT EXISTS idx_time_clock_sessions_business_date
   ON pos.time_clock_sessions(business_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_time_clock_sessions_employee
   ON pos.time_clock_sessions(employee_id, business_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_time_clock_sessions_synced
   ON pos.time_clock_sessions(synced)`,
  `CREATE TABLE IF NOT EXISTS pos.time_clock_audit (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES pos.time_clock_sessions(id) ON DELETE SET NULL,
    employee_id INTEGER REFERENCES pos.employees(id),
    action VARCHAR(40) NOT NULL,
    previous_data JSONB,
    new_data JSONB,
    reason TEXT,
    changed_by INTEGER REFERENCES pos.employees(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced BOOLEAN NOT NULL DEFAULT false
  )`,
  `CREATE INDEX IF NOT EXISTS idx_time_clock_audit_session
   ON pos.time_clock_audit(session_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_time_clock_audit_synced
   ON pos.time_clock_audit(synced)`,
  `CREATE TABLE IF NOT EXISTS pos.employee_operational_schedule_cache (
    id TEXT PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES pos.employees(id) ON DELETE CASCADE,
    business_date DATE NOT NULL,
    shift_start VARCHAR(5) NOT NULL,
    shift_end VARCHAR(5) NOT NULL,
    share_token TEXT,
    cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_employee_operational_schedule_cache_lookup
   ON pos.employee_operational_schedule_cache(employee_id, business_date, shift_start)`,
  `CREATE TABLE IF NOT EXISTS pos.time_clock_correction_applied (
    request_id TEXT PRIMARY KEY,
    session_id INTEGER REFERENCES pos.time_clock_sessions(id) ON DELETE SET NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];

type Queryable = PoolClient | null;

export interface TimeClockEmployee {
  id: number;
  name: string;
  role: "admin" | "employee";
}

export interface TimeClockSessionRow {
  id: number;
  employee_id: number;
  employee_name?: string | null;
  business_date: string;
  clock_in_at: string;
  clock_out_at: string | null;
  status: "open" | "closed";
  source: string;
  device_name: string | null;
  created_at: string;
  updated_at: string;
}

interface OperationalScheduleWindow {
  business_date: string;
  shift_start: string;
  shift_end: string;
  share_token: string | null;
  start_at: string;
  end_at: string;
}

async function exec<T = Record<string, unknown>>(
  client: Queryable,
  text: string,
  values: unknown[] = []
): Promise<T[]> {
  if (client) {
    const result = await client.query(text, values);
    return result.rows as T[];
  }
  return rawQuery<T>(text, values);
}

export async function ensureTimeClockSchema(client: Queryable = null) {
  for (const sql of TIME_CLOCK_SCHEMA_SQL) {
    await exec(client, sql);
  }
}

export function businessDateExpression() {
  return `((NOW() AT TIME ZONE 'Europe/Madrid') - INTERVAL '${TIME_CLOCK_CUTOFF_HOUR} hours')::date`;
}

export async function closeExpiredTimeClockSessions(client: Queryable = null) {
  const rows = await exec<{ session_id: number }>(
    client,
    `WITH expired AS (
       SELECT s.id,
              s.employee_id,
              to_jsonb(s) AS previous_data,
              ((s.clock_in_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '2 hours')::date
                AS corrected_business_date,
              (
                (
                  ((s.clock_in_at AT TIME ZONE 'Europe/Madrid') - INTERVAL '2 hours')::date
                  + 1
                  + TIME '02:00'
                ) AT TIME ZONE 'Europe/Madrid'
              ) AS cutoff_at
       FROM pos.time_clock_sessions s
       WHERE s.status = 'open'
     ),
     updated AS (
       UPDATE pos.time_clock_sessions s
       SET business_date = e.corrected_business_date,
           clock_out_at = e.cutoff_at,
           status = 'closed',
           source = '${AUTO_CUTOFF_PENDING_SOURCE}',
           updated_at = NOW(),
           synced = false
       FROM expired e
       WHERE s.id = e.id
         AND s.status = 'open'
         AND NOW() >= e.cutoff_at
       RETURNING s.id AS session_id, s.employee_id, to_jsonb(s) AS new_data
     )
     INSERT INTO pos.time_clock_audit
       (session_id, employee_id, action, previous_data, new_data, reason, synced)
     SELECT u.session_id,
            u.employee_id,
            'auto_cutoff_pending',
            e.previous_data,
            u.new_data,
            'Tancament provisional automatic al tall laboral de les 02:00. Sortida pendent de revisio.',
            false
     FROM updated u
     JOIN expired e ON e.id = u.session_id
     RETURNING session_id`
  );
  return rows.length;
}

export async function findEmployeeByPin(
  pin: string,
  client: Queryable = null
): Promise<TimeClockEmployee | null> {
  const rows = await exec<TimeClockEmployee>(
    client,
    `SELECT id, name, role
     FROM pos.employees
     WHERE pin = $1 AND active = true
     LIMIT 1`,
    [pin]
  );
  return rows[0] ?? null;
}

export async function getOpenSession(
  employeeId: number,
  client: Queryable = null
): Promise<TimeClockSessionRow | null> {
  const rows = await exec<TimeClockSessionRow>(
    client,
    `SELECT s.*, e.name AS employee_name
     FROM pos.time_clock_sessions s
     JOIN pos.employees e ON e.id = s.employee_id
     WHERE s.employee_id = $1 AND s.status = 'open'
     ORDER BY s.clock_in_at DESC
     LIMIT 1`,
    [employeeId]
  );
  return rows[0] ?? null;
}

export async function listTimeClockSummary(client: Queryable = null) {
  await ensureTimeClockSchema(client);
  await closeExpiredTimeClockSessions(client);

  const openSessions = await exec<TimeClockSessionRow>(
    client,
    `SELECT s.*, e.name AS employee_name
     FROM pos.time_clock_sessions s
     JOIN pos.employees e ON e.id = s.employee_id
     WHERE s.status = 'open'
     ORDER BY s.clock_in_at ASC`
  );

  const recentSessions = await exec<TimeClockSessionRow>(
    client,
    `SELECT s.*, e.name AS employee_name
     FROM pos.time_clock_sessions s
     JOIN pos.employees e ON e.id = s.employee_id
     WHERE s.business_date = ${businessDateExpression()}
     ORDER BY COALESCE(s.clock_out_at, s.clock_in_at) DESC
     LIMIT 12`
  );

  return { openSessions, recentSessions };
}

export async function lookupTimeClockPin(pin: string) {
  await ensureTimeClockSchema();
  await closeExpiredTimeClockSessions();
  const employee = await findEmployeeByPin(pin);
  if (!employee) return null;
  const openSession = await getOpenSession(employee.id);
  return { employee, openSession };
}

async function getOperationalScheduleWindows(
  employeeId: number,
  client: Queryable,
): Promise<OperationalScheduleWindow[]> {
  return exec<OperationalScheduleWindow>(
    client,
    `SELECT business_date::text,
            shift_start,
            shift_end,
            share_token,
            ((business_date + shift_start::time) AT TIME ZONE 'Europe/Madrid')::text AS start_at,
            ((
              business_date
              + shift_end::time
              + CASE
                  WHEN shift_end::time <= shift_start::time THEN INTERVAL '1 day'
                  ELSE INTERVAL '0 days'
                END
            ) AT TIME ZONE 'Europe/Madrid')::text AS end_at
     FROM pos.employee_operational_schedule_cache
     WHERE employee_id = $1
       AND business_date BETWEEN
         ((NOW() AT TIME ZONE 'Europe/Madrid')::date - INTERVAL '1 day')::date
         AND ((NOW() AT TIME ZONE 'Europe/Madrid')::date + INTERVAL '1 day')::date
     ORDER BY business_date ASC, shift_start ASC`,
    [employeeId],
  );
}

async function getScheduleRestriction(input: {
  employeeId: number;
  action: "clock_in" | "clock_out";
  openSession?: TimeClockSessionRow | null;
  client: Queryable;
}) {
  const windows = await getOperationalScheduleWindows(input.employeeId, input.client);
  if (windows.length === 0) return null;

  const now = Date.now();
  const toleranceMs = 20 * 60 * 1000;
  let selected: OperationalScheduleWindow | undefined;

  if (input.action === "clock_in") {
    const current = windows
      .filter((window) => {
        const start = new Date(window.start_at).getTime();
        const end = new Date(window.end_at).getTime();
        return start <= now && now <= end + toleranceMs;
      })
      .at(-1);
    const next = windows.find((window) => new Date(window.start_at).getTime() > now);
    const previous = windows
      .filter((window) => new Date(window.start_at).getTime() <= now)
      .at(-1);
    selected = current ?? next ?? previous;
    if (!selected) return null;
    const deadline = new Date(selected.start_at).getTime() + toleranceMs;
    if (now <= deadline) return null;
  } else {
    const clockInAt = input.openSession
      ? new Date(input.openSession.clock_in_at).getTime()
      : now;
    selected = windows
      .map((window) => ({
        window,
        distance: Math.abs(new Date(window.start_at).getTime() - clockInAt),
      }))
      .sort((a, b) => a.distance - b.distance)[0]?.window;
    if (!selected) return null;
    const deadline = new Date(selected.end_at).getTime() + toleranceMs;
    if (now <= deadline) return null;
  }

  const publicBaseUrl = (
    process.env.HORARI_PUBLIC_BASE_URL || "https://horari-brown.vercel.app"
  ).replace(/\/+$/, "");
  return {
    code: "SCHEDULE_CORRECTION_REQUIRED",
    status: 422,
    error: input.action === "clock_in"
      ? "Han passat mes de 20 minuts des de l'inici del torn. Envia la correccio des del teu enllac d'horari."
      : "Han passat mes de 20 minuts des del final del torn. Envia la correccio des del teu enllac d'horari.",
    scheduleUrl: selected.share_token
      ? `${publicBaseUrl}/${selected.share_token}?week=${selected.business_date}`
      : null,
  };
}

export async function clockIn(pin: string) {
  return withTransaction(async (client) => {
    await ensureTimeClockSchema(client);
    await closeExpiredTimeClockSessions(client);
    const employee = await findEmployeeByPin(pin, client);
    if (!employee) return { ok: false as const, status: 401, error: "PIN incorrecto" };

    const existing = await getOpenSession(employee.id, client);
    if (existing) {
      return {
        ok: true as const,
        action: "already_open" as const,
        employee,
        session: existing,
      };
    }

    const restriction = await getScheduleRestriction({
      employeeId: employee.id,
      action: "clock_in",
      client,
    });
    if (restriction) return { ok: false as const, ...restriction, employee };

    const result = await client.query<TimeClockSessionRow>(
      `INSERT INTO pos.time_clock_sessions
        (employee_id, business_date, source, device_name)
       VALUES ($1, ${businessDateExpression()}, 'pos', $2)
       RETURNING *`,
      [employee.id, process.env.COMPUTERNAME || process.env.HOSTNAME || null]
    );
    const session = result.rows[0];

    await client.query(
      `INSERT INTO pos.time_clock_audit
        (session_id, employee_id, action, new_data)
       VALUES ($1, $2, 'clock_in', to_jsonb($3::jsonb))`,
      [session.id, employee.id, JSON.stringify(session)]
    );

    return {
      ok: true as const,
      action: "clock_in" as const,
      employee,
      session: { ...session, employee_name: employee.name },
    };
  });
}

export async function clockOut(pin: string) {
  return withTransaction(async (client) => {
    await ensureTimeClockSchema(client);
    await closeExpiredTimeClockSessions(client);
    const employee = await findEmployeeByPin(pin, client);
    if (!employee) return { ok: false as const, status: 401, error: "PIN incorrecto" };

    const openSession = await getOpenSession(employee.id, client);
    if (!openSession) {
      return {
        ok: false as const,
        status: 409,
        error: "No hi ha cap entrada oberta per aquest empleat",
        employee,
      };
    }

    const restriction = await getScheduleRestriction({
      employeeId: employee.id,
      action: "clock_out",
      openSession,
      client,
    });
    if (restriction) return { ok: false as const, ...restriction, employee };

    const result = await client.query<TimeClockSessionRow>(
      `UPDATE pos.time_clock_sessions
       SET clock_out_at = NOW(),
           status = 'closed',
           updated_at = NOW(),
           synced = false
       WHERE id = $1
       RETURNING *`,
      [openSession.id]
    );
    const session = result.rows[0];

    await client.query(
      `INSERT INTO pos.time_clock_audit
        (session_id, employee_id, action, previous_data, new_data)
       VALUES ($1, $2, 'clock_out', to_jsonb($3::jsonb), to_jsonb($4::jsonb))`,
      [session.id, employee.id, JSON.stringify(openSession), JSON.stringify(session)]
    );

    return {
      ok: true as const,
      action: "clock_out" as const,
      employee,
      session: { ...session, employee_name: employee.name },
    };
  });
}
