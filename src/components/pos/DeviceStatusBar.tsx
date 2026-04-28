"use client";

import { useEffect, useState } from "react";
import {
  getIngenicoHealth,
  getCashlogyState,
  getPrinterStatus,
} from "@/lib/bridge";

type DeviceStatus = {
  ok: boolean;
  detail?: string;
};

type AllStatus = {
  pinpad: DeviceStatus;
  cashlogy: DeviceStatus;
  receiptPrinter: DeviceStatus;
  kitchenPrinter: DeviceStatus;
};

const POLL_INTERVAL_MS = 8_000;

async function probeAll(): Promise<AllStatus> {
  const [pinpad, cashlogy, printer] = await Promise.all([
    getIngenicoHealth(),
    getCashlogyState(),
    getPrinterStatus(),
  ]);
  return {
    pinpad: { ok: pinpad.online, detail: pinpad.error || pinpad.pinpadInfo },
    cashlogy: {
      ok: !("error" in cashlogy && cashlogy.error),
      detail: (cashlogy as { error?: string }).error,
    },
    receiptPrinter: {
      ok: printer.receipt.connected,
      detail: printer.receipt.error,
    },
    kitchenPrinter: {
      ok: printer.kitchen.connected,
      detail: printer.kitchen.error,
    },
  };
}

interface DeviceStatusBarProps {
  className?: string;
  compact?: boolean;
}

export default function DeviceStatusBar({
  className = "",
  compact = false,
}: DeviceStatusBarProps) {
  const [status, setStatus] = useState<AllStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const next = await probeAll();
      if (!cancelled) {
        setStatus(next);
        setLoading(false);
      }
    };
    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const items: { key: keyof AllStatus; label: string }[] = [
    { key: "pinpad", label: "Datàfon" },
    { key: "cashlogy", label: "Cashlogy" },
    { key: "receiptPrinter", label: "Impressora" },
    { key: "kitchenPrinter", label: "Cuina" },
  ];

  return (
    <div className={`flex flex-wrap gap-2 justify-center ${className}`}>
      {items.map(({ key, label }) => {
        const s = status?.[key];
        const isLoading = loading || !status;
        const ok = s?.ok === true;
        const dotClass = isLoading
          ? "bg-gray-300 animate-pulse"
          : ok
          ? "bg-green-500"
          : "bg-red-500";
        const textClass = isLoading
          ? "text-gray-400"
          : ok
          ? "text-green-700"
          : "text-red-700";
        const bgClass = isLoading
          ? "bg-gray-50 border-gray-200"
          : ok
          ? "bg-green-50 border-green-200"
          : "bg-red-50 border-red-200";
        const stateLabel = isLoading
          ? "Comprovant..."
          : ok
          ? "Connectat"
          : "Desconnectat";
        return (
          <div
            key={key}
            title={s?.detail || stateLabel}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${bgClass} ${textClass}`}
          >
            <span className={`w-2 h-2 rounded-full ${dotClass}`} />
            <span>{label}</span>
            {!compact && (
              <span className="text-[10px] opacity-70">{stateLabel}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
