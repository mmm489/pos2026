"use client";

import { useEffect, useState } from "react";
import { printZReport } from "@/lib/bridge";
import type { CashClosing, VatBreakdown } from "@/types/pos";

interface CashClosingData {
  since: string;
  next_z_label: string;
  total_cash: number;
  total_card: number;
  total_sales: number;
  total_base: number;
  total_vat: number;
  vat_breakdown: VatBreakdown;
  ticket_count: number;
  cash_count: number;
  card_count: number;
  cancelled_count: number;
  total_refunded: number;
  supplier_payments_total: number;
  supplier_payments_count: number;
  expected_cash_after_supplier_payments: number;
  supplier_payments: {
    id: number;
    supplier_name: string;
    amount: number;
    reason: string | null;
    created_at: string;
  }[];
  first_invoice: string | null;
  last_invoice: string | null;
  ticket_medio: number;
  by_employee: { name: string; tickets: number; total: number }[];
  top_products: { name: string; qty: number; revenue: number }[];
}

interface CashClosingModalProps {
  employeeId: number;
  onClose: () => void;
  onComplete: () => void;
}

export default function CashClosingModal({
  employeeId,
  onClose,
  onComplete,
}: CashClosingModalProps) {
  const [data, setData] = useState<CashClosingData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetch(`/api/pos/cash-closing?employee_id=${employeeId}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({} as Record<string, unknown>));
        if (!r.ok || (body as { error?: string }).error) {
          setLoadError(
            (body as { error?: string }).error ||
              `No s'han pogut carregar les dades (HTTP ${r.status})`
          );
        } else {
          setData(body as CashClosingData);
        }
        setLoading(false);
      })
      .catch((err) => {
        setLoadError(err.message || "Error de connexió");
        setLoading(false);
      });
  }, [employeeId]);

  const handleClose = async () => {
    setClosing(true);
    try {
      const res = await fetch("/api/pos/cash-closing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: employeeId, notes }),
      });

      if (!res.ok) throw new Error("Error");

      // Print Z report from the persisted record (best effort).
      const created: CashClosing = await res.json();
      await printZReport(created).catch(() => {});

      onComplete();
    } catch {
      alert("Error al cerrar caja");
      setClosing(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-3xl p-8 w-full max-w-2xl">
          <p className="text-center text-gray-500">Carregant dades...</p>
        </div>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-3xl p-8 w-full max-w-md mx-4 shadow-2xl">
          <h2 className="text-xl font-bold text-gray-800 mb-2">No es pot tancar caixa</h2>
          <p className="text-sm text-gray-600 mb-4">
            {loadError || "Resposta inesperada del servidor."}
          </p>
          <p className="text-xs text-gray-500 mb-4">
            Si és la primera vegada, executa <code className="bg-gray-100 px-1">scripts/migrate-v4.sql</code> a la BD.
          </p>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold"
          >
            Tancar
          </button>
        </div>
      </div>
    );
  }

  // Defensive numeric coercion — server numbers may be strings (NUMERIC) or undefined.
  const n = (v: unknown): number => Number(v ?? 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto py-8">
      <div className="bg-white rounded-3xl p-8 w-full max-w-2xl mx-4 shadow-2xl">
        <div className="flex items-baseline gap-3 mb-1">
          <h2 className="text-2xl font-bold text-gray-800">Tancament Z</h2>
          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-bold">
            {data.next_z_label}
          </span>
        </div>
        <p className="text-sm text-gray-500 mb-1">
          Des de: {new Date(data.since).toLocaleString("es-ES")}
        </p>
        {(data.first_invoice || data.last_invoice) && (
          <p className="text-xs text-gray-400 mb-6">
            Factures: {data.first_invoice || "—"} → {data.last_invoice || "—"}
          </p>
        )}
        {!data.first_invoice && <div className="mb-6" />}

        {/* Totals */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-green-50 rounded-xl p-4 text-center">
            <p className="text-sm text-green-600 font-medium">Efectivo</p>
            <p className="text-2xl font-bold text-green-700">
              {n(data.total_cash).toFixed(2)} &euro;
            </p>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            <p className="text-sm text-blue-600 font-medium">Tarjeta</p>
            <p className="text-2xl font-bold text-blue-700">
              {n(data.total_card).toFixed(2)} &euro;
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <p className="text-sm text-gray-600 font-medium">Total</p>
            <p className="text-2xl font-bold text-gray-800">
              {n(data.total_sales).toFixed(2)} &euro;
            </p>
          </div>
        </div>

        {(data.supplier_payments_count ?? 0) > 0 && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-sm font-medium text-amber-700">Pagaments proveidors</p>
                <p className="text-2xl font-bold text-amber-800">
                  {n(data.supplier_payments_total).toFixed(2)} &euro;
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-amber-700">Operacions</p>
                <p className="text-2xl font-bold text-amber-800">
                  {data.supplier_payments_count}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-amber-700">Efectiu esperat</p>
                <p className="text-2xl font-bold text-amber-800">
                  {n(data.expected_cash_after_supplier_payments).toFixed(2)} &euro;
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              {data.supplier_payments.map((payment) => (
                <div key={payment.id} className="flex justify-between text-sm text-amber-900">
                  <span>{payment.supplier_name}{payment.reason ? ` - ${payment.reason}` : ""}</span>
                  <span className="font-semibold">{n(payment.amount).toFixed(2)} &euro;</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="flex gap-6 mb-6 text-center">
          <div>
            <p className="text-sm text-gray-500">Tickets</p>
            <p className="text-xl font-bold text-gray-800">{data.ticket_count ?? 0}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Ticket medio</p>
            <p className="text-xl font-bold text-gray-800">
              {n(data.ticket_medio).toFixed(2)} &euro;
            </p>
          </div>
          {(data.cancelled_count ?? 0) > 0 && (
            <div>
              <p className="text-sm text-red-500">Anul·lacions</p>
              <p className="text-xl font-bold text-red-600">
                {data.cancelled_count}
              </p>
              <p className="text-xs text-red-400">
                {n(data.total_refunded).toFixed(2)} &euro; tornats
              </p>
            </div>
          )}
        </div>

        {/* IVA breakdown */}
        {data.vat_breakdown && Object.keys(data.vat_breakdown).length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Desglossament IVA</h3>
            <table className="w-full bg-gray-50 rounded-xl overflow-hidden text-sm">
              <thead>
                <tr className="text-xs text-gray-500">
                  <th className="text-left px-3 py-2">Tipus</th>
                  <th className="text-right px-3 py-2">Base</th>
                  <th className="text-right px-3 py-2">IVA</th>
                  <th className="text-right px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.vat_breakdown).map(([rate, e]) => (
                  <tr key={rate} className="border-t border-gray-200">
                    <td className="px-3 py-1.5">IVA {rate}%</td>
                    <td className="text-right px-3 py-1.5">{n(e.base).toFixed(2)} €</td>
                    <td className="text-right px-3 py-1.5">{n(e.vat).toFixed(2)} €</td>
                    <td className="text-right px-3 py-1.5 font-medium">{n(e.total).toFixed(2)} €</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 bg-white font-semibold">
                  <td className="px-3 py-1.5">TOTAL</td>
                  <td className="text-right px-3 py-1.5">{n(data.total_base).toFixed(2)} €</td>
                  <td className="text-right px-3 py-1.5">{n(data.total_vat).toFixed(2)} €</td>
                  <td className="text-right px-3 py-1.5">{n(data.total_sales).toFixed(2)} €</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* By employee */}
        {(data.by_employee?.length ?? 0) > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Por empleado</h3>
            <div className="bg-gray-50 rounded-xl p-3 space-y-1">
              {data.by_employee.map((e) => (
                <div key={e.name} className="flex justify-between text-sm">
                  <span className="text-gray-700">{e.name} ({e.tickets} tickets)</span>
                  <span className="font-semibold">{n(e.total).toFixed(2)} &euro;</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top products */}
        {(data.top_products?.length ?? 0) > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">
              Productos más vendidos
            </h3>
            <div className="bg-gray-50 rounded-xl p-3 space-y-1 max-h-40 overflow-y-auto">
              {data.top_products.map((p) => (
                <div key={p.name} className="flex justify-between text-sm">
                  <span className="text-gray-700">
                    {p.qty}x {p.name}
                  </span>
                  <span className="font-semibold">{n(p.revenue).toFixed(2)} &euro;</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas del cierre (opcional)"
          className="w-full border border-gray-200 rounded-xl p-3 text-sm mb-6 resize-none h-20"
        />

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={closing}
            className="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleClose}
            disabled={closing}
            className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white font-bold transition-colors"
          >
            {closing ? "Tancant..." : `Confirmar tancament ${data.next_z_label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
