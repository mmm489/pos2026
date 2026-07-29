BEGIN;

CREATE TABLE IF NOT EXISTS pos.employee_operational_schedule_cache (
  id TEXT PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES pos.employees(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  shift_start VARCHAR(5) NOT NULL,
  shift_end VARCHAR(5) NOT NULL,
  share_token TEXT,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_operational_schedule_cache_lookup
  ON pos.employee_operational_schedule_cache(employee_id, business_date, shift_start);

CREATE TABLE IF NOT EXISTS pos.time_clock_correction_applied (
  request_id TEXT PRIMARY KEY,
  session_id INTEGER REFERENCES pos.time_clock_sessions(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
