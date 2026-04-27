"use client";

import { useEffect, useRef, useState } from "react";
import { CartItem, Order } from "@/types/pos";
import {
  chargeCashlogy,
  chargeIngenico,
  cancelCashlogy,
  abortIngenico,
  getCashlogyChargeStatus,
  printTicket,
  printKitchenTicket,
  printCardReceipt,
} from "@/lib/bridge";
import { broadcastNewOrder } from "@/lib/demo-channel";
import { Business } from "@/types/pos";
import { useDatafonoHealth } from "@/hooks/useDatafonoHealth";

function getNextDemoOrderNumber(): string {
  const key = "pos_demo_order_count";
  const current = parseInt(sessionStorage.getItem(key) || "0");
  const next = current + 1;
  sessionStorage.setItem(key, String(next));
  return `#${String(next).padStart(3, "0")}`;
}

interface CheckoutModalProps {
  items: CartItem[];
  total: number;
  employeeId?: number;
  onClose: () => void;
  onComplete: () => void;
}

type Step = "select" | "processing" | "success" | "error";

export default function CheckoutModal({
  items,
  total,
  employeeId,
  onClose,
  onComplete,
}: CheckoutModalProps) {
  const [step, setStep] = useState<Step>("select");
  const [method, setMethod] = useState<"cash" | "card" | "manual" | null>(null);
  const [orderNumber, setOrderNumber] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [change, setChange] = useState<number | null>(null);
  const [tableNumber, setTableNumber] = useState("");
  const [showTableInput, setShowTableInput] = useState(false);
  const [depositedEur, setDepositedEur] = useState(0);
  const [cashStatus, setCashStatus] = useState<string>("");
  const [business, setBusiness] = useState<Business | null>(null);
  // Card receipt text held until we ask the customer if they want a copy.
  const [pendingCustomerReceipt, setPendingCustomerReceipt] = useState<string | null>(null);
  const [printingCustomerCopy, setPrintingCustomerCopy] = useState(false);
  const [aborting, setAborting] = useState(false);
  // Poll datafono health every 15s while the modal is open so the cashier
  // sees a fresh status indicator without spamming the bridge.
  const datafono = useDatafonoHealth(15_000);
  const demoIdRef = useRef(Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch business data on mount for ticket printing
  useEffect(() => {
    fetch("/api/pos/business")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setBusiness(data); })
      .catch(() => {});
  }, []);

  // Poll cashlogy charge status while processing cash
  useEffect(() => {
    if (step === "processing" && method === "cash") {
      pollRef.current = setInterval(async () => {
        const st = await getCashlogyChargeStatus();
        if (st.active) {
          setDepositedEur((st.depositedCents || 0) / 100);
          setCashStatus(st.status || "");
          if (st.status === "done" || st.status === "error" || st.status === "cancelled") {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      }, 800);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [step, method]);

  const createDemoOrder = (paymentMethod: "cash" | "card" | "manual"): Order => {
    const num = getNextDemoOrderNumber();
    const id = demoIdRef.current++;
    return {
      id,
      order_number: num,
      status: "pending",
      total,
      payment_method: paymentMethod,
      employee_id: employeeId || null,
      table_number: tableNumber || undefined,
      created_at: new Date().toISOString(),
      completed_at: null,
      items: items.map((item, i) => ({
        id: id * 100 + i,
        order_id: id,
        product_id: item.product_id,
        qty: item.qty,
        unit_price: item.price,
        vat_rate: 10,
        notes: item.notes,
        product_name: item.name,
      })),
    };
  };

  const handleCancel = async () => {
    if (method === "cash" && step === "processing") {
      await cancelCashlogy();
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    onClose();
  };

  const processManualPayment = async () => {
    setMethod("manual");
    setStep("processing");

    try {
      let order: Order | null = null;
      try {
        const orderRes = await fetch("/api/pos/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items,
            payment_method: "manual",
            employee_id: employeeId,
            table_number: tableNumber || null,
          }),
        });
        if (orderRes.ok) {
          order = await orderRes.json();
        }
      } catch {
        // API not available
      }

      if (!order) {
        order = createDemoOrder("manual");
        broadcastNewOrder(order);
      }

      setOrderNumber(order.order_number);

      printTicket({
        orderNumber: order.order_number,
        invoiceNumber: order.invoice_number,
        items: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
        total,
        totalBase: order.total_base ?? Math.round((total / 1.10) * 100) / 100,
        totalVat: order.total_vat ?? Math.round((total - total / 1.10) * 100) / 100,
        vatRate: 10,
        paymentMethod: "Manual",
        date: new Date().toLocaleString("es-ES"),
        business: business || undefined,
      }).catch(() => {});

      printKitchenTicket({
        orderNumber: order.order_number,
        tableNumber: tableNumber || undefined,
        items: items.map((i) => ({ name: i.name, qty: i.qty, notes: i.notes })),
      }).catch(() => {});

      setStep("success");
    } catch {
      setErrorMsg("Error inesperat durant el cobrament");
      setStep("error");
    }
  };

  const processPayment = async (paymentMethod: "cash" | "card") => {
    setMethod(paymentMethod);
    setStep("processing");
    setDepositedEur(0);
    setCashStatus("depositing");

    try {
      let paymentResult;
      if (paymentMethod === "cash") {
        paymentResult = await chargeCashlogy(total);
      } else {
        paymentResult = await chargeIngenico(total);
      }
      if (!paymentResult.success) {
        setErrorMsg(paymentResult.error || "Error en el pagament");
        setStep("error");
        return;
      }
      if (paymentMethod === "cash" && "change" in paymentResult) {
        setChange(paymentResult.change ?? null);
      }

      // For card payments, capture REDSYS reference + authorization code so we can
      // later refund/cancel through the same datafono (and so it shows on Comercia portal).
      const cardReference =
        paymentMethod === "card" && "reference" in paymentResult
          ? (paymentResult as { reference?: string }).reference || null
          : null;
      const cardAuthorization =
        paymentMethod === "card" && "authorizationCode" in paymentResult
          ? (paymentResult as { authorizationCode?: string }).authorizationCode || null
          : null;
      // Persist the raw receipt text so the bank receipt can be re-printed later.
      const cardReceiptText =
        paymentMethod === "card" && "receipt" in paymentResult
          ? (paymentResult as { receipt?: string }).receipt || null
          : null;

      // Create order via API
      let order: Order | null = null;
      try {
        const orderRes = await fetch("/api/pos/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items,
            payment_method: paymentMethod,
            employee_id: employeeId,
            table_number: tableNumber || null,
            card_reference: cardReference,
            card_authorization: cardAuthorization,
            card_receipt_text: cardReceiptText,
          }),
        });
        if (orderRes.ok) {
          order = await orderRes.json();
        }
      } catch {
        // API not available
      }

      if (!order) {
        order = createDemoOrder(paymentMethod);
        broadcastNewOrder(order);
      }

      setOrderNumber(order.order_number);

      printTicket({
        orderNumber: order.order_number,
        invoiceNumber: order.invoice_number,
        items: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
        total,
        totalBase: order.total_base ?? Math.round((total / 1.10) * 100) / 100,
        totalVat: order.total_vat ?? Math.round((total - total / 1.10) * 100) / 100,
        vatRate: 10,
        paymentMethod: paymentMethod === "cash" ? "Efectiu" : "Targeta",
        date: new Date().toLocaleString("es-ES"),
        business: business || undefined,
      }).catch(() => {});

      printKitchenTicket({
        orderNumber: order.order_number,
        tableNumber: tableNumber || undefined,
        items: items.map((i) => ({ name: i.name, qty: i.qty, notes: i.notes })),
      }).catch(() => {});

      // Card payments: always print the merchant copy (we need it for our records),
      // and stash the receipt text so the success screen can ask the customer
      // if they want a copy too. Verifone P400 ENGAGE has no built-in printer,
      // so REDSYS returns the formatted receipt as text via paymentResult.receipt.
      const cardReceipt =
        paymentMethod === "card" && "receipt" in paymentResult
          ? (paymentResult as { receipt?: string }).receipt
          : null;
      if (cardReceipt) {
        printCardReceipt(cardReceipt, "merchant", order.order_number).catch(() => {});
        setPendingCustomerReceipt(cardReceipt);
      }

      setStep("success");
    } catch {
      setErrorMsg("Error inesperat durant el cobrament");
      setStep("error");
    }
  };

  const remaining = Math.max(0, total - depositedEur);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-3xl p-8 w-full max-w-lg mx-4 shadow-2xl">
        {/* SELECT PAYMENT METHOD */}
        {step === "select" && (
          <>
            <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">
              Cobrar
            </h2>
            <p className="text-center text-3xl font-bold text-green-600 mb-6">
              {total.toFixed(2)} &euro;
            </p>

            {/* Table number */}
            <div className="mb-6">
              {!showTableInput ? (
                <button
                  onClick={() => setShowTableInput(true)}
                  className="w-full py-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors text-sm font-medium"
                >
                  + Afegir numero de taula
                </button>
              ) : (
                <div>
                  <div className="flex gap-2 items-center mb-2">
                    <span className="text-sm font-medium text-gray-600 whitespace-nowrap">Taula:</span>
                    <div className="flex-1 border-2 border-pink-300 rounded-xl px-4 py-2.5 text-center text-xl font-bold text-gray-800 min-h-[44px]">
                      {tableNumber || <span className="text-gray-300">-</span>}
                    </div>
                    <button
                      onClick={() => { setShowTableInput(false); setTableNumber(""); }}
                      className="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 text-lg flex items-center justify-center"
                    >
                      &#10005;
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[1,2,3,4,5,6,7,8,9].map((n) => (
                      <button
                        key={n}
                        onClick={() => setTableNumber(tableNumber + n)}
                        className="h-12 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-lg font-bold text-gray-800 transition-colors"
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      onClick={() => setTableNumber("")}
                      className="h-12 rounded-lg bg-red-50 hover:bg-red-100 text-sm font-semibold text-red-500 transition-colors"
                    >
                      Esborrar
                    </button>
                    <button
                      onClick={() => setTableNumber(tableNumber + "0")}
                      className="h-12 rounded-lg bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-lg font-bold text-gray-800 transition-colors"
                    >
                      0
                    </button>
                    <button
                      onClick={() => setTableNumber(tableNumber.slice(0, -1))}
                      className="h-12 rounded-lg bg-gray-100 hover:bg-gray-200 text-lg text-gray-600 transition-colors"
                    >
                      &#9003;
                    </button>
                  </div>
                </div>
              )}
              {tableNumber && (
                <p className="text-center text-sm text-pink-600 font-semibold mt-2">
                  Taula {tableNumber}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <button
                onClick={() => processPayment("cash")}
                className="flex flex-col items-center justify-center p-6 rounded-2xl bg-emerald-50 border-2 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-100 active:bg-emerald-200 transition-all"
              >
                <span className="text-4xl mb-2">&#128176;</span>
                <span className="text-lg font-bold text-emerald-700">
                  EFECTIU
                </span>
              </button>

              <button
                onClick={() => processPayment("card")}
                disabled={!datafono.online && datafono.lastCheck !== null}
                title={
                  !datafono.online && datafono.lastCheck !== null
                    ? `Datàfon desconnectat${datafono.error ? `: ${datafono.error}` : ""}`
                    : datafono.pinpadInfo || ""
                }
                className="flex flex-col items-center justify-center p-6 rounded-2xl bg-blue-50 border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-100 active:bg-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-blue-200 disabled:hover:bg-blue-50 relative"
              >
                <span className="text-4xl mb-2">&#128179;</span>
                <span className="text-lg font-bold text-blue-700">
                  TARGETA
                </span>
                <span
                  className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${
                    datafono.lastCheck === null
                      ? "bg-gray-300"
                      : datafono.online
                      ? "bg-green-500"
                      : "bg-red-500"
                  }`}
                  aria-label={
                    datafono.lastCheck === null
                      ? "Comprovant datàfon"
                      : datafono.online
                      ? "Datàfon connectat"
                      : "Datàfon desconnectat"
                  }
                />
              </button>

              <button
                onClick={() => processManualPayment()}
                className="flex flex-col items-center justify-center p-6 rounded-2xl bg-amber-50 border-2 border-amber-200 hover:border-amber-400 hover:bg-amber-100 active:bg-amber-200 transition-all"
              >
                <span className="text-4xl mb-2">&#9997;</span>
                <span className="text-lg font-bold text-amber-700">
                  MANUAL
                </span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Cancel·lar
            </button>
          </>
        )}

        {/* PROCESSING — CASH (real-time Cashlogy display) */}
        {step === "processing" && method === "cash" && (
          <div className="py-4">
            <h2 className="text-xl font-bold text-center text-gray-700 mb-6">
              Processant pagament en efectiu
            </h2>

            {/* Spinner while depositing */}
            {cashStatus === "depositing" && (
              <div className="flex justify-center mb-4">
                <div className="animate-spin w-10 h-10 border-4 border-gray-200 border-t-emerald-500 rounded-full" />
              </div>
            )}

            <div className="space-y-4 mb-6">
              {/* A COBRAR */}
              <div className="flex justify-between items-center bg-gray-50 rounded-2xl px-6 py-4">
                <span className="text-lg font-semibold text-gray-600">A COBRAR</span>
                <span className="text-3xl font-bold text-gray-800">{total.toFixed(2)} &euro;</span>
              </div>

              {/* COBRAT */}
              <div className="flex justify-between items-center bg-emerald-50 rounded-2xl px-6 py-4">
                <span className="text-lg font-semibold text-emerald-700">COBRAT</span>
                <span className="text-3xl font-bold text-emerald-600">{depositedEur.toFixed(2)} &euro;</span>
              </div>

              {/* MANCA (only show if still pending) */}
              {remaining > 0 && cashStatus === "depositing" && (
                <div className="flex justify-between items-center bg-pink-50 rounded-2xl px-6 py-4">
                  <span className="text-lg font-semibold text-pink-700">MANCA</span>
                  <span className="text-3xl font-bold text-pink-600">{remaining.toFixed(2)} &euro;</span>
                </div>
              )}

              {/* CANVI (when dispensing or done) */}
              {(cashStatus === "dispensing" || cashStatus === "closing") && depositedEur > total && (
                <div className="flex justify-between items-center bg-orange-50 rounded-2xl px-6 py-4">
                  <span className="text-lg font-semibold text-orange-700">CANVI</span>
                  <span className="text-3xl font-bold text-orange-600">{(depositedEur - total).toFixed(2)} &euro;</span>
                </div>
              )}
            </div>

            {tableNumber && (
              <p className="text-center text-pink-500 font-medium mb-4">Taula {tableNumber}</p>
            )}

            <p className="text-center text-sm text-gray-400 mb-4">
              {cashStatus === "depositing" && "Introdueixi els diners a la Cashlogy..."}
              {cashStatus === "closing" && "Tancant dipòsit..."}
              {cashStatus === "dispensing" && "Dispensant canvi..."}
            </p>

            <button
              onClick={handleCancel}
              className="w-full py-3 rounded-xl bg-red-100 hover:bg-red-200 text-red-700 font-semibold transition-colors"
            >
              Cancel·lar
            </button>
          </div>
        )}

        {/* PROCESSING — MANUAL */}
        {step === "processing" && method === "manual" && (
          <div className="text-center py-8">
            <div className="animate-spin w-16 h-16 border-4 border-gray-200 border-t-amber-500 rounded-full mx-auto mb-6" />
            <p className="text-xl font-semibold text-gray-700">
              Processant cobrament manual...
            </p>
            <p className="text-gray-500 mt-2">{total.toFixed(2)} &euro;</p>
            {tableNumber && (
              <p className="text-pink-500 mt-1 font-medium">Taula {tableNumber}</p>
            )}
          </div>
        )}

        {/* PROCESSING — CARD */}
        {step === "processing" && method === "card" && (
          <div className="text-center py-8">
            <div className="animate-spin w-16 h-16 border-4 border-gray-200 border-t-blue-500 rounded-full mx-auto mb-6" />
            <p className="text-xl font-semibold text-gray-700">
              {aborting ? "Cancel·lant operació..." : "Passi la targeta al datàfon..."}
            </p>
            <p className="text-gray-500 mt-2">{total.toFixed(2)} &euro;</p>
            {tableNumber && (
              <p className="text-pink-500 mt-1 font-medium">Taula {tableNumber}</p>
            )}
            <button
              onClick={async () => {
                setAborting(true);
                // The /charge request is still pending in chargeIngenico above —
                // /abort travels on a separate connection and signals the
                // VerifoneService polling thread to bail out, which then resolves
                // the original /charge with success: false and we transition to
                // the error step normally.
                await abortIngenico().catch(() => {});
                // Don't reset aborting — the original promise will land in error
                // state and the component will close/re-open from there.
              }}
              disabled={aborting}
              className="mt-6 px-6 py-3 rounded-xl bg-red-100 hover:bg-red-200 text-red-700 font-semibold disabled:opacity-50 transition-colors"
            >
              {aborting ? "Cancel·lant..." : "Cancel·lar pagament"}
            </button>
          </div>
        )}

        {/* SUCCESS */}
        {step === "success" && (
          <div className="text-center py-8">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl text-green-600">&#10004;</span>
            </div>
            <h2 className="text-2xl font-bold text-green-700 mb-2">
              Pagament completat
            </h2>
            <p className="text-4xl font-bold text-gray-800 mb-2">
              {orderNumber}
            </p>
            {tableNumber && (
              <p className="text-lg text-pink-600 font-semibold">
                Taula {tableNumber}
              </p>
            )}
            {change !== null && change > 0 && (
              <p className="text-lg text-orange-600 font-semibold">
                Canvi: {change.toFixed(2)} &euro;
              </p>
            )}

            {pendingCustomerReceipt ? (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-2xl">
                <p className="text-base font-semibold text-blue-900 mb-3">
                  Vol còpia del rebut bancari?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setPendingCustomerReceipt(null);
                      onComplete();
                    }}
                    disabled={printingCustomerCopy}
                    className="flex-1 px-6 py-3 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold transition-colors disabled:opacity-50"
                  >
                    No, gràcies
                  </button>
                  <button
                    onClick={async () => {
                      setPrintingCustomerCopy(true);
                      await printCardReceipt(
                        pendingCustomerReceipt,
                        "customer",
                        orderNumber
                      ).catch(() => {});
                      setPendingCustomerReceipt(null);
                      setPrintingCustomerCopy(false);
                      onComplete();
                    }}
                    disabled={printingCustomerCopy}
                    className="flex-1 px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold transition-colors disabled:opacity-50"
                  >
                    {printingCustomerCopy ? "Imprimint..." : "Sí, imprimir"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={onComplete}
                className="mt-6 px-8 py-4 rounded-2xl bg-green-500 hover:bg-green-600 text-white text-lg font-bold transition-colors"
              >
                Nova comanda
              </button>
            )}
          </div>
        )}

        {/* ERROR */}
        {step === "error" && (
          <div className="text-center py-8">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">&#10060;</span>
            </div>
            <h2 className="text-2xl font-bold text-red-700 mb-2">
              Error en el cobrament
            </h2>
            <p className="text-gray-600 mb-6">{errorMsg}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setStep("select")}
                className="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold transition-colors"
              >
                Reintentar
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-red-100 hover:bg-red-200 text-red-700 font-semibold transition-colors"
              >
                Cancel·lar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
