"use client";

import { ParkedTicket } from "@/types/pos";
import { titleCase } from "@/lib/palette";

interface ParkedTicketsModalProps {
  tickets: ParkedTicket[];
  currentCartHasItems: boolean;
  onRecover: (ticket: ParkedTicket) => void;
  onDelete: (ticketId: string) => void;
  onClose: () => void;
}

export default function ParkedTicketsModal({
  tickets,
  currentCartHasItems,
  onRecover,
  onDelete,
  onClose,
}: ParkedTicketsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10131b]/68 p-3">
      <div className="mx-4 flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#ddd4c4] bg-[#faf9f6] text-[#241f1c] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#ddd4c4] px-6 py-4">
          <div>
            <h3 className="text-2xl font-medium text-[#241f1c]">Tickets aparcats</h3>
            <p className="mt-1 text-sm font-medium text-[#6f665c]">
              {tickets.length === 0
                ? "No hi ha cap ticket aparcat."
                : `${tickets.length} ticket${tickets.length === 1 ? "" : "s"} pendents avui`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d4cbbb] bg-white text-2xl text-[#6f665c] active:bg-[#f1eee7]"
          >
            &#10005;
          </button>
        </div>

        {currentCartHasItems && tickets.length > 0 && (
          <div className="border-b border-[#ead9bb] bg-[#fff7e6] px-6 py-3 text-sm font-medium text-[#7a5a14]">
            Tens una comanda actual oberta. En recuperar un ticket, el POS et preguntara que vols fer.
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {tickets.length === 0 ? (
            <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-[#d4cbbb] bg-white text-center text-[#7b7469]">
              <p className="text-base font-medium">
                Quan aparquis una comanda,
                <br />
                apareixera aqui per recuperar-la.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <article
                  key={ticket.id}
                  className="rounded-2xl border border-[#ddd4c4] bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#f1eee7] px-3 py-1 text-sm font-semibold text-[#5f6878]">
                          {formatTime(ticket.created_at)}
                        </span>
                        <span className="rounded-full bg-[#dff5e6] px-3 py-1 text-sm font-semibold text-[#1e6b3a]">
                          {ticket.item_count} producte{ticket.item_count === 1 ? "" : "s"}
                        </span>
                        {ticket.employee_name && (
                          <span className="rounded-full bg-[#e4f0fb] px-3 py-1 text-sm font-semibold text-[#275a8f]">
                            {ticket.employee_name}
                          </span>
                        )}
                      </div>
                      <p className="mt-3 line-clamp-2 text-lg font-medium leading-6 text-[#241f1c]">
                        {titleCase(ticket.summary)}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col gap-3 md:w-[230px]">
                      <p className="text-right text-3xl font-semibold tabular-nums text-[#241f1c]">
                        {ticket.total.toFixed(2)} &euro;
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => onRecover(ticket)}
                          className="rounded-xl bg-[#2e9e5b] px-4 py-3 text-sm font-semibold text-white active:bg-[#27874e]"
                        >
                          Recuperar
                        </button>
                        <button
                          onClick={() => onDelete(ticket.id)}
                          className="rounded-xl bg-[#fdeceb] px-4 py-3 text-sm font-semibold text-[#c4423a] active:bg-[#fad6d3]"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[#ddd4c4] bg-[#f5f4ef] p-5">
          <button
            onClick={onClose}
            className="w-full rounded-xl border border-[#d4cbbb] bg-white py-3 text-base font-medium text-[#6f665c] active:bg-[#f1eee7]"
          >
            Seguir
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("ca-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
