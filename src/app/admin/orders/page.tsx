"use client";

import { useEffect, useState } from "react";
import { Order } from "@/types/pos";
import { queryIngenicoTransaction, IngenicoResult } from "@/lib/bridge";

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
  const [refundCard, setRefundCard] = useState(true);
  const [preferRefund, setPreferRefund] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [queryingId, setQueryingId] = useState<number | null>(null);
  const [queryResults, setQueryResults] = useState<Map<number, IngenicoResult>>(new Map());

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
    const order = orders.find((o) => o.id === cancellingId);
    setCancelLoading(true);
    setCancelError(null);
    const reason = CANCEL_REASONS.find((r) => r.value === cancelReason)?.label || cancelReason;
    const fullReason = cancelNotes ? `${reason}: ${cancelNotes}` : reason;
    const shouldRefund =
      refundCard && order?.payment_method === "card" && !!order?.card_reference;
    try {
      const res = await fetch(`/api/pos/orders/${cancellingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: fullReason,
          refund_card: shouldRefund,
          prefer_refund: preferRefund,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setOrders((prev) =>
          prev.map((o) => (o.id === data.id ? { ...o, ...data } : o))
        );
        setCancellingId(null);
        setCancelReason("client");
        setCancelNotes("");
        setRefundCard(true);
        setPreferRefund(false);
      } else {
        setCancelError(data.error || "Error al anul·lar la comanda");
      }
    } catch {
      setCancelError("Error de connexió al anul·lar la comanda");
    }
    setCancelLoading(false);
  };

  const handleQuery = async (order: Order) => {
    if (!order.card_reference) return;
    setQueryingId(order.id);
    const result = await queryIngenicoTransaction(
      order.card_reference,
      String(order.order_number || order.id)
    );
    setQueryResults((prev) => {
      const next = new Map(prev);
      next.set(order.id, result);
      return next;
    });
    setQueryingId(null);
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
          <a
            href="/admin/closings"
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-sm font-medium"
          >
            Tancaments
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
                        {order.refund_reference && (
                          <p className="text-xs text-red-600 mt-1">
                            <span className="font-semibold">↩ Tornat al datàfon:</span> ref {order.refund_reference}
                            {order.refund_at && ` el ${new Date(order.refund_at).toLocaleString("ca-ES")}`}
                          </p>
                        )}
                      </div>
                    )}
                    {order.invoice_number && (
                      <p className="text-xs text-gray-500 mb-2">Factura: {order.invoice_number}</p>
                    )}
                    {order.payment_method === "card" && order.card_reference && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <p className="text-xs text-gray-400">
                            Targeta — ref {order.card_reference}
                            {order.card_authorization && ` · auth ${order.card_authorization}`}
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuery(order);
                            }}
                            disabled={queryingId === order.id}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 text-xs font-semibold hover:bg-blue-100 disabled:opacity-50 transition-colors"
                          >
                            {queryingId === order.id ? "Consultant..." : "Consultar al datàfon"}
                          </button>
                        </div>
                        {queryResults.has(order.id) && (() => {
                          const q = queryResults.get(order.id)!;
                          // Detect mismatch: REDSYS approved a charge but our local order is pending/cancelled.
                          const localStatus = order.status;
                          const localApproved = localStatus === "completed" || localStatus === "ready" || localStatus === "preparing";
                          const localCancelled = localStatus === "cancelled";
                          let mismatch: string | null = null;
                          if (q.success && localCancelled) {
                            mismatch = "REDSYS dóna la transacció com aprovada però la comanda local està anul·lada. Pot ser una anul·lació pendent al datàfon — revisa-ho manualment.";
                          } else if (!q.success && localApproved && !localCancelled) {
                            mismatch = "REDSYS NO confirma la transacció però la comanda local consta com cobrada. Verifica si realment es va fer el cobrament.";
                          }
                          return (
                            <div
                              className={`mt-2 p-3 rounded-lg border text-xs ${
                                q.success
                                  ? "bg-green-50 border-green-200"
                                  : "bg-red-50 border-red-200"
                              }`}
                            >
                              <p className={`font-semibold ${q.success ? "text-green-800" : "text-red-800"}`}>
                                {q.success ? "✓ Aprovada al datàfon" : "✗ No aprovada / no trobada"}
                              </p>
                              <div className={`mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 ${q.success ? "text-green-700" : "text-red-700"}`}>
                                {q.responseCode && <p>Codi: {q.responseCode}</p>}
                                {q.authorizationCode && <p>Auth: {q.authorizationCode}</p>}
                                {q.reference && <p className="col-span-2">Ref: {q.reference}</p>}
                                {q.result && <p className="col-span-2">{q.result}</p>}
                                {q.error && <p className="col-span-2">Error: {q.error}</p>}
                              </div>
                              {mismatch && (
                                <p className="mt-2 px-2 py-1.5 bg-amber-100 border border-amber-300 rounded text-amber-900 font-medium">
                                  ⚠ {mismatch}
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
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
      {cancellingId !== null && (() => {
        const cancellingOrder = orders.find((o) => o.id === cancellingId);
        const isCard = cancellingOrder?.payment_method === "card";
        const hasCardRef = !!cancellingOrder?.card_reference;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
              <h3 className="text-xl font-bold text-gray-800 mb-1">Anul·lar comanda</h3>
              <p className="text-sm text-gray-500 mb-4">
                Comanda {cancellingOrder?.order_number}
                {cancellingOrder?.invoice_number && (
                  <span className="block text-xs text-gray-400">
                    Factura: {cancellingOrder?.invoice_number}
                  </span>
                )}
                {isCard && hasCardRef && (
                  <span className="block text-xs text-gray-400">
                    Targeta — ref {cancellingOrder?.card_reference}
                  </span>
                )}
              </p>

              {cancellingOrder?.status === "completed" && (
                <div className="mb-4 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <strong>⚠ Atenció:</strong> Aquesta comanda ja està completada i té factura emesa. L&apos;anul·lació quedarà registrada però no s&apos;esborra la factura.
                </div>
              )}

              {isCard && !hasCardRef && (
                <div className="mb-4 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
                  Aquesta comanda no té referència de targeta guardada (es va cobrar abans d&apos;activar el seguiment), per això no es pot tornar diners automàticament al datàfon.
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

              {isCard && hasCardRef && (
                <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={refundCard}
                      onChange={(e) => setRefundCard(e.target.checked)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-semibold text-blue-900">
                        Tornar diners al datàfon
                      </span>
                      <p className="text-xs text-blue-700 mt-0.5">
                        El client haurà de tornar a passar la targeta. S&apos;intentarà
                        primer una anul·lació (gratuïta, mateix dia) i si no, una devolució.
                      </p>
                    </div>
                  </label>
                  {refundCard && (
                    <label className="flex items-center gap-2 mt-2 ml-6 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferRefund}
                        onChange={(e) => setPreferRefund(e.target.checked)}
                      />
                      <span className="text-xs text-blue-700">
                        Forçar devolució (la venda ja està liquidada / no és del mateix dia)
                      </span>
                    </label>
                  )}
                </div>
              )}

              {cancelError && (
                <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {cancelError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setCancellingId(null);
                    setCancelReason("client");
                    setCancelNotes("");
                    setRefundCard(true);
                    setPreferRefund(false);
                    setCancelError(null);
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
                  {cancelLoading
                    ? (isCard && refundCard && hasCardRef ? "Tornant al datàfon..." : "Anul·lant...")
                    : "Confirmar anul·lació"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
