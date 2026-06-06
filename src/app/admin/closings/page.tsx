"use client";

import { useEffect, useState } from "react";
import { CashClosing } from "@/types/pos";
import { printZReport } from "@/lib/bridge";

interface ClosingListRow {
  id: number;
  z_number: number | null;
  z_label: string | null;
  opened_at: string;
  closed_at: string;
  total_cash: number;
  total_card: number;
  total_sales: number;
  supplier_payments_total: number;
  supplier_payments_count: number;
  expected_cash_after_supplier_payments: number;
  ticket_count: number;
  cancelled_count: number;
  first_invoice: string | null;
  last_invoice: string | null;
  employee_name: string | null;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AdminClosingsPage() {
  const [closings, setClosings] = useState<ClosingListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(currentMonth());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<CashClosing | null>(null);
  const [reprintingId, setReprintingId] = useState<number | null>(null);

  useEffect(() => {
    load();
  }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pos/cash-closings?month=${month}`);
      if (res.ok) setClosings(await res.json());
    } catch {
      // ignore
    }
    setLoading(false);
  };

  const handleExpand = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    try {
      const res = await fetch(`/api/pos/cash-closings/${id}`);
      if (res.ok) setDetail(await res.json());
    } catch {
      // ignore
    }
  };

  const handleReprint = async (closing: ClosingListRow) => {
    setReprintingId(closing.id);
    try {
      const res = await fetch(`/api/pos/cash-closings/${closing.id}`);
      if (res.ok) {
        const c: CashClosing = await res.json();
        await printZReport(c);
      }
    } catch {
      // ignore
    }
    setReprintingId(null);
  };

  const today = new Date().toISOString().split("T")[0];
  const hasTodayZ = closings.some(
    (c) => c.closed_at.startsWith(today) && c.z_number !== null
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Tancaments Z</h1>
          <p className="text-sm text-gray-500">{closings.length} tancaments al mes</p>
        </div>
        <div className="flex gap-3">
          <a href="/pos" className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm font-medium">
            Tornar al POS
          </a>
          <a href="/admin/orders" className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm font-medium">
            Comandes
          </a>
          <a href="/admin/products" className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm font-medium">
            Productes
          </a>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={load}
            className="px-4 py-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-sm font-medium"
          >
            Actualitzar
          </button>
        </div>

        {!hasTodayZ && month === currentMonth() && (
          <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <strong>⚠ Avui encara no hi ha tancament Z.</strong> Fes-lo des del POS amb el botó &quot;Tancar caixa&quot; al final del dia.
          </div>
        )}

        {loading ? (
          <p className="text-gray-400 text-center py-12">Carregant...</p>
        ) : closings.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-xl">Cap tancament en aquest mes</p>
          </div>
        ) : (
          <div className="space-y-2">
            {closings.map((c) => (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleExpand(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleExpand(c.id);
                    }
                  }}
                  className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    {c.z_label ? (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-bold">
                        {c.z_label}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-lg text-xs">
                        Pre-Z
                      </span>
                    )}
                    <span className="text-sm text-gray-700 font-medium">
                      {new Date(c.closed_at).toLocaleString("ca-ES")}
                    </span>
                    {c.employee_name && (
                      <span className="text-sm text-gray-500">{c.employee_name}</span>
                    )}
                    <span className="text-xs text-gray-400">
                      {c.ticket_count} tickets
                      {c.cancelled_count > 0 && ` · ${c.cancelled_count} anul·lats`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-gray-800">
                      {Number(c.total_sales).toFixed(2)}€
                    </span>
                    {c.z_label && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReprint(c);
                        }}
                        disabled={reprintingId === c.id}
                        className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 text-xs font-semibold hover:bg-blue-100 disabled:opacity-50"
                      >
                        {reprintingId === c.id ? "Imprimint..." : "Re-imprimir"}
                      </button>
                    )}
                    <span className="text-gray-300">{expandedId === c.id ? "▲" : "▼"}</span>
                  </div>
                </div>

                {expandedId === c.id && (
                  <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
                    {!detail ? (
                      <p className="text-sm text-gray-400">Carregant detall...</p>
                    ) : (
                      <ClosingDetail closing={detail} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ClosingDetail({ closing }: { closing: CashClosing }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total" value={`${Number(closing.total_sales).toFixed(2)}€`} />
        <Stat label="Efectiu" value={`${Number(closing.total_cash).toFixed(2)}€`} sub={`${closing.cash_count} tickets`} />
        <Stat label="Targeta" value={`${Number(closing.total_card).toFixed(2)}€`} sub={`${closing.card_count} tickets`} />
        <Stat label="Tickets" value={String(closing.ticket_count)} />
      </div>

      {(closing.supplier_payments_count ?? 0) > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat
            label="Pagaments proveidors"
            value={`${Number(closing.supplier_payments_total || 0).toFixed(2)} EUR`}
            sub={`${closing.supplier_payments_count} operacions`}
          />
          <Stat
            label="Efectiu esperat"
            value={`${Number(closing.expected_cash_after_supplier_payments || 0).toFixed(2)} EUR`}
            sub="Efectiu - pagaments"
          />
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="Base imposable" value={`${Number(closing.total_base).toFixed(2)}€`} />
        <Stat label="Total IVA" value={`${Number(closing.total_vat).toFixed(2)}€`} />
        {closing.cancelled_count > 0 && (
          <Stat
            label="Anul·lacions"
            value={String(closing.cancelled_count)}
            sub={`${Number(closing.total_refunded).toFixed(2)}€ retornats`}
          />
        )}
      </div>

      {(closing.first_invoice || closing.last_invoice) && (
        <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-600">
          <strong>Rang de factures:</strong> {closing.first_invoice || "—"} → {closing.last_invoice || "—"}
        </div>
      )}

      {closing.vat_breakdown && Object.keys(closing.vat_breakdown).length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 mb-1">Desglossament IVA</h4>
          <table className="w-full bg-white border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-100 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Tipus</th>
                <th className="text-right px-3 py-2">Base</th>
                <th className="text-right px-3 py-2">IVA</th>
                <th className="text-right px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(closing.vat_breakdown).map(([rate, e]) => (
                <tr key={rate} className="border-t border-gray-100">
                  <td className="px-3 py-1.5">IVA {rate}%</td>
                  <td className="text-right px-3 py-1.5">{Number(e.base).toFixed(2)}€</td>
                  <td className="text-right px-3 py-1.5">{Number(e.vat).toFixed(2)}€</td>
                  <td className="text-right px-3 py-1.5 font-medium">{Number(e.total).toFixed(2)}€</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {closing.notes && (
        <div className="px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
          <strong>Notes:</strong> {closing.notes}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-base font-bold text-gray-800">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
