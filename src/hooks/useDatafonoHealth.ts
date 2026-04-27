"use client";

import { useEffect, useRef, useState } from "react";
import { getIngenicoHealth } from "@/lib/bridge";

export interface DatafonoHealth {
  online: boolean;
  pinpadInfo?: string;
  lastCheck: Date | null;
  error?: string;
}

/**
 * Polls the datáfono health endpoint at a regular interval. Use to gate the
 * "Targeta" button so the cashier doesn't sit through a 2-minute timeout when
 * the datáfono is offline.
 *
 * Default interval is 30s while idle. Pass a shorter `intervalMs` (e.g. 5_000)
 * if you need it more reactive on a specific screen.
 */
export function useDatafonoHealth(intervalMs = 30_000): DatafonoHealth {
  const [health, setHealth] = useState<DatafonoHealth>({
    online: false,
    lastCheck: null,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      const result = await getIngenicoHealth();
      if (!mountedRef.current) return;
      setHealth({
        online: result.online,
        pinpadInfo: result.pinpadInfo,
        error: result.error,
        lastCheck: new Date(),
      });
      if (mountedRef.current) {
        timer = setTimeout(check, intervalMs);
      }
    };
    check();

    return () => {
      mountedRef.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [intervalMs]);

  return health;
}
