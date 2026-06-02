"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CustomerDisplaySnapshot,
  readCustomerDisplaySnapshot,
  subscribeCustomerDisplay,
} from "@/lib/customer-display";
import { resolveColor, textColorOn, titleCase } from "@/lib/palette";

const EMPTY_SNAPSHOT: CustomerDisplaySnapshot = {
  status: "idle",
  employeeName: null,
  items: [],
  itemCount: 0,
  total: 0,
  updatedAt: new Date(0).toISOString(),
};

function formatMoney(value: number) {
  return `${Number(value || 0).toFixed(2)} €`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return "--:--";
  return date.toLocaleTimeString("ca-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CustomerDisplayPage() {
  const [snapshot, setSnapshot] = useState<CustomerDisplaySnapshot>(EMPTY_SNAPSHOT);

  useEffect(() => {
    setSnapshot(readCustomerDisplaySnapshot() ?? EMPTY_SNAPSHOT);
    const unsubscribe = subscribeCustomerDisplay(setSnapshot);
    let cancelled = false;

    const loadRemoteSnapshot = async () => {
      try {
        const res = await fetch("/api/pos/customer-display", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as CustomerDisplaySnapshot;
        if (!cancelled) setSnapshot(next);
      } catch {
        // Same-profile localStorage/BroadcastChannel remains the fallback.
      }
    };

    void loadRemoteSnapshot();
    const interval = window.setInterval(loadRemoteSnapshot, 500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const hasItems = snapshot.items.length > 0;
  const statusLabel = useMemo(() => {
    if (!hasItems) return "Esperant comanda";
    if (snapshot.status === "checkout") return "Pagament en curs";
    return "Comanda en curs";
  }, [hasItems, snapshot.status]);

  return (
    <main className="flex h-screen overflow-hidden bg-[#f5f4ef] text-[#241f1c]">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[84px] shrink-0 items-center justify-between border-b border-[#ded6c8] bg-[#faf9f6] px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#d4cbbb] bg-white text-base font-black">
              HC
            </div>
            <div>
              <h1 className="text-[32px] font-semibold leading-none">
                Hi Cream
              </h1>
              <p className="mt-1 text-base font-medium text-[#6f665c]">
                {statusLabel}
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs font-semibold uppercase text-[#8a8176]">
              Total
            </p>
            <p className="text-[48px] font-semibold leading-none tabular-nums">
              {formatMoney(snapshot.total)}
            </p>
          </div>
        </header>

        {!hasItems ? (
          <div className="flex flex-1 items-center justify-center px-10 text-center">
            <div>
              <p className="text-[72px] font-semibold leading-none tracking-[-0.03em]">
                Benvingut
              </p>
              <p className="mx-auto mt-5 max-w-2xl text-[30px] font-medium leading-tight text-[#6f665c]">
                La teva comanda apareixerà aquí quan comencem a preparar-la.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_280px] gap-4 p-4">
            <div className="min-h-0 overflow-y-auto pr-1">
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
                {snapshot.items.map((item, index) => {
                  const color = resolveColor({ flavor: item.name, productColor: null });
                  const foreground = textColorOn(color);
                  return (
                    <article
                      key={item.lineId || `${item.name}-${index}`}
                      className="overflow-hidden rounded-xl border border-[#d7cebf] bg-white shadow-sm"
                    >
                      <div
                        className="flex min-h-[96px] flex-col justify-between p-3"
                        style={{ backgroundColor: color, color: foreground }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h2 className="line-clamp-2 text-[21px] font-semibold leading-[1.05]">
                            {titleCase(item.name)}
                          </h2>
                          <span className="rounded-full bg-black/12 px-2.5 py-1 text-[19px] font-semibold leading-none">
                            x{item.qty}
                          </span>
                        </div>
                        <p className="text-[23px] font-semibold tabular-nums">
                          {formatMoney(item.lineTotal)}
                        </p>
                      </div>

                      {(item.modifiers.length > 0 || item.note) && (
                        <div className="space-y-1.5 p-2">
                          {item.note && (
                            <p className="rounded-lg bg-[#fbf0cc] px-2 py-1 text-sm font-semibold text-[#8a6515]">
                              Nota: {item.note}
                            </p>
                          )}
                          {item.modifiers.map((modifier) => (
                            <div
                              key={modifier.lineId}
                              className="flex items-center justify-between gap-2 rounded-lg bg-[#f5f2ec] px-2 py-1.5"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-[15px] font-semibold text-[#3a322c]">
                                  + {titleCase(modifier.name)}
                                </p>
                                {modifier.note && (
                                  <p className="truncate text-xs font-medium text-[#8a6515]">
                                    {modifier.note}
                                  </p>
                                )}
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-sm font-semibold tabular-nums text-[#241f1c]">
                                  {modifier.qty > 1 ? `x${modifier.qty} ` : ""}
                                  {formatMoney(modifier.lineTotal)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>

            <aside className="flex min-h-0 flex-col rounded-2xl border border-[#d7cebf] bg-[#faf9f6] p-4 shadow-sm">
              <div className="border-b border-[#ded6c8] pb-3">
                <p className="text-xs font-semibold uppercase text-[#8a8176]">
                  Resum
                </p>
                <p className="mt-1 text-[28px] font-semibold leading-none">
                  {snapshot.itemCount} producte{snapshot.itemCount === 1 ? "" : "s"}
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto py-2">
                {snapshot.items.map((item) => (
                  <div
                    key={`summary-${item.lineId}`}
                    className="flex items-start justify-between gap-2 border-b border-[#ebe4d8] py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold">
                        {item.qty}x {titleCase(item.name)}
                      </p>
                      {item.modifiers.length > 0 && (
                        <p className="mt-0.5 truncate text-xs font-medium text-[#6f665c]">
                          {item.modifiers.map((modifier) => titleCase(modifier.name)).join(", ")}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-base font-semibold tabular-nums">
                      {formatMoney(
                        item.lineTotal +
                          item.modifiers.reduce((sum, modifier) => sum + modifier.lineTotal, 0)
                      )}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl bg-[#241f1c] p-4 text-white">
                <div className="flex items-center justify-between">
                  <span className="text-xl font-semibold">Total</span>
                  <span className="text-[40px] font-semibold leading-none tabular-nums">
                    {formatMoney(snapshot.total)}
                  </span>
                </div>
                <p className="mt-3 text-xs font-medium text-white/65">
                  Actualitzat a les {formatTime(snapshot.updatedAt)}
                </p>
              </div>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
