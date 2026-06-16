"use client";

import { useMemo, useState } from "react";
import { ParkedTicket } from "@/types/pos";
import {
  getModifierDisplayName,
  getVisibleItemNote,
  groupItemsWithModifiers,
} from "@/lib/item-grouping";
import { titleCase } from "@/lib/palette";

export type SplitSelection = Record<string, number>;

interface SplitParkedTicketModalProps {
  ticket: ParkedTicket;
  onCancel: () => void;
  onConfirm: (ticket: ParkedTicket, selection: SplitSelection) => void;
}

export default function SplitParkedTicketModal({
  ticket,
  onCancel,
  onConfirm,
}: SplitParkedTicketModalProps) {
  const groupedItems = useMemo(
    () =>
      groupItemsWithModifiers(
        ticket.items,
        (item) => item.name,
        (item) => item.notes
      ),
    [ticket.items]
  );
  const [selection, setSelection] = useState<SplitSelection>({});

  const selectedTotal = useMemo(() => {
    return Math.round(
      groupedItems.reduce((sum, group) => {
        if (group.isOrphanModifier) return sum;
        const selectedQty = selection[group.base.line_id] || 0;
        if (selectedQty <= 0) return sum;
        const baseQty = Math.max(1, Number(group.base.qty || 1));
        const baseTotal = selectedQty * Number(group.base.price || 0);
        const modifiersTotal = group.modifiers.reduce((modSum, modifier) => {
          const modifierQty = selectedModifierQty(baseQty, selectedQty, Number(modifier.qty || 0));
          return modSum + modifierQty * Number(modifier.price || 0);
        }, 0);
        return sum + baseTotal + modifiersTotal;
      }, 0) * 100
    ) / 100;
  }, [groupedItems, selection]);

  const selectedLines = Object.values(selection).reduce((sum, qty) => sum + qty, 0);

  const setQty = (lineId: string, qty: number, max: number) => {
    const nextQty = Math.max(0, Math.min(max, qty));
    setSelection((current) => {
      const next = { ...current };
      if (nextQty <= 0) delete next[lineId];
      else next[lineId] = nextQty;
      return next;
    });
  };

  const selectAll = () => {
    const next: SplitSelection = {};
    for (const group of groupedItems) {
      if (!group.isOrphanModifier) {
        next[group.base.line_id] = Number(group.base.qty || 0);
      }
    }
    setSelection(next);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#10131b]/72 p-3">
      <div className="mx-4 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#ddd4c4] bg-[#faf9f6] text-[#241f1c] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#ddd4c4] px-6 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8f8679]">
              Cobrar separat
            </p>
            <h3 className="mt-1 text-2xl font-medium text-[#241f1c]">
              {ticket.order_number ? `Ticket ${ticket.order_number}` : "Ticket aparcat"}
            </h3>
            <p className="mt-1 text-sm font-medium text-[#6f665c]">
              Tria els productes que paga aquesta persona. Els complements van sempre amb el seu producte.
            </p>
          </div>
          <button
            onClick={onCancel}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d4cbbb] bg-white text-2xl text-[#6f665c] active:bg-[#f1eee7]"
          >
            &#10005;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-3">
            {groupedItems.map((group) => {
              const base = group.base;
              const maxQty = Math.max(0, Number(base.qty || 0));
              const qty = selection[base.line_id] || 0;
              const disabled = Boolean(group.isOrphanModifier);
              return (
                <article
                  key={base.line_id}
                  className={`rounded-2xl border p-4 shadow-sm ${
                    qty > 0
                      ? "border-[#2e9e5b] bg-[#effaf2]"
                      : disabled
                        ? "border-[#ead9bb] bg-[#fff7e6]"
                        : "border-[#ddd4c4] bg-white"
                  }`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xl font-semibold text-[#241f1c]">
                          {titleCase(base.name)}
                        </p>
                        <span className="rounded-full bg-[#f1eee7] px-2.5 py-1 text-xs font-bold text-[#5f6878]">
                          {base.qty}x
                        </span>
                        <span className="rounded-full bg-[#e4f0fb] px-2.5 py-1 text-xs font-bold text-[#275a8f]">
                          {Number(base.price).toFixed(2)} €/u
                        </span>
                      </div>
                      {getVisibleItemNote(base.notes) && (
                        <p className="mt-1 text-sm font-medium text-[#7b7469]">
                          Nota: {getVisibleItemNote(base.notes)}
                        </p>
                      )}
                      {group.modifiers.length > 0 && (
                        <div className="mt-3 border-l-4 border-[#2f80ed] pl-3">
                          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#5f6878]">
                            Complements del producte
                          </p>
                          <div className="space-y-1">
                            {group.modifiers.map((modifier) => {
                              const displayedQty = qty > 0
                                ? selectedModifierQty(Math.max(1, maxQty), qty, Number(modifier.qty || 0))
                                : Number(modifier.qty || 0);
                              if (displayedQty <= 0) return null;
                              return (
                                <p key={modifier.line_id} className="text-sm font-medium text-[#3c3630]">
                                  + {displayedQty}x {titleCase(getModifierDisplayName(modifier.name, modifier.notes))}
                                  {Number(modifier.price) > 0 ? ` · ${Number(modifier.price).toFixed(2)} €/u` : ""}
                                </p>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {disabled && (
                        <p className="mt-2 rounded-xl bg-[#fff2cc] px-3 py-2 text-sm font-semibold text-[#8a5d00]">
                          Complement sense producte pare. No es pot cobrar sol.
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center justify-end gap-3">
                      <button
                        onClick={() => setQty(base.line_id, qty - 1, maxQty)}
                        disabled={disabled || qty <= 0}
                        className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#d4cbbb] bg-white text-2xl font-semibold text-[#6f665c] active:bg-[#f1eee7] disabled:opacity-40"
                      >
                        -
                      </button>
                      <div className="min-w-[84px] rounded-xl border border-[#d4cbbb] bg-white px-4 py-2 text-center">
                        <p className="text-xs font-bold uppercase text-[#8f8679]">Paga</p>
                        <p className="text-2xl font-semibold tabular-nums text-[#241f1c]">
                          {qty}/{maxQty}
                        </p>
                      </div>
                      <button
                        onClick={() => setQty(base.line_id, qty + 1, maxQty)}
                        disabled={disabled || qty >= maxQty}
                        className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2e9e5b] text-2xl font-semibold text-white active:bg-[#27874e] disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="border-t border-[#ddd4c4] bg-[#f5f4ef] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f8679]">
                Seleccio actual
              </p>
              <p className="text-3xl font-semibold tabular-nums text-[#241f1c]">
                {selectedTotal.toFixed(2)} €
              </p>
              <p className="text-sm font-medium text-[#6f665c]">
                {selectedLines} producte{selectedLines === 1 ? "" : "s"} seleccionat{selectedLines === 1 ? "" : "s"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 md:flex md:min-w-[440px]">
              <button
                onClick={() => setSelection({})}
                className="rounded-xl border border-[#d4cbbb] bg-white px-4 py-3 font-medium text-[#6f665c] active:bg-[#f1eee7]"
              >
                Netejar
              </button>
              <button
                onClick={selectAll}
                className="rounded-xl border border-[#d4cbbb] bg-white px-4 py-3 font-medium text-[#241f1c] active:bg-[#f1eee7]"
              >
                Tot
              </button>
              <button
                onClick={() => onConfirm(ticket, selection)}
                disabled={selectedTotal <= 0}
                className="col-span-2 rounded-xl bg-[#2e9e5b] px-6 py-3 font-semibold text-white active:bg-[#27874e] disabled:opacity-50 md:flex-1"
              >
                Cobrar seleccio
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function selectedModifierQty(baseQty: number, selectedBaseQty: number, modifierQty: number) {
  if (selectedBaseQty <= 0 || modifierQty <= 0) return 0;
  if (selectedBaseQty >= baseQty) return modifierQty;
  return Math.min(modifierQty, selectedBaseQty);
}
