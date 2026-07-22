"use client";

import { useEffect, useMemo, useState } from "react";

import { printCardReceipt, printRectifyingTicket } from "@/lib/bridge";
import { getModifierDisplayName, groupItemsWithModifiers } from "@/lib/item-grouping";
import type { Business, Order, Refund } from "@/types/pos";

type Props = {
  order: Order;
  business: Business | null;
  onClose: () => void;
  onCompleted: () => void;
};

export default function RefundModal({ order, business, onClose, onCompleted }: Props) {
  const providerRefund =
    order.payment_method === "card" &&
    Boolean(order.cashless_operation_id) &&
    Boolean(order.cashless_transaction_number || order.card_reference);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Map<number, number>>(new Map());
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Refund | null>(null);
  const [printing, setPrinting] = useState("");

  useEffect(() => {
    fetch(`/api/pos/orders/${order.id}/refunds`)
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error || "No s'han pogut carregar les devolucions");
        return response.json();
      })
      .then(setRefunds)
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [order.id]);

  const usedByItem = useMemo(() => {
    const used = new Map<number, number>();
    for (const refund of refunds) {
      if (!["completed", "processing", "pending_verification"].includes(refund.status)) continue;
      for (const item of refund.items || []) {
        used.set(Number(item.order_item_id), (used.get(Number(item.order_item_id)) || 0) + Number(item.qty));
      }
    }
    return used;
  }, [refunds]);

  const groups = useMemo(
    () => groupItemsWithModifiers(order.items || [], (item) => item.product_name || "", (item) => item.notes),
    [order.items],
  );
  const refundableGroups = groups.filter((group) => {
    if (group.isOrphanModifier) return false;
    return Number(group.base.qty) - (usedByItem.get(Number(group.base.id)) || 0) > 0;
  });

  const selectionTotal = refundableGroups.reduce((sum, group) => {
    const qty = selected.get(Number(group.base.id)) || 0;
    if (!qty) return sum;
    const ratio = qty / Number(group.base.qty);
    const groupTotal = Number(group.base.unit_price) * qty + group.modifiers.reduce(
      (modifierSum, modifier) => modifierSum + Number(modifier.unit_price) * Number(modifier.qty) * ratio,
      0,
    );
    return sum + groupTotal;
  }, 0);

  const setQty = (itemId: number, qty: number, max: number) => {
    setSelected((current) => {
      const next = new Map(current);
      if (qty <= 0) next.delete(itemId);
      else next.set(itemId, Math.min(max, qty));
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Map(refundableGroups.map((group) => [
      Number(group.base.id),
      Number(group.base.qty) - (usedByItem.get(Number(group.base.id)) || 0),
    ])));
  };

  const submit = async () => {
    if (!reason.trim()) {
      setError("Indica el motiu de la devolucio");
      return;
    }
    if (selected.size === 0) {
      setError("Selecciona almenys un producte");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/pos/orders/${order.id}/refunds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "partial",
          request_id: crypto.randomUUID(),
          reason: reason.trim(),
          selections: Array.from(selected, ([base_item_id, qty]) => ({ base_item_id, qty })),
        }),
      });
      const data = await response.json();
      if (!response.ok && response.status !== 202) throw new Error(data.error || "Devolucio no completada");
      setResult(data);
      if (data.status === "completed") onCompleted();
      else setError(data.warning || data.error_message || "Devolucio pendent de comprovar. No la repeteixis.");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const printRectifying = async () => {
    if (!result?.rectifying_invoice_number || !result.items) return;
    setPrinting("rectifying");
    await printRectifyingTicket({
      refund: {
        rectifying_invoice_number: result.rectifying_invoice_number,
        amount: Number(result.amount),
        total_base: Number(result.total_base),
        total_vat: Number(result.total_vat),
        reason: result.reason,
        items: result.items.map((item) => ({
          product_name: item.product_name,
          qty: Number(item.qty),
          unit_price: Number(item.unit_price),
        })),
      },
      originalInvoiceNumber: order.invoice_number,
      orderNumber: order.order_number,
      date: new Date(result.completed_at || result.requested_at).toLocaleString("es-ES"),
      business: business || undefined,
    });
    setPrinting("");
  };

  const printBank = async (copy: "merchant" | "customer") => {
    if (!result?.receipt_text) return;
    setPrinting(copy);
    await printCardReceipt(result.receipt_text, copy, result.rectifying_invoice_number || order.order_number);
    setPrinting("");
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#10131b]/72 p-3">
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#ddd4c4] bg-[#faf9f6] text-[#241f1c]">
        <header className="flex items-center justify-between border-b border-[#ddd4c4] px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-[#8a8276]">Factura {order.invoice_number}</p>
            <h2 className="text-2xl font-semibold">
              {providerRefund ? "Devolver productos" : "Rectificar venta"}
            </h2>
          </div>
          <button onClick={onClose} className="h-11 w-11 rounded-xl border border-[#d4cbbb] bg-white text-xl">&#10005;</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="py-10 text-center text-[#7b7469]">Carregant...</p>
          ) : result?.status === "completed" ? (
            <div className="space-y-5 text-center">
              <div className="text-5xl text-[#2e9e5b]">&#10003;</div>
              <div>
                <h3 className="text-2xl font-semibold">
                  {providerRefund ? "Devolucion aprobada" : "Rectificacion creada"}
                </h3>
                <p className="mt-1 text-[#6f665c]">{result.rectifying_invoice_number} · {Number(result.amount).toFixed(2)} EUR</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <button onClick={printRectifying} disabled={Boolean(printing)} className="rounded-xl bg-[#2e9e5b] px-4 py-3 font-semibold text-white disabled:opacity-50">
                  {printing === "rectifying" ? "Imprimiendo..." : "Factura rectificativa"}
                </button>
                <button onClick={() => printBank("customer")} disabled={!result.receipt_text || Boolean(printing)} className="rounded-xl border border-[#bfd5ee] bg-[#e4f0fb] px-4 py-3 font-semibold text-[#275a8f] disabled:opacity-50">
                  Justificante cliente
                </button>
                <button onClick={() => printBank("merchant")} disabled={!result.receipt_text || Boolean(printing)} className="rounded-xl border border-[#d4cbbb] bg-white px-4 py-3 font-semibold text-[#6f665c] disabled:opacity-50">
                  Copia comercio
                </button>
              </div>
            </div>
          ) : (
            <>
              {!providerRefund && (
                <div className="mb-4 rounded-xl border border-[#e7c97b] bg-[#fff7dd] px-4 py-3 text-sm text-[#76550c]">
                  {order.payment_method === "cash"
                    ? "La rectificativa quedara registrada, pero el efectivo debe devolverse al cliente manualmente. No se enviara ninguna orden a Cashlogy."
                    : "La rectificativa quedara registrada sin contactar con el datafono. Si hubo un cobro externo, su devolucion debe hacerse por ese mismo medio."}
                </div>
              )}
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm text-[#6f665c]">Los complementos se rectifican siempre con su producto.</p>
                <button onClick={selectAll} className="rounded-xl border border-[#bfd5ee] bg-[#e4f0fb] px-3 py-2 text-sm font-semibold text-[#275a8f]">Seleccionar todo</button>
              </div>
              <div className="divide-y divide-[#eee4d6] rounded-xl border border-[#ddd4c4] bg-white">
                {refundableGroups.map((group) => {
                  const id = Number(group.base.id);
                  const max = Number(group.base.qty) - (usedByItem.get(id) || 0);
                  const qty = selected.get(id) || 0;
                  return (
                    <div key={id} className="flex items-center gap-4 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{group.base.product_name}</p>
                        {group.modifiers.map((modifier) => (
                          <p key={modifier.id} className="mt-0.5 text-sm text-[#6f665c]">+ {getModifierDisplayName(modifier.product_name || "", modifier.notes)}</p>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setQty(id, qty - 1, max)} className="h-10 w-10 rounded-xl bg-[#f1eee7] text-xl">-</button>
                        <span className="w-8 text-center text-lg font-semibold">{qty}</span>
                        <button onClick={() => setQty(id, qty + 1, max)} className="h-10 w-10 rounded-xl bg-[#f1eee7] text-xl">+</button>
                      </div>
                      <p className="w-24 text-right font-semibold">{(Number(group.base.unit_price) * max).toFixed(2)} EUR</p>
                    </div>
                  );
                })}
              </div>
              {refundableGroups.length === 0 && <p className="py-8 text-center text-[#7b7469]">No quedan productos por devolver.</p>}
              <label className="mt-5 block text-sm font-semibold text-[#6f665c]">Motivo obligatorio</label>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 h-20 w-full resize-none rounded-xl border border-[#d4cbbb] bg-white px-3 py-2" placeholder="Ej. Producto devuelto por el cliente" />
            </>
          )}
          {error && <p className="mt-4 rounded-xl border border-[#f0bdb4] bg-[#fdeceb] px-3 py-2 text-sm font-medium text-[#c4423a]">{error}</p>}
        </div>

        <footer className="flex items-center justify-between border-t border-[#ddd4c4] px-6 py-4">
          <p className="text-xl font-semibold">A devolver: {selectionTotal.toFixed(2)} EUR</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="rounded-xl border border-[#d4cbbb] bg-white px-5 py-3 font-semibold">Cerrar</button>
            {!result && (
              <button onClick={submit} disabled={submitting || selected.size === 0} className="rounded-xl bg-[#c4423a] px-5 py-3 font-semibold text-white disabled:opacity-40">
                {submitting ? "Procesando..." : providerRefund ? "Confirmar devolucion" : "Crear rectificativa"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
