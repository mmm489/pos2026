"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || "http://localhost:3006";

type CertConfig = {
  cashlogyBase: string;
  notificationsUrl: string;
  apiKeyConfigured: boolean;
  machineCode: string;
  trafficLimit: number;
};

type LogEntry = {
  id: string;
  ts: string;
  source: "ui" | "websocket" | "bridge";
  label: string;
  ok?: boolean;
  data?: unknown;
};

type TrafficEntry = {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  request: unknown;
  timeoutMs: number;
  ok: boolean;
  status: number | null;
  durationMs: number | null;
  response: unknown;
  error: string | null;
};

export default function CashlogyCertPage() {
  const [config, setConfig] = useState<CertConfig | null>(null);
  const [wsState, setWsState] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [traffic, setTraffic] = useState<TrafficEntry[]>([]);
  const [amount, setAmount] = useState("0.10");
  const [cashlessPeripheralId, setCashlessPeripheralId] = useState("");
  const [refundTransactionNumber, setRefundTransactionNumber] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const addLog = useCallback((entry: Omit<LogEntry, "id" | "ts">) => {
    setLogs((current) => [
      {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ts: new Date().toISOString(),
      },
      ...current,
    ].slice(0, 250));
  }, []);

  const loadTraffic = useCallback(async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/cashlogy/cert/traffic`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items?: TrafficEntry[] };
      setTraffic(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      addLog({
        source: "bridge",
        label: "No se pudo leer el trafico del bridge",
        ok: false,
        data: String((error as Error).message || error),
      });
    }
  }, [addLog]);

  const connectNotifications = useCallback((url: string) => {
    socketRef.current?.close();
    setWsState("connecting");

    try {
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        setWsState("connected");
        addLog({ source: "websocket", label: "WebSocket conectado", ok: true, data: { url } });
      };

      socket.onmessage = (event) => {
        let data: unknown = event.data;
        try {
          data = JSON.parse(String(event.data));
        } catch {
          data = event.data;
        }
        addLog({ source: "websocket", label: "Notificacion recibida", ok: true, data });
      };

      socket.onerror = () => {
        setWsState("error");
        addLog({ source: "websocket", label: "Error en WebSocket", ok: false, data: { url } });
      };

      socket.onclose = () => {
        setWsState((current) => (current === "error" ? "error" : "disconnected"));
        addLog({ source: "websocket", label: "WebSocket cerrado", ok: false, data: { url } });
      };
    } catch (error) {
      setWsState("error");
      addLog({ source: "websocket", label: "No se pudo abrir WebSocket", ok: false, data: String(error) });
    }
  }, [addLog]);

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const res = await fetch(`${BRIDGE_URL}/cashlogy/cert/config`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as CertConfig;
        if (cancelled) return;
        setConfig(data);
        addLog({ source: "bridge", label: "Configuracion de certificacion cargada", ok: true, data });
        connectNotifications(data.notificationsUrl);
      } catch (error) {
        if (cancelled) return;
        addLog({
          source: "bridge",
          label: "No se pudo cargar la configuracion de Cashlogy",
          ok: false,
          data: String((error as Error).message || error),
        });
      }
    }

    loadConfig();
    return () => {
      cancelled = true;
      socketRef.current?.close();
    };
  }, [addLog, connectNotifications]);

  useEffect(() => {
    loadTraffic();
    const interval = window.setInterval(loadTraffic, 1500);
    return () => window.clearInterval(interval);
  }, [loadTraffic]);

  const visibleBundle = useMemo(() => ({
    exportedAt: new Date().toISOString(),
    config,
    uiLogs: logs,
    cashlogyTraffic: traffic,
  }), [config, logs, traffic]);

  async function callBridge(label: string, path: string, options?: { method?: string; body?: unknown; timeoutMs?: number }) {
    const method = options?.method || "POST";
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), options?.timeoutMs || 90_000);
    setBusy(label);
    addLog({ source: "ui", label: `${label}: solicitud enviada`, ok: true, data: { method, path, body: options?.body } });

    try {
      const res = await fetch(`${BRIDGE_URL}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify(options?.body || {}),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({ raw: "Respuesta no JSON" }));
      addLog({ source: "ui", label: `${label}: respuesta recibida`, ok: res.ok, data });
    } catch (error) {
      addLog({
        source: "ui",
        label: `${label}: error`,
        ok: false,
        data: (error as Error).name === "AbortError" ? "Timeout" : String((error as Error).message || error),
      });
    } finally {
      window.clearTimeout(timeout);
      setBusy(null);
      loadTraffic();
    }
  }

  async function clearLogs() {
    setLogs([]);
    setTraffic([]);
    await fetch(`${BRIDGE_URL}/cashlogy/cert/traffic/clear`, { method: "POST" }).catch(() => null);
    addLog({ source: "ui", label: "Logs limpiados", ok: true });
  }

  function downloadLogs() {
    const blob = new Blob([JSON.stringify(visibleBundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cashlogy-cert-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const parsedAmount = Number(amount.replace(",", "."));
  const canCharge = Number.isFinite(parsedAmount) && parsedAmount > 0 && !busy;
  const amountCents = Number.isFinite(parsedAmount) ? Math.round(parsedAmount * 100) : 0;
  const canRefund = amountCents > 0 && refundTransactionNumber.trim().length > 0 && !busy;

  return (
    <main className="min-h-screen bg-[#f6f2ea] p-5 text-[#231f1b]">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="rounded-2xl border border-[#dccfbb] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8a7761]">Modo certificacion</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Cashlogy ConnectorPlus</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold text-[#6f6255]">
                Pantalla aislada para precertificacion. Escucha <code>notifications</code>, muestra solicitudes/respuestas y permite pruebas manuales controladas.
              </p>
            </div>
            <div className="grid gap-2 text-sm font-bold sm:grid-cols-2 lg:min-w-[420px]">
              <StatusPill label="WebSocket" value={wsState} tone={wsState === "connected" ? "green" : wsState === "error" ? "red" : "amber"} />
              <StatusPill label="API Key" value={config?.apiKeyConfigured ? "configurada" : "no detectada"} tone={config?.apiKeyConfigured ? "green" : "red"} />
              <StatusPill label="Bridge" value={BRIDGE_URL} tone="neutral" />
              <StatusPill label="Connector" value={config?.cashlogyBase || "pendiente"} tone="neutral" />
            </div>
          </div>
        </header>

        <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
          <div className="flex flex-col gap-5">
            <div className="rounded-2xl border border-[#dccfbb] bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black">Pruebas controladas</h2>
              <p className="mt-1 text-sm font-semibold text-[#6f6255]">
                Estos botones si llaman a Cashlogy. Usarlos solo cuando no haya un cobro real en curso.
              </p>

              <div className="mt-4 grid gap-3">
                <button
                  disabled={Boolean(busy)}
                  onClick={() => callBridge("Init", "/cashlogy/init", { timeoutMs: 90_000 })}
                  className="rounded-xl bg-[#2f9e62] px-4 py-3 text-base font-black text-white shadow-sm disabled:opacity-50"
                >
                  Init
                </button>
                <button
                  disabled={Boolean(busy)}
                  onClick={() => callBridge("State", "/cashlogy/state", { method: "GET", timeoutMs: 20_000 })}
                  className="rounded-xl border border-[#dccfbb] bg-[#fbfaf7] px-4 py-3 text-base font-black disabled:opacity-50"
                >
                  Consultar estado
                </button>

                <label className="text-sm font-black text-[#6f6255]">
                  Importe de prueba
                  <input
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode="decimal"
                    className="mt-2 w-full rounded-xl border border-[#dccfbb] bg-white px-4 py-3 text-2xl font-black outline-none focus:border-[#2f9e62]"
                  />
                </label>

                <label className="text-sm font-black text-[#6f6255]">
                  PeripheralId SNEXT opcional
                  <input
                    value={cashlessPeripheralId}
                    onChange={(event) => setCashlessPeripheralId(event.target.value)}
                    placeholder="Vacío: ConnectorPlus muestra selector si hay varios"
                    className="mt-2 w-full rounded-xl border border-[#dccfbb] bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#7c3aed]"
                  />
                </label>

                <label className="text-sm font-black text-[#6f6255]">
                  TransactionNumber original SNEXT
                  <input
                    value={refundTransactionNumber}
                    onChange={(event) => setRefundTransactionNumber(event.target.value)}
                    placeholder="Ej. 322030071792"
                    className="mt-2 w-full rounded-xl border border-[#dccfbb] bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#b45309]"
                  />
                </label>

                <button
                  disabled={!canCharge}
                  onClick={() =>
                    callBridge("Charge prueba", "/cashlogy/charge", {
                      body: {
                        amount: parsedAmount,
                        ticketNumber: `CERT-${Date.now()}`,
                        machineCode: config?.machineCode || "hicream-pos",
                        screenVisible: true,
                        topMost: true,
                        type: "CASH",
                      },
                      timeoutMs: 210_000,
                    })
                  }
                  className="rounded-xl bg-[#2563eb] px-4 py-3 text-base font-black text-white shadow-sm disabled:opacity-50"
                >
                  Charge CASH prueba
                </button>

                <button
                  disabled={!canCharge}
                  onClick={() =>
                    callBridge("Charge CASHLESS SNEXT", "/cashlogy/charge", {
                      body: {
                        amount: parsedAmount,
                        ticketNumber: `CERT-SNEXT-${Date.now()}`,
                        machineCode: config?.machineCode || "hicream-pos",
                        screenVisible: true,
                        topMost: true,
                        type: "CASHLESS",
                        peripheralId: cashlessPeripheralId.trim(),
                      },
                      timeoutMs: 210_000,
                    })
                  }
                  className="rounded-xl bg-[#7c3aed] px-4 py-3 text-base font-black text-white shadow-sm disabled:opacity-50"
                >
                  Charge CASHLESS SNEXT
                </button>

                <button
                  disabled={!canRefund}
                  onClick={() =>
                    callBridge("Abono CASHLESS SNEXT", "/cashlogy/refund", {
                      body: {
                        amountCents,
                        transactionNumber: refundTransactionNumber.trim(),
                        ticketNumber: "ticket-123",
                        machineCode: "machine-123",
                        screenVisible: false,
                        topMost: false,
                        peripheralId: cashlessPeripheralId.trim(),
                      },
                      timeoutMs: 150_000,
                    })
                  }
                  className="rounded-xl bg-[#b45309] px-4 py-3 text-base font-black text-white shadow-sm disabled:opacity-50"
                >
                  Abono CASHLESS SNEXT
                </button>

                <button
                  disabled={Boolean(busy)}
                  onClick={() => callBridge("Cancel", "/cashlogy/cancel", { timeoutMs: 20_000 })}
                  className="rounded-xl bg-[#dc2626] px-4 py-3 text-base font-black text-white shadow-sm disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-[#dccfbb] bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black">Acciones de log</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  onClick={downloadLogs}
                  className="rounded-xl bg-[#231f1b] px-4 py-3 text-sm font-black text-white"
                >
                  Descargar JSON
                </button>
                <button
                  onClick={clearLogs}
                  className="rounded-xl border border-[#dccfbb] bg-[#fbfaf7] px-4 py-3 text-sm font-black"
                >
                  Limpiar
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-5">
            <LogPanel title="Eventos WebSocket y acciones POS" entries={logs} />
            <TrafficPanel entries={traffic} />
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusPill({ label, value, tone }: { label: string; value: string; tone: "green" | "red" | "amber" | "neutral" }) {
  const tones = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    red: "border-rose-200 bg-rose-50 text-rose-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <p className="text-[10px] uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-0.5 truncate">{value}</p>
    </div>
  );
}

function LogPanel({ title, entries }: { title: string; entries: LogEntry[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#dccfbb] bg-white shadow-sm">
      <div className="border-b border-[#eadfce] px-5 py-4">
        <h2 className="text-xl font-black">{title}</h2>
        <p className="mt-1 text-sm font-semibold text-[#6f6255]">{entries.length} eventos registrados</p>
      </div>
      <div className="max-h-[420px] overflow-auto p-4">
        {entries.length === 0 ? (
          <p className="rounded-xl bg-[#fbfaf7] p-4 text-sm font-semibold text-[#6f6255]">
            Sin eventos todavia.
          </p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <article key={entry.id} className="rounded-xl border border-[#eadfce] bg-[#fbfaf7] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${entry.ok === false ? "bg-rose-500" : "bg-emerald-500"}`} />
                    <p className="font-black">{entry.label}</p>
                  </div>
                  <p className="text-xs font-bold text-[#8a7761]">{formatTime(entry.ts)} · {entry.source}</p>
                </div>
                {entry.data !== undefined && (
                  <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-[#231f1b] p-3 text-xs text-white">
                    {JSON.stringify(entry.data, null, 2)}
                  </pre>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TrafficPanel({ entries }: { entries: TrafficEntry[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#dccfbb] bg-white shadow-sm">
      <div className="border-b border-[#eadfce] px-5 py-4">
        <h2 className="text-xl font-black">Solicitudes y respuestas API</h2>
        <p className="mt-1 text-sm font-semibold text-[#6f6255]">
          Trafico real del bridge hacia ConnectorPlus. No muestra la API key.
        </p>
      </div>
      <div className="max-h-[520px] overflow-auto p-4">
        {entries.length === 0 ? (
          <p className="rounded-xl bg-[#fbfaf7] p-4 text-sm font-semibold text-[#6f6255]">
            Aun no hay trafico registrado.
          </p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <article key={entry.id} className="rounded-xl border border-[#eadfce] bg-[#fbfaf7] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-black ${entry.ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                      {entry.ok ? "OK" : "ERROR"}
                    </span>
                    <p className="font-black">{entry.method} {entry.path}</p>
                  </div>
                  <p className="text-xs font-bold text-[#8a7761]">
                    {formatTime(entry.timestamp)} · HTTP {entry.status ?? "-"} · {entry.durationMs ?? "-"} ms
                  </p>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <JsonBox label="Request" value={entry.request} />
                  <JsonBox label={entry.error ? "Error" : "Response"} value={entry.error || entry.response} />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function JsonBox({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 text-xs font-black uppercase tracking-wider text-[#8a7761]">{label}</p>
      <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg bg-[#231f1b] p-3 text-xs text-white">
        {JSON.stringify(value ?? null, null, 2)}
      </pre>
    </div>
  );
}

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
