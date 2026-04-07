"use client";

import { useEffect, useState } from "react";
import { printTicket } from "@/lib/bridge";

interface CashClosingData {
  since: string;
  total_cash: number;
  total_card: number;
  total_sales: number;
  ticket_count: number;
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
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetch(`/api/pos/cash-closing?employee_id=${employeeId}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
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

      // Print closing report (best effort)
      if (data) {
        await printTicket({
          orderNumber: "CIERRE DE CAJA",
          items: data.by_employee.map((e) => ({
            name: e.name,
            qty: e.tickets,
            price: e.total,
          })),
          total: data.total_sales,
          paymentMethod: `Efectivo: ${data.total_cash.toFixed(2)}€ / Tarjeta: ${data.total_card.toFixed(2)}€`,
          date: new Date().toLocaleString("es-ES"),
        });
      }

      onComplete();
    } catch {
      alert("Error al cerrar caja");
      setClosing(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-3xl p-8 w-full max-w-2xl">
          <p className="text-center text-gray-500">Cargando datos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto py-8">
      <div className="bg-white rounded-3xl p-8 w-full max-w-2xl mx-4 shadow-2xl">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">Cierre de caja</h2>
        <p className="text-sm text-gray-500 mb-6">
          Desde: {new Date(data.since).toLocaleString("es-ES")}
        </p>

        {/* Totals */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-green-50 rounded-xl p-4 text-center">
            <p className="text-sm text-green-600 font-medium">Efectivo</p>
            <p className="text-2xl font-bold text-green-700">
              {data.total_cash.toFixed(2)} &euro;
            </p>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            <p className="text-sm text-blue-600 font-medium">Tarjeta</p>
            <p className="text-2xl font-bold text-blue-700">
              {data.total_card.toFixed(2)} &euro;
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <p className="text-sm text-gray-600 font-medium">Total</p>
            <p className="text-2xl font-bold text-gray-800">
              {data.total_sales.toFixed(2)} &euro;
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-6 mb-6 text-center">
          <div>
            <p className="text-sm text-gray-500">Tickets</p>
            <p className="text-xl font-bold text-gray-800">{data.ticket_count}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Ticket medio</p>
            <p className="text-xl font-bold text-gray-800">
              {data.ticket_medio.toFixed(2)} &euro;
            </p>
          </div>
        </div>

        {/* By employee */}
        {data.by_employee.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Por empleado</h3>
            <div className="bg-gray-50 rounded-xl p-3 space-y-1">
              {data.by_employee.map((e) => (
                <div key={e.name} className="flex justify-between text-sm">
                  <span className="text-gray-700">{e.name} ({e.tickets} tickets)</span>
                  <span className="font-semibold">{e.total.toFixed(2)} &euro;</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top products */}
        {data.top_products.length > 0 && (
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
                  <span className="font-semibold">{p.revenue.toFixed(2)} &euro;</span>
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
            {closing ? "Cerrando..." : "Confirmar cierre"}
          </button>
        </div>
      </div>
    </div>
  );
}
