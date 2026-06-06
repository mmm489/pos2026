"use client";

import { useEffect, useMemo, useState } from "react";

interface TimeClockEmployee {
  id: number;
  name: string;
  role: "admin" | "employee";
}

interface TimeClockSession {
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

interface TimeClockSummary {
  openSessions: TimeClockSession[];
  recentSessions: TimeClockSession[];
}

interface TimeClockModalProps {
  onClose: () => void;
}

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "CLR", "0", "DEL"];

function formatTime(value?: string | null) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function elapsedSince(value?: string | null) {
  if (!value) return "";
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "";
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest} min`;
  return `${hours} h ${String(rest).padStart(2, "0")} min`;
}

export default function TimeClockModal({ onClose }: TimeClockModalProps) {
  const [pin, setPin] = useState("");
  const [employee, setEmployee] = useState<TimeClockEmployee | null>(null);
  const [openSession, setOpenSession] = useState<TimeClockSession | null>(null);
  const [summary, setSummary] = useState<TimeClockSummary>({
    openSessions: [],
    recentSessions: [],
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isReady = pin.length === 4 && employee != null;
  const actionLabel = openSession ? "Fichar salida" : "Fichar entrada";
  const actionClass = openSession
    ? "bg-[#c65137] text-white active:bg-[#aa412b]"
    : "bg-[#2e9e5b] text-white active:bg-[#27874e]";

  const pinDots = useMemo(
    () => Array.from({ length: 4 }, (_, index) => index < pin.length),
    [pin]
  );

  const loadSummary = async () => {
    try {
      const res = await fetch("/api/pos/time-clock", { cache: "no-store" });
      if (res.ok) setSummary(await res.json());
    } catch {
      // Keep the modal usable if the recent list fails to load.
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  useEffect(() => {
    if (pin.length !== 4) {
      setEmployee(null);
      setOpenSession(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setMessage(null);
    fetch("/api/pos/time-clock/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setMessage(body.error || "PIN incorrecto");
          setEmployee(null);
          setOpenSession(null);
          setPin("");
          return;
        }
        setEmployee(body.employee);
        setOpenSession(body.openSession ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setMessage("Error comprovant PIN");
          setPin("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pin]);

  const pressKey = (key: string) => {
    setMessage(null);
    if (key === "CLR") {
      setPin("");
      setEmployee(null);
      setOpenSession(null);
      return;
    }
    if (key === "DEL") {
      setPin((current) => current.slice(0, -1));
      return;
    }
    if (pin.length < 4) setPin((current) => `${current}${key}`.slice(0, 4));
  };

  const submit = async () => {
    if (!isReady) return;
    setLoading(true);
    setMessage(null);
    const endpoint = openSession
      ? "/api/pos/time-clock/clock-out"
      : "/api/pos/time-clock/clock-in";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.error || "No s'ha pogut registrar");
        return;
      }
      const action = body.action === "clock_out" ? "salida" : "entrada";
      setMessage(`${body.employee?.name ?? "Empleado"}: ${action} registrada`);
      setPin("");
      setEmployee(null);
      setOpenSession(null);
      await loadSummary();
    } catch {
      setMessage("Error de connexio amb el POS");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10131b]/68 p-3">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#ddd4c4] bg-[#faf9f6] text-[#241f1c] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#ddd4c4] px-6 py-4">
          <div>
            <h2 className="text-3xl font-medium leading-tight">Fichar</h2>
            <p className="text-sm text-[#6f665c]">
              Entrada i sortida independent de l&apos;empleat de caixa.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#d4cbbb] bg-white text-2xl text-[#6f665c] active:bg-[#f1eee7]"
          >
            x
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[420px_1fr]">
          <div className="border-b border-[#ddd4c4] p-6 lg:border-b-0 lg:border-r">
            <div className="rounded-2xl border border-[#d4cbbb] bg-white p-5 shadow-sm">
              <div className="mb-5 flex justify-center gap-3">
                {pinDots.map((filled, index) => (
                  <div
                    key={index}
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl border text-2xl font-semibold ${
                      filled
                        ? "border-[#241f1c] bg-[#241f1c] text-white"
                        : "border-[#d4cbbb] bg-[#f5f4ef]"
                    }`}
                  >
                    {filled ? "*" : ""}
                  </div>
                ))}
              </div>

              {employee && (
                <div className="mb-4 rounded-2xl bg-[#eef7f1] px-4 py-3 text-center">
                  <p className="text-sm font-medium uppercase tracking-wide text-[#31764d]">
                    {openSession ? "Jornada oberta" : "Sense jornada oberta"}
                  </p>
                  <p className="text-2xl font-semibold text-[#241f1c]">{employee.name}</p>
                  {openSession && (
                    <p className="text-sm text-[#5f6878]">
                      Entrada {formatTime(openSession.clock_in_at)} · {elapsedSince(openSession.clock_in_at)}
                    </p>
                  )}
                </div>
              )}

              {message && (
                <div className="mb-4 rounded-2xl bg-[#fff4d8] px-4 py-3 text-center text-sm font-semibold text-[#7b5b12]">
                  {message}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                {DIGITS.map((key) => (
                  <button
                    key={key}
                    onClick={() => pressKey(key)}
                    disabled={loading && key !== "DEL" && key !== "CLR"}
                    className="h-16 rounded-2xl border border-[#d4cbbb] bg-white text-2xl font-semibold text-[#241f1c] shadow-sm active:bg-[#f1eee7] disabled:opacity-60"
                  >
                    {key === "DEL" ? "<" : key}
                  </button>
                ))}
              </div>

              <button
                onClick={submit}
                disabled={!isReady || loading}
                className={`mt-4 h-16 w-full rounded-2xl text-2xl font-semibold disabled:bg-[#d8d2c6] disabled:text-[#92887b] ${actionClass}`}
              >
                {loading ? "Comprovant..." : actionLabel}
              </button>
            </div>
          </div>

          <div className="space-y-5 p-6">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-2xl font-medium">Treballant ara</h3>
                <span className="rounded-full bg-[#edf7f0] px-3 py-1 text-sm font-semibold text-[#31764d]">
                  {summary.openSessions.length}
                </span>
              </div>
              <div className="space-y-2">
                {summary.openSessions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#d4cbbb] bg-white px-4 py-5 text-[#6f665c]">
                    No hi ha cap jornada oberta.
                  </div>
                ) : (
                  summary.openSessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center justify-between rounded-2xl border border-[#d4cbbb] bg-white px-4 py-3"
                    >
                      <div>
                        <p className="text-lg font-semibold">{session.employee_name}</p>
                        <p className="text-sm text-[#6f665c]">
                          Entrada {formatTime(session.clock_in_at)}
                        </p>
                      </div>
                      <span className="rounded-full bg-[#f1eee7] px-3 py-1 text-sm font-semibold text-[#5f6878]">
                        {elapsedSince(session.clock_in_at)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-2xl font-medium">Ultims fitxatges d&apos;avui</h3>
              <div className="space-y-2">
                {summary.recentSessions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#d4cbbb] bg-white px-4 py-5 text-[#6f665c]">
                    Encara no hi ha fitxatges avui.
                  </div>
                ) : (
                  summary.recentSessions.map((session) => (
                    <div
                      key={session.id}
                      className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl border border-[#d4cbbb] bg-white px-4 py-3"
                    >
                      <div>
                        <p className="text-lg font-semibold">{session.employee_name}</p>
                        <p className="text-sm text-[#6f665c]">
                          Entrada {formatTime(session.clock_in_at)}
                          {session.clock_out_at ? ` · Sortida ${formatTime(session.clock_out_at)}` : ""}
                        </p>
                      </div>
                      <span
                        className={`self-center rounded-full px-3 py-1 text-sm font-semibold ${
                          session.status === "open"
                            ? "bg-[#edf7f0] text-[#31764d]"
                            : "bg-[#f1eee7] text-[#5f6878]"
                        }`}
                      >
                        {session.status === "open" ? "Obert" : "Tancat"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
