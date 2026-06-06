-- Hi Cream POS - Migration v12
-- Employee time clock sessions for Spanish labor record keeping.
-- Safe to re-run multiple times.
--
-- Run: psql -U postgres -d hicream -f scripts/migrate-v12.sql

CREATE TABLE IF NOT EXISTS pos.time_clock_sessions (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_time_clock_one_open_per_employee
ON pos.time_clock_sessions(employee_id)
WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_time_clock_sessions_business_date
ON pos.time_clock_sessions(business_date DESC);

CREATE INDEX IF NOT EXISTS idx_time_clock_sessions_employee
ON pos.time_clock_sessions(employee_id, business_date DESC);

CREATE INDEX IF NOT EXISTS idx_time_clock_sessions_synced
ON pos.time_clock_sessions(synced);

CREATE TABLE IF NOT EXISTS pos.time_clock_audit (
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
);

CREATE INDEX IF NOT EXISTS idx_time_clock_audit_session
ON pos.time_clock_audit(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_time_clock_audit_synced
ON pos.time_clock_audit(synced);
