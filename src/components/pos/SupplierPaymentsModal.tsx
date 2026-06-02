"use client";

import { useEffect, useMemo, useState } from "react";

interface SupplierPaymentsModalProps {
  employeeId: number;
  onClose: () => void;
}

interface SupplierPayment {
  id: number;
  supplier_name: string;
  amount: number | string;
  reason: string | null;
  status: "pending" | "dispensed" | "error" | "cancelled";
  created_at: string;
  dispensed_at: string | null;
  error_message: string | null;
  employee_name?: string | null;
}

const COMMON_SUPPLIERS = ["Hielo", "Fruita", "Llet", "Neteja", "Reparacio"];
const QUICK_AMOUNTS = [10, 20, 30, 50, 100];

function money(value: number | string) {
  return `${Number(value || 0).toFixed(2)} EUR`;
}

export default function SupplierPaymentsModal({ employeeId, onClose }: SupplierPaymentsModalProps) {
  const [supplierName, setSupplierName] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const parsedAmount = useMemo(
    () => Number(String(amount).replace(",", ".")),
    [amount]
  );

  const loadPayments = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pos/supplier-payments");
      if (res.ok) setPayments(await res.json());
    } catch {
      // The payment form can still be used if history fails to load.
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const submit = async () => {
    setMessage(null);
    const cleanSupplier = supplierName.trim();
    if (!cleanSupplier) {
      setMessage("Indica el proveidor.");
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setMessage("Import invalid.");
      return;
    }

    const confirmed = window.confirm(
      `Pagar ${parsedAmount.toFixed(2)} EUR a ${cleanSupplier} i treure diners de Cashlogy?`
    );
    if (!confirmed) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/pos/supplier-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_name: cleanSupplier,
          amount: parsedAmount,
          reason: reason.trim(),
          employee_id: employeeId,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) {
        setMessage(body.error || "No s'ha pogut dispensar.");
      } else {
        setMessage("Pagament registrat i diners dispensats.");
        setSupplierName("");
        setAmount("");
        setReason("");
        await loadPayments();
      }
    } catch {
      setMessage("Error de connexio amb el POS.");
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10131b]/68 p-3">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#ddd4c4] bg-[#faf9f6] text-[#241f1c] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#ddd4c4] px-6 py-4">
          <div>
            <h2 className="text-3xl font-medium leading-tight">Pagaments</h2>
            <p className="text-sm text-[#6f665c]">
              Sortida de diners de Cashlogy per pagar proveidors.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#d4cbbb] bg-white text-2xl text-[#6f665c] active:bg-[#f1eee7]"
          >
            x
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-y-auto lg:grid-cols-[1fr_360px]">
          <div className="space-y-5 p-6">
            <div>
              <label className="mb-2 block text-sm font-semibold uppercase tracking-wide text-[#7b7469]">
                Proveidor
              </label>
              <input
                value={supplierName}
                onChange={(event) => setSupplierName(event.target.value)}
                placeholder="Nom del proveidor"
                className="h-16 w-full rounded-2xl border border-[#d4cbbb] bg-white px-5 text-2xl font-medium outline-none focus:border-[#2e9e5b] focus:ring-4 focus:ring-[#2e9e5b]/10"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {COMMON_SUPPLIERS.map((supplier) => (
                  <button
                    key={supplier}
                    onClick={() => setSupplierName(supplier)}
                    className="rounded-xl border border-[#d4cbbb] bg-white px-4 py-2 text-sm font-medium text-[#5f6878] active:bg-[#f1eee7]"
                  >
                    {supplier}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold uppercase tracking-wide text-[#7b7469]">
                Import
              </label>
              <div className="flex gap-3">
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  className="h-20 min-w-0 flex-1 rounded-2xl border border-[#d4cbbb] bg-white px-5 text-4xl font-semibold outline-none focus:border-[#2e9e5b] focus:ring-4 focus:ring-[#2e9e5b]/10"
                />
                <div className="flex w-24 items-center justify-center rounded-2xl bg-[#efe8db] text-2xl font-semibold text-[#7b7469]">
                  EUR
                </div>
              </div>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {QUICK_AMOUNTS.map((quickAmount) => (
                  <button
                    key={quickAmount}
                    onClick={() => setAmount(String(quickAmount))}
                    className="h-14 rounded-2xl bg-[#ead9bb] text-xl font-semibold text-[#241f1c] active:bg-[#dfcba7]"
                  >
                    {quickAmount}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold uppercase tracking-wide text-[#7b7469]">
                Motiu o nota
              </label>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ex: gel, factura, canvi urgent..."
                className="h-24 w-full resize-none rounded-2xl border border-[#d4cbbb] bg-white px-5 py-4 text-lg outline-none focus:border-[#2e9e5b] focus:ring-4 focus:ring-[#2e9e5b]/10"
              />
            </div>

            <div className="rounded-2xl border border-[#ead9bb] bg-[#fff7e6] px-4 py-3 text-sm text-[#7a5a14]">
              Aquesta operacio no crea cap venda. Es una sortida de caixa i apareixera al tancament Z.
            </div>

            {message && (
              <div className="rounded-2xl border border-[#d4cbbb] bg-white px-4 py-3 text-base font-medium text-[#5f6878]">
                {message}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={submitting}
                className="h-16 flex-1 rounded-2xl border border-[#d4cbbb] bg-white text-xl font-medium text-[#6f665c] active:bg-[#f1eee7] disabled:opacity-50"
              >
                Cancel.lar
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="h-16 flex-[1.6] rounded-2xl bg-[#2e9e5b] text-xl font-semibold text-white active:bg-[#27874e] disabled:opacity-50"
              >
                {submitting ? "Dispensant..." : "Pagar proveidor"}
              </button>
            </div>
          </div>

          <aside className="border-t border-[#ddd4c4] bg-[#f5f4ef] p-5 lg:border-l lg:border-t-0">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Ultims pagaments</h3>
              <button
                onClick={loadPayments}
                className="rounded-xl border border-[#d4cbbb] bg-white px-3 py-1.5 text-sm font-medium text-[#5f6878] active:bg-[#f1eee7]"
              >
                Actualitzar
              </button>
            </div>
            {loading ? (
              <p className="text-sm text-[#8a8276]">Carregant...</p>
            ) : payments.length === 0 ? (
              <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-[#8a8276]">
                Encara no hi ha pagaments.
              </p>
            ) : (
              <div className="space-y-2">
                {payments.slice(0, 10).map((payment) => (
                  <div key={payment.id} className="rounded-2xl border border-[#ddd4c4] bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#241f1c]">{payment.supplier_name}</p>
                        <p className="text-xs text-[#8a8276]">
                          {new Date(payment.created_at).toLocaleString("ca-ES", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <p className="text-lg font-semibold text-[#c4423a]">{money(payment.amount)}</p>
                    </div>
                    {payment.reason && (
                      <p className="mt-2 text-sm text-[#6f665c]">{payment.reason}</p>
                    )}
                    <p
                      className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        payment.status === "dispensed"
                          ? "bg-[#dff5e6] text-[#1e6b3a]"
                          : payment.status === "error"
                          ? "bg-[#fdeceb] text-[#c4423a]"
                          : "bg-[#fbf0cc] text-[#87620d]"
                      }`}
                    >
                      {payment.status === "dispensed"
                        ? "Dispensat"
                        : payment.status === "error"
                        ? "Error"
                        : "Pendent"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

