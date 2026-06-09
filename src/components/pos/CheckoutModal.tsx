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
import {
  getModifierDisplayName,
  getVisibleItemNote,
  groupItemsWithModifiers,
} from "@/lib/item-grouping";

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
  canUseCookies?: boolean;
  parkedOrderId?: number | null;
  onClose: () => void;
  onComplete: () => void;
}

type Step = "select" | "processing" | "success" | "error";
type CheckoutMethod = "cash" | "card" | "manual" | "cookies";
type BusinessUnit = "hicream" | "cookies";
type TicketPrintData = Parameters<typeof printTicket>[0];
type KitchenPrintResult = { success?: boolean; error?: string };
type OrderWithKitchenPrint = Order & { kitchen_print?: KitchenPrintResult };

export default function CheckoutModal({
  items,
  total,
  employeeId,
  canUseCookies = false,
  parkedOrderId,
  onClose,
  onComplete,
}: CheckoutModalProps) {
  const [step, setStep] = useState<Step>("select");
  const [method, setMethod] = useState<CheckoutMethod | null>(null);
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
  const [kitchenPrintError, setKitchenPrintError] = useState("");
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
    if (step === "processing" && (method === "cash" || method === "cookies")) {
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

  const createDemoOrder = (
    paymentMethod: "cash" | "card" | "manual",
    businessUnit: BusinessUnit = "hicream"
  ): Order => {
    const num = getNextDemoOrderNumber();
    const id = demoIdRef.current++;
    return {
      id,
      order_number: num,
      status: "pending",
      total,
      payment_method: paymentMethod,
      business_unit: businessUnit,
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

  const buildKitchenItems = () =>
    groupItemsWithModifiers(
      items,
      (item) => item.name,
      (item) => item.notes
    ).map(({ base, modifiers }) => ({
      name: base.name,
      qty: base.qty,
      notes: getVisibleItemNote(base.notes),
      modifiers: modifiers.map((modifier) => ({
        name: getModifierDisplayName(modifier.name, modifier.notes),
        qty: modifier.qty,
        notes: getVisibleItemNote(modifier.notes),
      })),
    }));

  const printKitchenFallback = async (order: OrderWithKitchenPrint) => {
    if (order.kitchen_print?.success) return;

    const result = await printKitchenTicket({
      orderNumber: order.order_number,
      tableNumber: tableNumber || undefined,
      items: buildKitchenItems(),
    }).catch((error) => ({
      success: false,
      error: (error as Error).message || "No s'ha pogut imprimir a cuina",
    }));

    if (!result.success) {
      setKitchenPrintError(
        result.error ||
          order.kitchen_print?.error ||
          "No s'ha pogut imprimir la comanda de cuina"
      );
    }
  };

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
    if ((method === "cash" || method === "cookies") && step === "processing") {
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
    setKitchenPrintError("");

    try {
      let order: OrderWithKitchenPrint | null = null;
      try {
        const orderRes = await fetch("/api/pos/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items,
            payment_method: "manual",
            employee_id: employeeId,
            table_number: tableNumber || null,
            parked_order_id: parkedOrderId || null,
          }),
        });
        if (orderRes.ok) {
          order = await orderRes.json();
        }
      } catch {
        // API not available
      }

      if (!order) {
        order = createDemoOrder("card");
        broadcastNewOrder(order);
      }

      setOrderNumber(order.order_number);

      setPendingTicket(buildTicketData(order, "Targeta"));
      setTicketPrinted(false);
      setTicketError("");

      if (!parkedOrderId) {
        await printKitchenFallback(order);
      }

      setStep("success");
    } catch {
      setErrorMsg("Error inesperat durant el cobrament");
      setStep("error");
    }
  };

  const processPayment = async (
    paymentMethod: "cash" | "card",
    businessUnit: BusinessUnit = "hicream"
  ) => {
    const displayMethod: CheckoutMethod = paymentMethod === "cash" && businessUnit === "cookies"
      ? "cookies"
      : paymentMethod;
    setMethod(displayMethod);
    setStep("processing");
    setKitchenPrintError("");
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
        if (paymentMethod === "cash" && "cancelled" in paymentResult && paymentResult.cancelled) {
          const message = paymentResult.error || "El cliente ha cancelado la transaccion";
          window.alert(message);
          setErrorMsg(message);
          setStep("select");
          return;
        }
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
      let order: OrderWithKitchenPrint | null = null;
      try {
        const orderRes = await fetch("/api/pos/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items,
            payment_method: paymentMethod,
            business_unit: businessUnit,
            employee_id: employeeId,
            table_number: tableNumber || null,
            parked_order_id: parkedOrderId || null,
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
        order = createDemoOrder(paymentMethod, businessUnit);
        broadcastNewOrder(order);
      }

      setOrderNumber(order.order_number);

      setPendingTicket(buildTicketData(
        order,
        businessUnit === "cookies" ? "Cookies - Efectiu" : paymentMethod === "cash" ? "Efectiu" : "Targeta"
      ));
      setTicketPrinted(false);
      setTicketError("");

      if (!parkedOrderId) {
        await printKitchenFallback(order);
      }

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10131b]/68 p-3">
      <div className="relative mx-4 w-full max-w-lg rounded-2xl border border-[#ddd4c4] bg-[#faf9f6] p-7 text-[#241f1c]">
        {/* SELECT PAYMENT METHOD */}
        {step === "select" && (
          <>
            {canUseCookies && (
              <button
                onClick={() => processPayment("cash", "cookies")}
                className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center text-3xl leading-none transition-transform active:scale-90"
                aria-label="Cobrar Cookies amb Cashlogy"
                title="Cobrar Cookies amb Cashlogy"
              >
                <span aria-hidden="true">&#127850;</span>
              </button>
            )}
            <h2 className="mb-2 text-center text-2xl font-medium text-[#241f1c]">
              Cobrar
            </h2>
            <p className="mb-6 text-center text-5xl font-semibold tabular-nums text-[#2e9e5b]">
              {total.toFixed(2)} &euro;
            </p>

            {/* Table number */}
            <div className="mb-6">
              {!showTableInput ? (
                <button
                  onClick={() => setShowTableInput(true)}
                  className="w-full rounded-xl border border-dashed border-[#cfc5b5] bg-white py-3 text-sm font-medium text-[#6f665c] transition-colors active:bg-[#f1eee7]"
                >
                  + Afegir numero de taula
                </button>
              ) : (
                <div>
                  <div className="flex gap-2 items-center mb-2">
                    <span className="whitespace-nowrap text-sm font-medium text-[#6f665c]">Taula:</span>
                    <div className="min-h-[44px] flex-1 rounded-xl border border-[#d4cbbb] bg-white px-4 py-2.5 text-center text-xl font-semibold text-[#241f1c]">
                      {tableNumber || <span className="text-[#b7aa98]">-</span>}
                    </div>
                    <button
                      onClick={() => { setShowTableInput(false); setTableNumber(""); }}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d4cbbb] bg-white text-lg text-[#6f665c] active:bg-[#f1eee7]"
                    >
                      &#10005;
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[1,2,3,4,5,6,7,8,9].map((n) => (
                      <button
                        key={n}
                        onClick={() => setTableNumber(tableNumber + n)}
                        className="h-12 rounded-xl border border-[#ddd4c4] bg-white text-lg font-medium text-[#241f1c] transition-colors active:bg-[#f1eee7]"
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      onClick={() => setTableNumber("")}
                      className="h-12 rounded-xl bg-[#fdeceb] text-sm font-medium text-[#c4423a] transition-colors active:bg-[#fad6d3]"
                    >
                      Esborrar
                    </button>
                    <button
                      onClick={() => setTableNumber(tableNumber + "0")}
                      className="h-12 rounded-xl border border-[#ddd4c4] bg-white text-lg font-medium text-[#241f1c] transition-colors active:bg-[#f1eee7]"
                    >
                      0
                    </button>
                    <button
                      onClick={() => setTableNumber(tableNumber.slice(0, -1))}
                      className="h-12 rounded-xl border border-[#ddd4c4] bg-white text-lg text-[#6f665c] transition-colors active:bg-[#f1eee7]"
                    >
                      &#9003;
                    </button>
                  </div>
                </div>
              )}
              {tableNumber && (
                <p className="mt-2 text-center text-sm font-medium text-[#c65a42]">
                  Taula {tableNumber}
                </p>
              )}
            </div>

            <div className="mb-6 grid grid-cols-3 gap-4">
              <button
                onClick={() => processPayment("cash")}
                className="flex min-h-[132px] flex-col items-center justify-center rounded-2xl border border-[#b8dec2] bg-[#dff5e6] p-6 transition-transform active:scale-[0.98]"
              >
                <span className="text-4xl mb-2">&#128176;</span>
                <span className="text-lg font-semibold text-[#1e6b3a]">
                  Efectiu
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
                className="relative flex min-h-[132px] flex-col items-center justify-center rounded-2xl border border-[#bfd5ee] bg-[#e4f0fb] p-6 transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-4xl mb-2">&#128179;</span>
                <span className="text-lg font-semibold text-[#275a8f]">
                  Targeta
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
                className="flex min-h-[132px] flex-col items-center justify-center rounded-2xl border border-[#ead39b] bg-[#fbf0cc] p-6 transition-transform active:scale-[0.98]"
              >
                <span className="text-4xl mb-2">&#9997;</span>
                <span className="text-lg font-semibold text-[#87620d]">
                  Manual
                </span>
              </button>
            </div>

            {false && canUseCookies && (
              <button
                onClick={() => processPayment("cash", "cookies")}
                className="mb-6 flex w-full items-center justify-center gap-3 rounded-2xl border border-[#d9b27c] bg-[#fff2d7] px-5 py-4 font-semibold text-[#7a4818] transition-transform active:scale-[0.99]"
              >
                <span className="text-2xl" aria-hidden="true">&#127850;</span>
                <span>Cookies · cobrar amb Cashlogy</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="w-full rounded-xl py-3 font-medium text-[#6f665c] transition-colors active:bg-[#f1eee7]"
            >
              Cancel·lar
            </button>
          </>
        )}

        {/* PROCESSING — CASH (real-time Cashlogy display) */}
        {step === "processing" && (method === "cash" || method === "cookies") && (
          <div className="py-4">
            <h2 className="mb-6 text-center text-xl font-medium text-[#241f1c]">
              {method === "cookies" ? "Cobro Cookies amb Cashlogy" : "Processant pagament en efectiu"}
            </h2>

            <div className="mb-5 rounded-2xl border border-[#b8dec2] bg-[#dff5e6] px-5 py-4 text-center">
              <p className="text-2xl font-semibold text-[#1e6b3a]">{cashStatusText}</p>
              <p className="mt-1 text-sm font-medium text-[#2f7346]">{cashStatusHelp}</p>
            </div>

            {/* Spinner while depositing */}
            {cashStatus === "depositing" && (
              <div className="flex justify-center mb-4">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#e4ddcf] border-t-[#2e9e5b]" />
              </div>
            )}

            <div className="space-y-4 mb-6">
              {/* A COBRAR */}
              <div className="flex items-center justify-between rounded-2xl border border-[#ddd4c4] bg-white px-6 py-4">
                <span className="text-lg font-medium text-[#6f665c]">A cobrar</span>
                <span className="text-3xl font-semibold tabular-nums text-[#241f1c]">{total.toFixed(2)} &euro;</span>
              </div>

              {/* COBRAT */}
              <div className="flex items-center justify-between rounded-2xl border border-[#b8dec2] bg-[#dff5e6] px-6 py-4">
                <span className="text-lg font-medium text-[#1e6b3a]">Cobrat</span>
                <span className="text-3xl font-semibold tabular-nums text-[#2e9e5b]">{depositedEur.toFixed(2)} &euro;</span>
              </div>

              {/* MANCA (only show if still pending) */}
              {remaining > 0 && cashStatus === "depositing" && (
                <div className="flex items-center justify-between rounded-2xl border border-[#f0bdb4] bg-[#fff0ed] px-6 py-4">
                  <span className="text-lg font-medium text-[#b54838]">Manca</span>
                  <span className="text-3xl font-semibold tabular-nums text-[#c4423a]">{remaining.toFixed(2)} &euro;</span>
                </div>
              )}

              {/* CANVI (when dispensing or done) */}
              {(cashStatus === "dispensing" || cashStatus === "closing") && depositedEur > total && (
                <div className="flex items-center justify-between rounded-2xl border border-[#ead39b] bg-[#fbf0cc] px-6 py-4">
                  <span className="text-lg font-medium text-[#87620d]">Canvi</span>
                  <span className="text-3xl font-semibold tabular-nums text-[#a87912]">{(depositedEur - total).toFixed(2)} &euro;</span>
                </div>
              )}
            </div>

            {tableNumber && (
              <p className="mb-4 text-center font-medium text-[#c65a42]">Taula {tableNumber}</p>
            )}

            <p className="mb-4 text-center text-sm font-medium text-[#7b7469]">
              {cashStatus === "depositing" && "Introdueixi els diners a la Cashlogy..."}
              {cashStatus === "closing" && "Tancant dipòsit..."}
              {cashStatus === "dispensing" && "Dispensant canvi..."}
            </p>

            <button
              onClick={handleCancel}
              className="w-full rounded-xl bg-[#fdeceb] py-3 font-medium text-[#c4423a] transition-colors active:bg-[#fad6d3]"
            >
              Cancel·lar
            </button>
          </div>
        )}

        {/* PROCESSING — MANUAL */}
        {step === "processing" && method === "manual" && (
          <div className="text-center py-8">
            <div className="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-4 border-[#e4ddcf] border-t-[#d09a2d]" />
            <p className="text-xl font-medium text-[#241f1c]">
              Processant cobrament manual...
            </p>
            <p className="mt-2 font-medium text-[#6f665c]">{total.toFixed(2)} &euro;</p>
            {tableNumber && (
              <p className="mt-1 font-medium text-[#c65a42]">Taula {tableNumber}</p>
            )}
          </div>
        )}

        {/* PROCESSING — CARD */}
        {step === "processing" && method === "card" && (
          <div className="text-center py-8">
            <div className="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-4 border-[#e4ddcf] border-t-[#4b8fd6]" />
            <p className="text-xl font-medium text-[#241f1c]">
              {aborting ? "Cancel·lant operació..." : "Passi la targeta al datàfon..."}
            </p>
            <p className="mt-2 font-medium text-[#6f665c]">{total.toFixed(2)} &euro;</p>
            {tableNumber && (
              <p className="mt-1 font-medium text-[#c65a42]">Taula {tableNumber}</p>
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
              className="mt-6 rounded-xl bg-[#fdeceb] px-6 py-3 font-medium text-[#c4423a] transition-colors active:bg-[#fad6d3] disabled:opacity-50"
            >
              {aborting ? "Cancel·lant..." : "Cancel·lar pagament"}
            </button>
          </div>
        )}

        {/* SUCCESS */}
        {step === "success" && (
          <div className="text-center py-8">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#dff5e6]">
              <span className="text-4xl text-[#2e9e5b]">&#10004;</span>
            </div>
            <h2 className="mb-2 text-2xl font-medium text-[#1e6b3a]">
              {method === "cookies" ? "Cobrat Cookies" : "Pagament completat"}
            </h2>
            <p className="mb-2 text-5xl font-semibold text-[#241f1c]">
              {orderNumber}
            </p>
            {tableNumber && (
              <p className="text-lg font-medium text-[#c65a42]">
                Taula {tableNumber}
              </p>
            )}
            {change !== null && change > 0 && (
              <p className="text-lg font-medium text-[#a87912]">
                Canvi: {change.toFixed(2)} &euro;
              </p>
            )}

            {kitchenPrintError && (
              <div className="mt-5 rounded-2xl border border-[#f0bdb4] bg-[#fdeceb] p-4 text-left">
                <p className="text-base font-semibold text-[#c4423a]">
                  No s&apos;ha imprès la comanda de cuina
                </p>
                <p className="mt-1 text-sm font-medium text-[#8f4b45]">
                  {kitchenPrintError}
                </p>
              </div>
            )}

            {pendingTicket && (
              <div className="mt-6 rounded-2xl border border-[#ead39b] bg-[#fbf0cc] p-4">
                <p className="mb-3 text-base font-medium text-[#5d4210]">
                  Ticket del pedido
                </p>
                <button
                  onClick={handlePrintOrderTicket}
                  disabled={printingTicket}
                  className="w-full rounded-xl bg-[#d09a2d] px-6 py-3 font-semibold text-white transition-colors active:bg-[#b98421] disabled:opacity-50"
                >
                  {printingTicket
                    ? "Imprimint..."
                    : ticketPrinted
                      ? "Reimprimir ticket"
                      : "Imprimir ticket"}
                </button>
                {ticketPrinted && (
                  <p className="mt-2 text-sm font-medium text-[#1e6b3a]">
                    Ticket imprès
                  </p>
                )}
                {ticketError && (
                  <p className="mt-2 text-sm font-medium text-[#c4423a]">
                    {ticketError}
                  </p>
                )}
              </div>
            )}

            {pendingCustomerReceipt ? (
              <div className="mt-6 rounded-2xl border border-[#bfd5ee] bg-[#e4f0fb] p-4">
                <p className="mb-3 text-base font-medium text-[#275a8f]">
                  Vol còpia del rebut bancari?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setPendingCustomerReceipt(null);
                      onComplete();
                    }}
                    disabled={printingCustomerCopy}
                    className="flex-1 rounded-xl border border-[#d4cbbb] bg-white px-6 py-3 font-medium text-[#6f665c] transition-colors active:bg-[#f1eee7] disabled:opacity-50"
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
                    className="flex-1 rounded-xl bg-[#4b8fd6] px-6 py-3 font-semibold text-white transition-colors active:bg-[#3475bb] disabled:opacity-50"
                  >
                    {printingCustomerCopy ? "Imprimint..." : "Sí, imprimir"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={onComplete}
                className="mt-6 rounded-xl bg-[#2e9e5b] px-8 py-4 text-lg font-semibold text-white transition-colors active:bg-[#27874e]"
              >
                Nova comanda
              </button>
            )}
          </div>
        )}

        {/* ERROR */}
        {step === "error" && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#fdeceb]">
              <span className="text-4xl">&#10060;</span>
            </div>
            <h2 className="mb-2 text-2xl font-medium text-[#c4423a]">
              Error en el cobrament
            </h2>
            <p className="mb-6 font-medium text-[#6f665c]">{errorMsg}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setStep("select")}
                className="flex-1 rounded-xl border border-[#d4cbbb] bg-white py-3 font-medium text-[#241f1c] transition-colors active:bg-[#f1eee7]"
              >
                Reintentar
              </button>
              <button
                onClick={onClose}
                className="flex-1 rounded-xl bg-[#fdeceb] py-3 font-medium text-[#c4423a] transition-colors active:bg-[#fad6d3]"
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
