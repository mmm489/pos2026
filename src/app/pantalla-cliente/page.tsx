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
    return subscribeCustomerDisplay(setSnapshot);
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
        <header className="flex h-[108px] shrink-0 items-center justify-between border-b border-[#ded6c8] bg-[#faf9f6] px-10">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#d4cbbb] bg-white text-xl font-black">
              HC
            </div>
            <div>
              <h1 className="text-[44px] font-semibold leading-none tracking-[-0.01em]">
                Hi Cream
              </h1>
              <p className="mt-1 text-lg font-medium text-[#6f665c]">
                {statusLabel}
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8a8176]">
              Total
            </p>
            <p className="text-[64px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
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
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] gap-6 p-6">
            <div className="min-h-0 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                {snapshot.items.map((item, index) => {
                  const color = resolveColor({ flavor: item.name, productColor: null });
                  const foreground = textColorOn(color);
                  return (
                    <article
                      key={item.lineId || `${item.name}-${index}`}
                      className="overflow-hidden rounded-2xl border border-[#d7cebf] bg-white shadow-sm"
                    >
                      <div
                        className="flex min-h-[148px] flex-col justify-between p-5"
                        style={{ backgroundColor: color, color: foreground }}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <h2 className="text-[29px] font-semibold leading-[1.05] tracking-[-0.01em]">
                            {titleCase(item.name)}
                          </h2>
                          <span className="rounded-full bg-black/12 px-4 py-2 text-[28px] font-semibold leading-none">
                            x{item.qty}
                          </span>
                        </div>
                        <p className="text-[31px] font-semibold tabular-nums">
                          {formatMoney(item.lineTotal)}
                        </p>
                      </div>

                      {(item.modifiers.length > 0 || item.note) && (
                        <div className="space-y-2 p-4">
                          {item.note && (
                            <p className="rounded-xl bg-[#fbf0cc] px-3 py-2 text-base font-semibold text-[#8a6515]">
                              Nota: {item.note}
                            </p>
                          )}
                          {item.modifiers.map((modifier) => (
                            <div
                              key={modifier.lineId}
                              className="flex items-center justify-between gap-3 rounded-xl bg-[#f5f2ec] px-3 py-2"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-[20px] font-semibold text-[#3a322c]">
                                  + {titleCase(modifier.name)}
                                </p>
                                {modifier.note && (
                                  <p className="truncate text-sm font-medium text-[#8a6515]">
                                    {modifier.note}
                                  </p>
                                )}
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-lg font-semibold tabular-nums text-[#241f1c]">
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

            <aside className="flex min-h-0 flex-col rounded-3xl border border-[#d7cebf] bg-[#faf9f6] p-6 shadow-sm">
              <div className="border-b border-[#ded6c8] pb-5">
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8a8176]">
                  Resum
                </p>
                <p className="mt-2 text-[38px] font-semibold leading-none">
                  {snapshot.itemCount} producte{snapshot.itemCount === 1 ? "" : "s"}
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto py-4">
                {snapshot.items.map((item) => (
                  <div
                    key={`summary-${item.lineId}`}
                    className="flex items-start justify-between gap-3 border-b border-[#ebe4d8] py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold">
                        {item.qty}x {titleCase(item.name)}
                      </p>
                      {item.modifiers.length > 0 && (
                        <p className="mt-0.5 truncate text-sm font-medium text-[#6f665c]">
                          {item.modifiers.map((modifier) => titleCase(modifier.name)).join(", ")}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-lg font-semibold tabular-nums">
                      {formatMoney(
                        item.lineTotal +
                          item.modifiers.reduce((sum, modifier) => sum + modifier.lineTotal, 0)
                      )}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-3xl bg-[#241f1c] p-6 text-white">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-semibold">Total</span>
                  <span className="text-[52px] font-semibold leading-none tabular-nums">
                    {formatMoney(snapshot.total)}
                  </span>
                </div>
                <p className="mt-4 text-sm font-medium text-white/65">
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
