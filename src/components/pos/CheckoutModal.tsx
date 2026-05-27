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
type TicketPrintData = Parameters<typeof printTicket>[0];

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
  const [pendingTicket, setPendingTicket] = useState<TicketPrintData | null>(null);
  const [printingTicket, setPrintingTicket] = useState(false);
  const [ticketPrinted, setTicketPrinted] = useState(false);
  const [ticketError, setTicketError] = useState("");
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
        if (st.active || st.status) {
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

  const buildTicketData = (order: Order, paymentLabel: string): TicketPrintData => ({
    orderNumber: order.order_number,
    invoiceNumber: order.invoice_number,
    items: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
    total,
    totalBase: order.total_base ?? Math.round((total / 1.10) * 100) / 100,
    totalVat: order.total_vat ?? Math.round((total - total / 1.10) * 100) / 100,
    vatRate: 10,
    paymentMethod: paymentLabel,
    date: new Date().toLocaleString("es-ES"),
    business: business || undefined,
  });

  const handlePrintOrderTicket = async () => {
    if (!pendingTicket) return;
    setPrintingTicket(true);
    setTicketError("");
    const result = await printTicket(pendingTicket);
    if (result.success) {
      setTicketPrinted(true);
    } else {
      setTicketError(result.error || "No s'ha pogut imprimir el ticket");
    }
    setPrintingTicket(false);
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

      setPendingTicket(buildTicketData(order, "Manual"));
      setTicketPrinted(false);
      setTicketError("");

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

      setPendingTicket(buildTicketData(order, paymentMethod === "cash" ? "Efectiu" : "Targeta"));
      setTicketPrinted(false);
      setTicketError("");

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
  const cashStatusText =
    cashStatus === "depositing"
      ? "Esperant bitllets o monedes"
      : cashStatus === "closing"
      ? "Validant cobrament"
      : cashStatus === "dispensing"
      ? "Donant canvi"
      : cashStatus === "done"
      ? "Pagament completat"
      : cashStatus === "cancelled"
      ? "Pagament cancel.lat"
      : cashStatus === "error"
      ? "Incidencia en el cobrament"
      : "Preparant Cashlogy";
  const cashStatusHelp =
    cashStatus === "depositing"
      ? "El client ja pot introduir l'efectiu a la maquina."
      : cashStatus === "closing"
      ? "Cashlogy esta confirmant l'import rebut."
      : cashStatus === "dispensing"
      ? "Cashlogy esta entregant el canvi."
      : "Mantingues aquesta pantalla oberta fins que acabi.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-7 shadow-2xl ring-1 ring-slate-900/10">
        {/* SELECT PAYMENT METHOD */}
        {step === "select" && (
          <>
            <h2 className="mb-2 text-center text-2xl font-black text-slate-950">
              Cobrar
            </h2>
            <p className="mb-6 text-center text-4xl font-black tabular-nums text-emerald-600">
              {total.toFixed(2)} &euro;
            </p>

            {/* Table number */}
            <div className="mb-6">
              {!showTableInput ? (
                <button
                  onClick={() => setShowTableInput(true)}
                  className="w-full rounded-lg border border-dashed border-slate-300 py-3 text-sm font-bold text-slate-500 transition-colors hover:border-slate-400 hover:bg-slate-50 hover:text-slate-700"
                >
                  + Afegir numero de taula
                </button>
              ) : (
                <div>
                  <div className="flex gap-2 items-center mb-2">
                    <span className="whitespace-nowrap text-sm font-bold text-slate-600">Taula:</span>
                    <div className="min-h-[44px] flex-1 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-center text-xl font-black text-slate-950">
                      {tableNumber || <span className="text-slate-300">-</span>}
                    </div>
                    <button
                      onClick={() => { setShowTableInput(false); setTableNumber(""); }}
                      className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-lg text-slate-500 hover:bg-slate-200"
                    >
                      &#10005;
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[1,2,3,4,5,6,7,8,9].map((n) => (
                      <button
                        key={n}
                        onClick={() => setTableNumber(tableNumber + n)}
                        className="h-12 rounded-lg bg-slate-100 text-lg font-black text-slate-950 transition-colors hover:bg-slate-200 active:bg-slate-300"
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      onClick={() => setTableNumber("")}
                      className="h-12 rounded-lg bg-red-50 text-sm font-bold text-red-500 transition-colors hover:bg-red-100"
                    >
                      Esborrar
                    </button>
                    <button
                      onClick={() => setTableNumber(tableNumber + "0")}
                      className="h-12 rounded-lg bg-slate-100 text-lg font-black text-slate-950 transition-colors hover:bg-slate-200 active:bg-slate-300"
                    >
                      0
                    </button>
                    <button
                      onClick={() => setTableNumber(tableNumber.slice(0, -1))}
                      className="h-12 rounded-lg bg-slate-100 text-lg text-slate-600 transition-colors hover:bg-slate-200"
                    >
                      &#9003;
                    </button>
                  </div>
                </div>
              )}
              {tableNumber && (
                <p className="mt-2 text-center text-sm font-bold text-rose-600">
                  Taula {tableNumber}
                </p>
              )}
            </div>

            <div className="mb-6 grid grid-cols-3 gap-4">
              <button
                onClick={() => processPayment("cash")}
                className="flex flex-col items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 p-6 transition-all hover:border-emerald-400 hover:bg-emerald-100 active:bg-emerald-200"
              >
                <span className="text-4xl mb-2">&#128176;</span>
                <span className="text-lg font-black text-emerald-700">
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
                className="relative flex flex-col items-center justify-center rounded-lg border border-sky-200 bg-sky-50 p-6 transition-all hover:border-sky-400 hover:bg-sky-100 active:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-sky-200 disabled:hover:bg-sky-50"
              >
                <span className="text-4xl mb-2">&#128179;</span>
                <span className="text-lg font-black text-sky-700">
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
                className="flex flex-col items-center justify-center rounded-lg border border-amber-200 bg-amber-50 p-6 transition-all hover:border-amber-400 hover:bg-amber-100 active:bg-amber-200"
              >
                <span className="text-4xl mb-2">&#9997;</span>
                <span className="text-lg font-black text-amber-700">
                  MANUAL
                </span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-full rounded-lg py-3 font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              Cancel·lar
            </button>
          </>
        )}

        {/* PROCESSING — CASH (real-time Cashlogy display) */}
        {step === "processing" && method === "cash" && (
          <div className="py-4">
            <h2 className="mb-6 text-center text-xl font-black text-slate-950">
              Processant pagament en efectiu
            </h2>

            <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4 text-center">
              <p className="text-2xl font-black text-emerald-700">{cashStatusText}</p>
              <p className="mt-1 text-sm font-medium text-emerald-800">{cashStatusHelp}</p>
            </div>

            {/* Spinner while depositing */}
            {cashStatus === "depositing" && (
              <div className="flex justify-center mb-4">
                <div className="animate-spin w-10 h-10 border-4 border-gray-200 border-t-emerald-500 rounded-full" />
              </div>
            )}

            <div className="space-y-4 mb-6">
              {/* A COBRAR */}
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-6 py-4">
                <span className="text-lg font-bold text-slate-600">A COBRAR</span>
                <span className="text-3xl font-black tabular-nums text-slate-950">{total.toFixed(2)} &euro;</span>
              </div>

              {/* COBRAT */}
              <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-6 py-4">
                <span className="text-lg font-bold text-emerald-700">COBRAT</span>
                <span className="text-3xl font-black tabular-nums text-emerald-600">{depositedEur.toFixed(2)} &euro;</span>
              </div>

              {/* MANCA (only show if still pending) */}
              {remaining > 0 && cashStatus === "depositing" && (
                <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-6 py-4">
                  <span className="text-lg font-bold text-rose-700">MANCA</span>
                  <span className="text-3xl font-black tabular-nums text-rose-600">{remaining.toFixed(2)} &euro;</span>
                </div>
              )}

              {/* CANVI (when dispensing or done) */}
              {(cashStatus === "dispensing" || cashStatus === "closing") && depositedEur > total && (
                <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-6 py-4">
                  <span className="text-lg font-bold text-amber-700">CANVI</span>
                  <span className="text-3xl font-black tabular-nums text-amber-600">{(depositedEur - total).toFixed(2)} &euro;</span>
                </div>
              )}
            </div>

            {tableNumber && (
              <p className="mb-4 text-center font-bold text-rose-500">Taula {tableNumber}</p>
            )}

            <p className="mb-4 text-center text-sm font-medium text-slate-400">
              {cashStatus === "depositing" && "Introdueixi els diners a la Cashlogy..."}
              {cashStatus === "closing" && "Tancant dipòsit..."}
              {cashStatus === "dispensing" && "Dispensant canvi..."}
            </p>

            <button
              onClick={handleCancel}
              className="w-full rounded-lg bg-red-100 py-3 font-bold text-red-700 transition-colors hover:bg-red-200"
            >
              Cancel·lar
            </button>
          </div>
        )}

        {/* PROCESSING — MANUAL */}
        {step === "processing" && method === "manual" && (
          <div className="text-center py-8">
            <div className="animate-spin w-16 h-16 border-4 border-gray-200 border-t-amber-500 rounded-full mx-auto mb-6" />
            <p className="text-xl font-black text-slate-950">
              Processant cobrament manual...
            </p>
            <p className="mt-2 font-semibold text-slate-500">{total.toFixed(2)} &euro;</p>
            {tableNumber && (
              <p className="mt-1 font-bold text-rose-500">Taula {tableNumber}</p>
            )}
          </div>
        )}

        {/* PROCESSING — CARD */}
        {step === "processing" && method === "card" && (
          <div className="text-center py-8">
            <div className="animate-spin w-16 h-16 border-4 border-gray-200 border-t-blue-500 rounded-full mx-auto mb-6" />
            <p className="text-xl font-black text-slate-950">
              {aborting ? "Cancel·lant operació..." : "Passi la targeta al datàfon..."}
            </p>
            <p className="mt-2 font-semibold text-slate-500">{total.toFixed(2)} &euro;</p>
            {tableNumber && (
              <p className="mt-1 font-bold text-rose-500">Taula {tableNumber}</p>
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
              className="mt-6 rounded-lg bg-red-100 px-6 py-3 font-bold text-red-700 transition-colors hover:bg-red-200 disabled:opacity-50"
            >
              {aborting ? "Cancel·lant..." : "Cancel·lar pagament"}
            </button>
          </div>
        )}

        {/* SUCCESS */}
        {step === "success" && (
          <div className="text-center py-8">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
              <span className="text-4xl text-emerald-600">&#10004;</span>
            </div>
            <h2 className="mb-2 text-2xl font-black text-emerald-700">
              Pagament completat
            </h2>
            <p className="mb-2 text-4xl font-black text-slate-950">
              {orderNumber}
            </p>
            {tableNumber && (
              <p className="text-lg font-bold text-rose-600">
                Taula {tableNumber}
              </p>
            )}
            {change !== null && change > 0 && (
              <p className="text-lg font-bold text-amber-600">
                Canvi: {change.toFixed(2)} &euro;
              </p>
            )}

            {pendingTicket && (
              <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="mb-3 text-base font-bold text-amber-900">
                  Ticket del pedido
                </p>
                <button
                  onClick={handlePrintOrderTicket}
                  disabled={printingTicket}
                  className="w-full rounded-lg bg-amber-500 px-6 py-3 font-bold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                >
                  {printingTicket
                    ? "Imprimint..."
                    : ticketPrinted
                      ? "Reimprimir ticket"
                      : "Imprimir ticket"}
                </button>
                {ticketPrinted && (
                  <p className="mt-2 text-sm font-bold text-emerald-700">
                    Ticket imprès
                  </p>
                )}
                {ticketError && (
                  <p className="mt-2 text-sm font-bold text-red-700">
                    {ticketError}
                  </p>
                )}
              </div>
            )}

            {pendingCustomerReceipt ? (
              <div className="mt-6 rounded-lg border border-sky-200 bg-sky-50 p-4">
                <p className="mb-3 text-base font-bold text-sky-900">
                  Vol còpia del rebut bancari?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setPendingCustomerReceipt(null);
                      onComplete();
                    }}
                    disabled={printingCustomerCopy}
                    className="flex-1 rounded-lg bg-slate-200 px-6 py-3 font-bold text-slate-700 transition-colors hover:bg-slate-300 disabled:opacity-50"
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
                    className="flex-1 rounded-lg bg-sky-500 px-6 py-3 font-bold text-white transition-colors hover:bg-sky-600 disabled:opacity-50"
                  >
                    {printingCustomerCopy ? "Imprimint..." : "Sí, imprimir"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={onComplete}
                className="mt-6 rounded-lg bg-emerald-500 px-8 py-4 text-lg font-black text-white transition-colors hover:bg-emerald-600"
              >
                Nova comanda
              </button>
            )}
          </div>
        )}

        {/* ERROR */}
        {step === "error" && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
              <span className="text-4xl">&#10060;</span>
            </div>
            <h2 className="mb-2 text-2xl font-black text-red-700">
              Error en el cobrament
            </h2>
            <p className="mb-6 font-medium text-slate-600">{errorMsg}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setStep("select")}
                className="flex-1 rounded-lg bg-slate-100 py-3 font-bold text-slate-700 transition-colors hover:bg-slate-200"
              >
                Reintentar
              </button>
              <button
                onClick={onClose}
                className="flex-1 rounded-lg bg-red-100 py-3 font-bold text-red-700 transition-colors hover:bg-red-200"
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
