import type { PoolClient } from "pg";
import { rawQuery, withTransaction } from "@/lib/db";

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
  return "((NOW() AT TIME ZONE 'Europe/Madrid') - INTERVAL '4 hours')::date";
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
  const employee = await findEmployeeByPin(pin);
  if (!employee) return null;
  const openSession = await getOpenSession(employee.id);
  return { employee, openSession };
}

export async function clockIn(pin: string) {
  return withTransaction(async (client) => {
    await ensureTimeClockSchema(client);
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
