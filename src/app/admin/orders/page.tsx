"use client";

import { useEffect, useState } from "react";
import { Order } from "@/types/pos";

const CANCEL_REASONS = [
  { value: "client", label: "Petició del client" },
  { value: "error", label: "Error en la comanda" },
  { value: "duplicate", label: "Comanda duplicada" },
  { value: "payment", label: "Problema amb el pagament" },
  { value: "other", label: "Altre motiu" },
];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "cash" | "card">("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [dateFilter, setDateFilter] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("client");
  const [cancelNotes, setCancelNotes] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const res = await fetch("/api/pos/orders");
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch {
      // API not available
    }
    setLoading(false);
  };

  const handleCancel = async () => {
    if (!cancellingId) return;
    setCancelLoading(true);
    const reason = CANCEL_REASONS.find((r) => r.value === cancelReason)?.label || cancelReason;
    const fullReason = cancelNotes ? `${reason}: ${cancelNotes}` : reason;
    try {
      const res = await fetch(`/api/pos/orders/${cancellingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: fullReason }),
      });
      if (res.ok) {
        const updated = await res.json();
        setOrders((prev) =>
          prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o))
        );
      }
    } catch {
      // Error cancelling
    }
    setCancelLoading(false);
    setCancellingId(null);
    setCancelReason("client");
    setCancelNotes("");
  };

  const filtered = orders.filter((o) => {
    if (filter !== "all" && o.payment_method !== filter) return false;
    if (dateFilter) {
      const orderDate = new Date(o.created_at).toISOString().split("T")[0];
      if (orderDate !== dateFilter) return false;
    }
    return true;
  });

  const activeOrders = filtered.filter((o) => o.status !== "cancelled");
  const totalCash = activeOrders
    .filter((o) => o.payment_method === "cash")
    .reduce((s, o) => s + Number(o.total), 0);
  const totalCard = activeOrders
    .filter((o) => o.payment_method === "card")
    .reduce((s, o) => s + Number(o.total), 0);
  const totalAll = totalCash + totalCard;
  const cancelledCount = filtered.filter((o) => o.status === "cancelled").length;

  // Group by hour
  const byHour = new Map<number, { count: number; total: number }>();
  for (const o of filtered) {
    const h = new Date(o.created_at).getHours();
    const prev = byHour.get(h) || { count: 0, total: 0 };
    byHour.set(h, { count: prev.count + 1, total: prev.total + Number(o.total) });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <p className="text-gray-400 text-xl">Carregant comandes...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Comandes</h1>
          <p className="text-sm text-gray-500">
            {activeOrders.length} comandes &middot; {totalAll.toFixed(2)}€ total
            {cancelledCount > 0 && (
              <span className="text-red-500 ml-2">({cancelledCount} anul·lades)</span>
            )}
          </p>
        </div>
        <div className="flex gap-3">
          <a
            href="/pos"
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm font-medium"
          >
            Tornar al POS
          </a>
          <a
            href="/admin/products"
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm font-medium"
          >
            Productes
          </a>
          <a
            href="/admin/employees"
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm font-medium"
          >
            Empleats
          </a>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6 items-center">
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />

          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(["all", "cash", "card"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  filter === f
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {f === "all" ? "Tot" : f === "cash" ? "Efectiu" : "Targeta"}
              </button>
            ))}
          </div>

          <button
            onClick={loadOrders}
            className="px-4 py-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-sm font-medium"
          >
            Actualitzar
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Total</p>
            <p className="text-2xl font-bold text-gray-800">{totalAll.toFixed(2)}€</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-green-600">Efectiu</p>
            <p className="text-2xl font-bold text-green-700">{totalCash.toFixed(2)}€</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-blue-600">Targeta</p>
            <p className="text-2xl font-bold text-blue-700">{totalCard.toFixed(2)}€</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Ticket mig</p>
            <p className="text-2xl font-bold text-gray-800">
              {activeOrders.length > 0 ? (totalAll / activeOrders.length).toFixed(2) : "0.00"}€
            </p>
          </div>
        </div>

        {/* Hourly breakdown */}
        {byHour.size > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-600 mb-3">Vendes per hora</h3>
            <div className="flex gap-1 items-end h-24">
              {Array.from({ length: 24 }, (_, h) => {
                const data = byHour.get(h);
                const maxTotal = Math.max(...Array.from(byHour.values()).map((v) => v.total), 1);
                const height = data ? (data.total / maxTotal) * 100 : 0;
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end justify-center" style={{ height: "80px" }}>
                      {height > 0 && (
                        <div
                          className="w-full max-w-[24px] bg-pink-400 rounded-t transition-all"
                          style={{ height: `${height}%` }}
                          title={`${h}:00 — ${data?.count} comandes, ${data?.total.toFixed(2)}€`}
                        />
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400">{h}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Orders list */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-xl">Cap comanda</p>
            <p className="text-sm mt-1">No hi ha comandes per aquest dia/filtre</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((order) => (
              <div
                key={order.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                {/* Order header — tap to expand */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setExpandedId(expandedId === order.id ? null : order.id)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedId(expandedId === order.id ? null : order.id);
                    }
                  }}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-lg font-bold text-gray-800">
                      {order.order_number}
                    </span>
                    {order.table_number && (
                      <span className="px-2 py-0.5 bg-pink-100 text-pink-600 rounded-lg text-sm font-semibold">
                        Taula {order.table_number}
                      </span>
                    )}
                    <span className="text-sm text-gray-400">
                      {new Date(order.created_at).toLocaleTimeString("ca-ES", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        order.status === "cancelled"
                          ? "bg-red-100 text-red-700"
                          : order.status === "completed"
                          ? "bg-green-100 text-green-700"
                          : order.status === "ready"
                          ? "bg-blue-100 text-blue-700"
                          : order.status === "preparing"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {order.status === "cancelled"
                        ? "Anul·lat"
                        : order.status === "completed"
                        ? "Completat"
                        : order.status === "ready"
                        ? "Llest"
                        : order.status === "preparing"
                        ? "Preparant"
                        : "Pendent"}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <span
                      className={`text-sm font-medium ${
                        order.payment_method === "cash"
                          ? "text-green-600"
                          : order.payment_method === "card"
                          ? "text-blue-600"
                          : "text-amber-600"
                      }`}
                    >
                      {order.payment_method === "cash" ? "Efectiu" : order.payment_method === "card" ? "Targeta" : "Manual"}
                    </span>
                    <span className={`text-lg font-bold ${order.status === "cancelled" ? "text-gray-400 line-through" : "text-gray-800"}`}>
                      {Number(order.total).toFixed(2)}€
                    </span>
                    {order.status !== "cancelled" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCancellingId(order.id);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors"
                      >
                        Anul·lar
                      </button>
                    )}
                    <span className="text-gray-300">
                      {expandedId === order.id ? "▲" : "▼"}
                    </span>
                  </div>
                </div>

                {/* Expanded detail */}
                {expandedId === order.id && (
                  <div className="border-t border-gray-100 px-5 py-3 bg-gray-50">
                    {order.status === "cancelled" && order.cancellation_reason && (
                      <div className="mb-3 px-3 py-2 bg-red-50 rounded-lg border border-red-100">
                        <p className="text-sm text-red-700">
                          <span className="font-semibold">Motiu:</span> {order.cancellation_reason}
                        </p>
                        {order.cancelled_at && (
                          <p className="text-xs text-red-500 mt-0.5">
                            Anul·lat el {new Date(order.cancelled_at).toLocaleString("ca-ES")}
                          </p>
                        )}
                      </div>
                    )}
                    {order.invoice_number && (
                      <p className="text-xs text-gray-500 mb-2">Factura: {order.invoice_number}</p>
                    )}
                    {order.items && (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="text-left font-medium py-1">Producte</th>
                            <th className="text-center font-medium py-1 w-16">Qty</th>
                            <th className="text-right font-medium py-1 w-20">Preu</th>
                            <th className="text-right font-medium py-1 w-24">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {order.items.map((item) => (
                            <tr key={item.id} className="border-t border-gray-100">
                              <td className="py-1.5 text-gray-800">
                                {item.product_name}
                                {item.notes && (
                                  <span className="ml-2 text-xs text-orange-500">
                                    {item.notes}
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 text-center text-gray-600">
                                {item.qty}
                              </td>
                              <td className="py-1.5 text-right text-gray-600">
                                {Number(item.unit_price).toFixed(2)}€
                              </td>
                              <td className="py-1.5 text-right font-medium text-gray-800">
                                {(Number(item.unit_price) * item.qty).toFixed(2)}€
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cancel confirmation modal */}
      {cancellingId !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h3 className="text-xl font-bold text-gray-800 mb-1">Anul·lar comanda</h3>
            <p className="text-sm text-gray-500 mb-4">
              Comanda {orders.find((o) => o.id === cancellingId)?.order_number}
              {orders.find((o) => o.id === cancellingId)?.invoice_number && (
                <span className="block text-xs text-gray-400">
                  Factura: {orders.find((o) => o.id === cancellingId)?.invoice_number}
                </span>
              )}
            </p>

            {orders.find((o) => o.id === cancellingId)?.status === "completed" && (
              <div className="mb-4 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <strong>⚠ Atenció:</strong> Aquesta comanda ja està completada i té factura emesa. L&apos;anul·lació quedarà registrada però no s&apos;esborra la factura.
              </div>
            )}

            <label className="block text-sm font-medium text-gray-700 mb-1">Motiu</label>
            <select
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3 text-sm"
            >
              {CANCEL_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>

            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (opcional)</label>
            <textarea
              value={cancelNotes}
              onChange={(e) => setCancelNotes(e.target.value)}
              placeholder="Detalls addicionals..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 text-sm h-20 resize-none"
            />

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setCancellingId(null);
                  setCancelReason("client");
                  setCancelNotes("");
                }}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold transition-colors text-sm"
              >
                Tornar
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelLoading}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold transition-colors text-sm disabled:opacity-50"
              >
                {cancelLoading ? "Anul·lant..." : "Confirmar anul·lació"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
