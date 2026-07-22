"use client";

import { useEffect, useState } from "react";
import { Order, Business, Employee, Refund } from "@/types/pos";
import { printCardReceipt, printKitchenTicket, printRectifyingTicket, printTicket, IngenicoResult } from "@/lib/bridge";
import RefundModal from "@/components/pos/RefundModal";

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
  const [reprintingReceipt, setReprintingReceipt] = useState<{ id: number; copy: "merchant" | "customer" } | null>(null);
  const [reprintingTicketId, setReprintingTicketId] = useState<number | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [refundingOrder, setRefundingOrder] = useState<Order | null>(null);
  const [refundAction, setRefundAction] = useState<{ id: number; action: string } | null>(null);
  const [incidents, setIncidents] = useState<Array<{
    id: number;
    order_number: string;
    total: number;
    card_payment_status: string;
    cashless_operation_id: string;
    card_payment_error?: string | null;
    created_at: string;
  }>>([]);

  useEffect(() => {
    loadOrders();
    fetch("/api/pos/business")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && setBusiness(b))
      .catch(() => {});
    try {
      const saved = localStorage.getItem("pos_employee");
      if (saved) setEmployee(JSON.parse(saved));
    } catch {}
    loadIncidents();
  }, []);

  const canLookup = employee?.role === "admin" || employee?.can_post_sale_lookup === true;
  const canRefund = employee?.role === "admin" || employee?.can_refund_sales === true;

  const loadIncidents = async () => {
    try {
      const response = await fetch("/api/pos/card-incidents");
      if (response.ok) setIncidents(await response.json());
    } catch {}
  };

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
    setCancelError(null);
    const reason = CANCEL_REASONS.find((r) => r.value === cancelReason)?.label || cancelReason;
    const fullReason = cancelNotes ? `${reason}: ${cancelNotes}` : reason;
    const shouldRefund = false;
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

  const handleReprintTicket = async (order: Order) => {
    if (!order.items || order.items.length === 0) return;
    setReprintingTicketId(order.id);
    const total = Number(order.total);
    const totalBase =
      order.total_base != null
        ? Number(order.total_base)
        : Math.round((total / 1.1) * 100) / 100;
    const totalVat =
      order.total_vat != null
        ? Number(order.total_vat)
        : Math.round((total - total / 1.1) * 100) / 100;
    const paymentLabel =
      order.payment_method === "cash"
        ? "Efectiu"
        : order.payment_method === "card"
        ? "Targeta"
        : "Manual";
    await printTicket({
      orderNumber: order.order_number,
      invoiceNumber: order.invoice_number,
      items: order.items.map((i) => ({
        name: i.product_name || "",
        qty: i.qty,
        price: Number(i.unit_price),
      })),
      total,
      totalBase,
      totalVat,
      vatRate: 10,
      paymentMethod: paymentLabel,
      date: new Date(order.created_at).toLocaleString("es-ES"),
      business: business || undefined,
      tableNumber: order.table_number || undefined,
      serviceType: order.service_type || "dine_in",
    }).catch(() => {});
    setReprintingTicketId(null);
  };

  const handleReprintReceipt = async (order: Order, copy: "merchant" | "customer") => {
    if (!order.card_receipt_text) return;
    setReprintingReceipt({ id: order.id, copy });
    await printCardReceipt(order.card_receipt_text, copy, order.order_number).catch(() => {});
    setReprintingReceipt(null);
  };

  const handleQuery = async (order: Order) => {
    if (!order.cashless_operation_id) return;
    setQueryingId(order.id);
    const response = await fetch(`/api/pos/orders/${order.id}/card-query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = await response.json();
    const result = (data.provider || { success: false, error: data.error }) as IngenicoResult;
    setQueryResults((prev) => {
      const next = new Map(prev);
      next.set(order.id, result);
      return next;
    });
    setQueryingId(null);
  };

  const handleIncident = async (incidentId: number, reconcile: boolean) => {
    setQueryingId(incidentId);
    const response = await fetch(`/api/pos/orders/${incidentId}/card-query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reconcile }),
    });
    const data = await response.json();
    if (!response.ok) window.alert(data.error || "No se ha podido comprobar el pago");
    else if (data.reconciled) {
      if (!data.reconciled.was_parked && Array.isArray(data.reconciled.items)) {
        const kitchenResult = await printKitchenTicket({
          orderNumber: data.reconciled.order_number,
          items: data.reconciled.items.map((item: NonNullable<Order["items"]>[number]) => ({
            name: item.product_name || "",
            qty: Number(item.qty),
            notes: item.notes || undefined,
          })),
          tableNumber: data.reconciled.table_number || undefined,
          serviceType: data.reconciled.service_type || "dine_in",
          date: new Date(data.reconciled.created_at).toLocaleString("es-ES"),
        });
        if (!kitchenResult.success) {
          window.alert(`Pago recuperado, pero cocina no ha impreso: ${kitchenResult.error || "error de impresora"}`);
        }
      }
      window.alert("Pago aprobado y comanda regularizada.");
      await Promise.all([loadOrders(), loadIncidents()]);
    } else {
      window.alert(data.provider?.success ? "Comercia confirma el pago. Puedes regularizarlo." : data.provider?.error || "Pago no confirmado.");
    }
    setQueryingId(null);
  };

  const loadFullRefund = async (orderId: number, refundId: number) => {
    const response = await fetch(`/api/pos/orders/${orderId}/refunds`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se ha podido cargar la devolucion");
    const refund = (data as Refund[]).find((entry) => Number(entry.id) === refundId);
    if (!refund) throw new Error("Devolucion no encontrada");
    return refund;
  };

  const handleRefundPrint = async (
    order: Order,
    refundId: number,
    action: "rectifying" | "customer" | "merchant",
  ) => {
    setRefundAction({ id: refundId, action });
    try {
      const refund = await loadFullRefund(order.id, refundId);
      if (action === "rectifying") {
        if (!refund.rectifying_invoice_number || !refund.items) throw new Error("La rectificativa aun no esta disponible");
        await printRectifyingTicket({
          refund: {
            rectifying_invoice_number: refund.rectifying_invoice_number,
            amount: Number(refund.amount),
            total_base: Number(refund.total_base),
            total_vat: Number(refund.total_vat),
            reason: refund.reason,
            items: refund.items.map((item) => ({
              product_name: item.product_name,
              qty: Number(item.qty),
              unit_price: Number(item.unit_price),
            })),
          },
          originalInvoiceNumber: order.invoice_number,
          orderNumber: order.order_number,
          date: new Date(refund.completed_at || refund.requested_at).toLocaleString("es-ES"),
          business: business || undefined,
        });
      } else {
        if (!refund.receipt_text) throw new Error("El justificante bancario no esta disponible");
        await printCardReceipt(
          refund.receipt_text,
          action,
          refund.rectifying_invoice_number || order.order_number,
        );
      }
    } catch (cause) {
      window.alert((cause as Error).message);
    } finally {
      setRefundAction(null);
    }
  };

  const handleRefundQuery = async (orderId: number, refundId: number) => {
    setRefundAction({ id: refundId, action: "query" });
    try {
      const response = await fetch(`/api/pos/refunds/${refundId}/query`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se ha podido comprobar la devolucion");
      window.alert(data.provider?.success ? "Comercia confirma la devolucion." : data.provider?.error || "La devolucion no consta aprobada.");
      await loadOrders();
    } catch (cause) {
      window.alert((cause as Error).message);
    } finally {
      setRefundAction(null);
    }
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
      <div className="flex h-screen items-center justify-center bg-[#f5f4ef]">
        <p className="text-xl font-medium text-[#7b7469]">Carregant comandes...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f4ef] text-[#241f1c]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[#ddd4c4] bg-[#faf9f6] px-6 py-4">
        <div>
          <h1 className="text-3xl font-medium text-[#241f1c]">Comandes</h1>
          <p className="text-sm font-medium text-[#7b7469]">
            {activeOrders.length} comandes &middot; {totalAll.toFixed(2)}€ total
            {cancelledCount > 0 && (
              <span className="ml-2 text-[#c4423a]">({cancelledCount} anul·lades)</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <a
            href="/pos"
            className="rounded-xl border border-[#d4cbbb] bg-white px-4 py-2 text-sm font-medium text-[#5f6878] active:bg-[#f1eee7]"
          >
            Tornar al POS
          </a>
          <a
            href="/admin/products"
            className="rounded-xl border border-[#d4cbbb] bg-white px-4 py-2 text-sm font-medium text-[#5f6878] active:bg-[#f1eee7]"
          >
            Productes
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-6xl p-6">
        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-xl border border-[#d4cbbb] bg-white px-3 py-2 text-sm text-[#241f1c] outline-none focus:border-[#2e9e5b] focus:ring-2 focus:ring-[#2e9e5b]/15"
          />

          <div className="flex gap-1 rounded-xl border border-[#ddd4c4] bg-[#f1eee7] p-1">
            {(["all", "cash", "card"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                  filter === f
                    ? "bg-white text-[#241f1c]"
                    : "text-[#6f665c] active:text-[#241f1c]"
                }`}
              >
                {f === "all" ? "Tot" : f === "cash" ? "Efectiu" : "Targeta"}
              </button>
            ))}
          </div>

          <button
            onClick={loadOrders}
            className="rounded-xl border border-[#bfd5ee] bg-[#e4f0fb] px-4 py-2 text-sm font-medium text-[#275a8f] active:bg-[#d4e7f8]"
          >
            Actualitzar
          </button>
        </div>

        {/* Summary cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-[#ddd4c4] bg-white p-4">
            <p className="text-sm font-medium text-[#6f665c]">Total</p>
            <p className="text-3xl font-semibold text-[#241f1c]">{totalAll.toFixed(2)}€</p>
          </div>
          <div className="rounded-2xl border border-[#b8dec2] bg-[#dff5e6] p-4">
            <p className="text-sm font-medium text-[#1e6b3a]">Efectiu</p>
            <p className="text-3xl font-semibold text-[#1e6b3a]">{totalCash.toFixed(2)}€</p>
          </div>
          <div className="rounded-2xl border border-[#bfd5ee] bg-[#e4f0fb] p-4">
            <p className="text-sm font-medium text-[#275a8f]">Targeta</p>
            <p className="text-3xl font-semibold text-[#275a8f]">{totalCard.toFixed(2)}€</p>
          </div>
          <div className="rounded-2xl border border-[#ddd4c4] bg-white p-4">
            <p className="text-sm font-medium text-[#6f665c]">Ticket mig</p>
            <p className="text-3xl font-semibold text-[#241f1c]">
              {activeOrders.length > 0 ? (totalAll / activeOrders.length).toFixed(2) : "0.00"}€
            </p>
          </div>
        </div>

        {canLookup && incidents.length > 0 && (
          <section className="mb-6 overflow-hidden rounded-2xl border border-[#ead39b] bg-[#fff8df]">
            <div className="border-b border-[#ead39b] px-4 py-3">
              <h2 className="font-semibold text-[#87620d]">Incidencias de tarjeta ({incidents.length})</h2>
              <p className="text-sm text-[#87620d]">Comprueba estas operaciones antes de volver a cobrar.</p>
            </div>
            <div className="divide-y divide-[#ead39b]">
              {incidents.map((incident) => (
                <div key={incident.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{incident.order_number} · {Number(incident.total).toFixed(2)} EUR</p>
                    <p className="truncate text-xs text-[#87620d]">{incident.card_payment_status} · {incident.cashless_operation_id}</p>
                  </div>
                  <button onClick={() => handleIncident(incident.id, false)} disabled={queryingId === incident.id} className="rounded-xl border border-[#d4cbbb] bg-white px-3 py-2 text-sm font-semibold">Comprobar</button>
                  {incident.card_payment_status !== "failed" && (
                    <button onClick={() => handleIncident(incident.id, true)} disabled={queryingId === incident.id} className="rounded-xl bg-[#2e9e5b] px-3 py-2 text-sm font-semibold text-white">Comprobar y regularizar</button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Hourly breakdown */}
        {byHour.size > 0 && (
          <div className="mb-6 rounded-2xl border border-[#ddd4c4] bg-white p-4">
            <h3 className="mb-3 text-sm font-medium text-[#6f665c]">Vendes per hora</h3>
            <div className="flex h-24 items-end gap-1">
              {Array.from({ length: 24 }, (_, h) => {
                const data = byHour.get(h);
                const maxTotal = Math.max(...Array.from(byHour.values()).map((v) => v.total), 1);
                const height = data ? (data.total / maxTotal) * 100 : 0;
                return (
                  <div key={h} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full items-end justify-center" style={{ height: "80px" }}>
                      {height > 0 && (
                        <div
                          className="w-full max-w-[24px] rounded-t bg-[#2e9e5b] transition-all"
                          style={{ height: `${height}%` }}
                          title={`${h}:00 — ${data?.count} comandes, ${data?.total.toFixed(2)}€`}
                        />
                      )}
                    </div>
                    <span className="text-[10px] text-[#8a8276]">{h}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Orders list */}
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-[#7b7469]">
            <p className="text-xl font-medium">Cap comanda</p>
            <p className="mt-1 text-sm">No hi ha comandes per aquest dia/filtre</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((order) => (
              <div
                key={order.id}
                className="overflow-hidden rounded-2xl border border-[#ddd4c4] bg-white"
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
                  className="flex w-full cursor-pointer items-center justify-between px-5 py-3 text-left transition-colors active:bg-[#f1eee7]"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-lg font-semibold text-[#241f1c]">
                      {order.order_number}
                    </span>
                    {order.table_number && (
                      <span className="rounded-full bg-[#fbf0cc] px-2 py-0.5 text-sm font-medium text-[#87620d]">
                        Taula {order.table_number}
                      </span>
                    )}
                    <span className="text-sm text-[#8a8276]">
                      {new Date(order.created_at).toLocaleTimeString("ca-ES", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        order.status === "cancelled"
                          ? "bg-[#fdeceb] text-[#c4423a]"
                        : order.status === "completed"
                        ? "bg-[#dff5e6] text-[#1e6b3a]"
                        : order.status === "ready"
                        ? "bg-[#e4f0fb] text-[#275a8f]"
                        : order.status === "preparing"
                        ? "bg-[#fbf0cc] text-[#87620d]"
                        : "bg-[#f1eee7] text-[#6f665c]"
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
                          ? "text-[#1e6b3a]"
                          : order.payment_method === "card"
                          ? "text-[#275a8f]"
                          : "text-[#87620d]"
                      }`}
                    >
                      {order.payment_method === "cash" ? "Efectiu" : order.payment_method === "card" ? "Targeta" : "Manual"}
                    </span>
                    <span className={`text-lg font-semibold ${order.status === "cancelled" ? "text-[#8a8276] line-through" : "text-[#241f1c]"}`}>
                      {Number(order.total).toFixed(2)}€
                    </span>
                    {order.status !== "cancelled" && !order.invoice_number && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCancellingId(order.id);
                        }}
                        className="rounded-xl bg-[#fdeceb] px-2.5 py-1 text-xs font-medium text-[#c4423a] transition-colors active:bg-[#fad6d3]"
                      >
                        Anul·lar comanda
                      </button>
                    )}
                    <span className="text-[#8a8276]">
                      {expandedId === order.id ? "▲" : "▼"}
                    </span>
                  </div>
                </div>

                {/* Expanded detail */}
                {expandedId === order.id && (
                  <div className="border-t border-[#eee4d6] bg-[#faf9f6] px-5 py-3">
                    {order.status === "cancelled" && order.cancellation_reason && (
                      <div className="mb-3 rounded-xl border border-[#f0bdb4] bg-[#fdeceb] px-3 py-2">
                        <p className="text-sm text-[#c4423a]">
                          <span className="font-semibold">Motiu:</span> {order.cancellation_reason}
                        </p>
                        {order.cancelled_at && (
                          <p className="mt-0.5 text-xs text-[#b54838]">
                            Anul·lat el {new Date(order.cancelled_at).toLocaleString("ca-ES")}
                          </p>
                        )}
                        {order.refund_reference && (
                          <p className="mt-1 text-xs text-[#b54838]">
                            <span className="font-semibold">↩ Tornat al datàfon:</span> ref {order.refund_reference}
                            {order.refund_at && ` el ${new Date(order.refund_at).toLocaleString("ca-ES")}`}
                          </p>
                        )}
                      </div>
                    )}
                    {order.invoice_number && (
                      <p className="mb-2 text-xs text-[#7b7469]">Factura: {order.invoice_number}</p>
                    )}
                    {order.payment_method === "card" && order.cashless_operation_id && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <p className="text-xs text-[#8a8276]">
                            Targeta — ref {order.card_reference}
                            {order.card_authorization && ` · auth ${order.card_authorization}`}
                          </p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {canLookup && order.card_receipt_text && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleReprintReceipt(order, "merchant");
                                  }}
                                  disabled={
                                    reprintingReceipt?.id === order.id &&
                                    reprintingReceipt?.copy === "merchant"
                                  }
                                  className="rounded-xl border border-[#d4cbbb] bg-white px-2.5 py-1 text-xs font-medium text-[#6f665c] transition-colors active:bg-[#f1eee7] disabled:opacity-50"
                                >
                                  {reprintingReceipt?.id === order.id && reprintingReceipt?.copy === "merchant"
                                    ? "Imprimint..."
                                    : "Re-imprimir comerç"}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleReprintReceipt(order, "customer");
                                  }}
                                  disabled={
                                    reprintingReceipt?.id === order.id &&
                                    reprintingReceipt?.copy === "customer"
                                  }
                                  className="rounded-xl border border-[#d4cbbb] bg-white px-2.5 py-1 text-xs font-medium text-[#6f665c] transition-colors active:bg-[#f1eee7] disabled:opacity-50"
                                >
                                  {reprintingReceipt?.id === order.id && reprintingReceipt?.copy === "customer"
                                    ? "Imprimint..."
                                    : "Re-imprimir client"}
                                </button>
                              </>
                            )}
                            {canLookup && <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuery(order);
                              }}
                              disabled={queryingId === order.id}
                              className="rounded-xl border border-[#bfd5ee] bg-[#e4f0fb] px-2.5 py-1 text-xs font-medium text-[#275a8f] transition-colors active:bg-[#d4e7f8] disabled:opacity-50"
                            >
                              {queryingId === order.id ? "Comprobando..." : "Comprobar pago"}
                            </button>}
                          </div>
                        </div>
                        {queryResults.has(order.id) && (() => {
                          const q = queryResults.get(order.id)!;
                          // Detect mismatch: the card provider approved a charge but our local order is pending/cancelled.
                          const localStatus = order.status;
                          const localApproved = localStatus === "completed" || localStatus === "ready" || localStatus === "preparing";
                          const localCancelled = localStatus === "cancelled";
                          let mismatch: string | null = null;
                          if (q.success && localCancelled) {
                            mismatch = "El proveïdor de targeta dona la transacció com aprovada però la comanda local està anul·lada. Pot ser una anul·lació pendent al datàfon — revisa-ho manualment.";
                          } else if (!q.success && localApproved && !localCancelled) {
                            mismatch = "El proveïdor de targeta NO confirma la transacció però la comanda local consta com cobrada. Verifica si realment es va fer el cobrament.";
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
                    {canRefund && order.status !== "cancelled" && order.invoice_number && Number(order.refunded_amount || 0) < Number(order.total) && (
                      <div className="mb-3 flex justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRefundingOrder(order);
                          }}
                          className="rounded-xl bg-[#c4423a] px-3 py-2 text-xs font-semibold text-white"
                        >
                          {order.payment_method === "card" &&
                          order.cashless_operation_id &&
                          (order.cashless_transaction_number || order.card_reference)
                            ? "Devolver productos"
                            : "Rectificar venta"}
                        </button>
                      </div>
                    )}
                    {order.refunds && order.refunds.length > 0 && (
                      <div className="mb-3 rounded-xl border border-[#ddd4c4] bg-white px-3 py-2">
                        <p className="mb-1 text-xs font-semibold uppercase text-[#8a8276]">Devoluciones</p>
                        {order.refunds.map((refund) => (
                          <div key={refund.id} className="border-t border-[#eee4d6] py-2 text-sm first:border-0">
                            <div className="flex items-center justify-between gap-3">
                              <span>{refund.rectifying_invoice_number || "Pendiente"} · {refund.reason}</span>
                              <span className={refund.status === "completed" ? "font-semibold text-[#c4423a]" : "font-semibold text-[#87620d]"}>
                                -{Number(refund.amount).toFixed(2)} EUR · {refund.status}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                              {refund.status === "completed" && canLookup && (
                                <>
                                  <button
                                    onClick={(event) => { event.stopPropagation(); handleRefundPrint(order, refund.id, "rectifying"); }}
                                    disabled={Boolean(refundAction)}
                                    className="rounded-xl border border-[#d4cbbb] bg-white px-2.5 py-1 text-xs font-medium text-[#6f665c] disabled:opacity-50"
                                  >
                                    {refundAction?.id === refund.id && refundAction.action === "rectifying" ? "Imprimiendo..." : "Rectificativa"}
                                  </button>
                                  {refund.receipt_text && (
                                    <>
                                      <button
                                        onClick={(event) => { event.stopPropagation(); handleRefundPrint(order, refund.id, "customer"); }}
                                        disabled={Boolean(refundAction)}
                                        className="rounded-xl border border-[#bfd5ee] bg-[#e4f0fb] px-2.5 py-1 text-xs font-medium text-[#275a8f] disabled:opacity-50"
                                      >Cliente</button>
                                      <button
                                        onClick={(event) => { event.stopPropagation(); handleRefundPrint(order, refund.id, "merchant"); }}
                                        disabled={Boolean(refundAction)}
                                        className="rounded-xl border border-[#d4cbbb] bg-white px-2.5 py-1 text-xs font-medium text-[#6f665c] disabled:opacity-50"
                                      >Comercio</button>
                                    </>
                                  )}
                                </>
                              )}
                              {refund.status === "pending_verification" && canLookup && (
                                <button
                                  onClick={(event) => { event.stopPropagation(); handleRefundQuery(order.id, refund.id); }}
                                  disabled={Boolean(refundAction)}
                                  className="rounded-xl border border-[#ead39b] bg-[#fbf0cc] px-2.5 py-1 text-xs font-semibold text-[#87620d] disabled:opacity-50"
                                >{refundAction?.id === refund.id ? "Comprobando..." : "Comprobar devolucion"}</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {canLookup && order.items && order.items.length > 0 && (
                      <div className="flex justify-end mb-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReprintTicket(order);
                          }}
                          disabled={reprintingTicketId === order.id}
                          className="rounded-xl bg-[#fbf0cc] px-3 py-1.5 text-xs font-medium text-[#87620d] transition-colors active:bg-[#eadfbc] disabled:opacity-50"
                        >
                          {reprintingTicketId === order.id ? "Imprimint..." : "Re-imprimir ticket"}
                        </button>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10131b]/72 p-3">
            <div className="mx-4 w-full max-w-md rounded-2xl border border-[#ddd4c4] bg-[#faf9f6] p-6 text-[#241f1c]">
              <h3 className="mb-1 text-xl font-medium text-[#241f1c]">Anul·lar comanda</h3>
              <p className="mb-4 text-sm text-[#7b7469]">
                Comanda {cancellingOrder?.order_number}
                {cancellingOrder?.invoice_number && (
                  <span className="block text-xs text-[#8a8276]">
                    Factura: {cancellingOrder?.invoice_number}
                  </span>
                )}
                {isCard && hasCardRef && (
                  <span className="block text-xs text-[#8a8276]">
                    Targeta — ref {cancellingOrder?.card_reference}
                  </span>
                )}
              </p>

              {cancellingOrder?.status === "completed" && (
                <div className="mb-4 rounded-xl border border-[#ead39b] bg-[#fbf0cc] px-3 py-2.5 text-sm text-[#87620d]">
                  <strong>⚠ Atenció:</strong> Aquesta comanda ja està completada i té factura emesa. L&apos;anul·lació quedarà registrada però no s&apos;esborra la factura.
                </div>
              )}

              {isCard && !hasCardRef && (
                <div className="mb-4 rounded-xl border border-[#ddd4c4] bg-white px-3 py-2.5 text-xs text-[#6f665c]">
                  Aquesta comanda no té referència de targeta guardada (es va cobrar abans d&apos;activar el seguiment), per això no es pot tornar diners automàticament al datàfon.
                </div>
              )}

              <label className="mb-1 block text-sm font-medium text-[#6f665c]">Motiu</label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="mb-3 w-full rounded-xl border border-[#d4cbbb] bg-white px-3 py-2 text-sm text-[#241f1c] outline-none focus:border-[#2e9e5b] focus:ring-2 focus:ring-[#2e9e5b]/15"
              >
                {CANCEL_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>

              <label className="mb-1 block text-sm font-medium text-[#6f665c]">Notes (opcional)</label>
              <textarea
                value={cancelNotes}
                onChange={(e) => setCancelNotes(e.target.value)}
                placeholder="Detalls addicionals..."
                className="mb-4 h-20 w-full resize-none rounded-xl border border-[#d4cbbb] bg-white px-3 py-2 text-sm text-[#241f1c] outline-none focus:border-[#2e9e5b] focus:ring-2 focus:ring-[#2e9e5b]/15"
              />

              {false && isCard && hasCardRef && (
                <div className="mb-4 rounded-xl border border-[#bfd5ee] bg-[#e4f0fb] p-3">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={refundCard}
                      onChange={(e) => setRefundCard(e.target.checked)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-[#275a8f]">
                        Tornar diners al datàfon
                      </span>
                      <p className="mt-0.5 text-xs text-[#275a8f]">
                        El client haurà de tornar a passar la targeta. S&apos;intentarà
                        primer una anul·lació (gratuïta, mateix dia) i si no, una devolució.
                      </p>
                    </div>
                  </label>
                  {refundCard && (
                    <label className="ml-6 mt-2 flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={preferRefund}
                        onChange={(e) => setPreferRefund(e.target.checked)}
                      />
                      <span className="text-xs text-[#275a8f]">
                        Forçar devolució (la venda ja està liquidada / no és del mateix dia)
                      </span>
                    </label>
                  )}
                </div>
              )}

              {cancelError && (
                <div className="mb-4 rounded-xl border border-[#f0bdb4] bg-[#fdeceb] px-3 py-2 text-sm text-[#c4423a]">
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
                  className="flex-1 rounded-xl border border-[#d4cbbb] bg-white py-2.5 text-sm font-medium text-[#6f665c] transition-colors active:bg-[#f1eee7]"
                >
                  Tornar
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelLoading}
                  className="flex-1 rounded-xl bg-[#c4423a] py-2.5 text-sm font-semibold text-white transition-colors active:bg-[#a93630] disabled:opacity-50"
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
      {refundingOrder && (
        <RefundModal
          order={refundingOrder}
          business={business}
          onClose={() => setRefundingOrder(null)}
          onCompleted={loadOrders}
        />
      )}
    </div>
  );
}
