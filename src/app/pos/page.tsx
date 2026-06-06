"use client";

import { useEffect, useReducer, useState, useCallback, useMemo } from "react";
import { Product, Category, CartItem, Order, ModifierGroup } from "@/types/pos";
import ProductGrid from "@/components/pos/ProductGrid";
import ModifiersModal from "@/components/pos/ModifiersModal";
import Cart from "@/components/pos/Cart";
import CheckoutModal from "@/components/pos/CheckoutModal";
import PinLogin from "@/components/pos/PinLogin";
import CashClosingModal from "@/components/pos/CashClosingModal";
import CashlogyModal from "@/components/pos/CashlogyModal";
import SupplierPaymentsModal from "@/components/pos/SupplierPaymentsModal";
import ParkedTicketsModal from "@/components/pos/ParkedTicketsModal";
import TimeClockModal from "@/components/pos/TimeClockModal";
import { MOCK_PRODUCTS, MOCK_CATEGORIES } from "@/lib/mock-data";
import {
  buildBaseLineNote,
  buildModifierNote,
  getModifierDisplayName,
  getModifierParent,
  getModifierParentLineId,
  getVisibleItemNote,
  groupItemsWithModifiers,
} from "@/lib/item-grouping";
import { publishCustomerDisplaySnapshot } from "@/lib/customer-display";
import { printTicket } from "@/lib/bridge";
import type { Business, ParkedTicket } from "@/types/pos";

type CartAction =
  | { type: "ADD"; product: Product; price?: number; note?: string | null; merge?: boolean; lineId?: string }
  | { type: "UPDATE_QTY"; lineId: string; delta: number }
  | { type: "REMOVE"; lineId: string }
  | { type: "SET_NOTE"; lineId: string; note: string | null }
  | { type: "RESTORE"; items: CartItem[] }
  | { type: "NORMALIZE" }
  | { type: "CLEAR" };

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 min
const PARKED_TICKETS_STORAGE_KEY = "hicream_parked_tickets_v1";

// Categories whose name contains any of these keywords are treated as
// "modifier" categories — their products appear in the long-press popup
// instead of being eligible to trigger their own modifier popup.
const MODIFIER_CATEGORY_KEYWORDS = ["topping", "extra", "salsa", "complement", "complemento", "sabor"];

function isModifierCategory(name: string): boolean {
  const lower = name.toLowerCase();
  return MODIFIER_CATEGORY_KEYWORDS.some((k) => lower.includes(k));
}

function isFlavorCategory(name: string): boolean {
  return name.toLowerCase().includes("sabor");
}

function isGelatsCategory(name?: string | null): boolean {
  const lower = (name || "").trim().toLowerCase();
  return lower === "gelat" || lower === "gelats";
}

function isIceCreamBallName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("bola gelat") || lower.includes("bola helado");
}

function isSingleChoiceCartModifier(item: CartItem): boolean {
  const parent = getModifierParent(item.notes);
  if (!parent) return false;
  if (isIceCreamBallName(item.name)) return true;
  return item.name.trim().toLowerCase() === "nata" && parent.trim().toLowerCase() === "batut";
}

function normalizeCartModifierPrices(items: CartItem[]): CartItem[] {
  let changed = false;
  const normalizedQtyItems = items.map((item) => {
    if (isSingleChoiceCartModifier(item) && item.qty > 1) {
      changed = true;
      return { ...item, qty: 1 };
    }
    return item;
  });

  const groups = new Map<string, { balls: CartItem[]; others: CartItem[] }>();
  for (const item of normalizedQtyItems) {
    const parent = getModifierParent(item.notes);
    if (!parent) continue;
    const groupKey = getModifierParentLineId(item.notes) ?? parent;
    const group = groups.get(groupKey) ?? { balls: [], others: [] };
    if (isIceCreamBallName(item.name)) group.balls.push(item);
    else group.others.push(item);
    groups.set(groupKey, group);
  }

  const ballPriceByLineId = new Map<string, number>();
  for (const group of Array.from(groups.values())) {
    if (group.balls.length === 0) continue;
    const hasOtherTopping = group.others.some((item) => item.qty > 0);
    const price = hasOtherTopping ? 2 : 1;
    for (const ball of group.balls) {
      ballPriceByLineId.set(ball.line_id, price);
    }
  }

  const pricedItems = normalizedQtyItems.map((item) => {
    const ballPrice = ballPriceByLineId.get(item.line_id);
    if (ballPrice == null || item.price === ballPrice) return item;
    changed = true;
    return { ...item, price: ballPrice };
  });

  return changed ? pricedItems : items;
}

function removeCartItemWithModifiers(items: CartItem[], lineId: string): CartItem[] {
  const groupedItems = groupItemsWithModifiers(
    items,
    (item) => item.name,
    (item) => item.notes
  );
  const targetGroup = groupedItems.find((group) => group.base.line_id === lineId);

  if (!targetGroup) {
    return items.filter((item) => item.line_id !== lineId);
  }

  const lineIdsToRemove = new Set([
    targetGroup.base.line_id,
    ...targetGroup.modifiers.map((modifier) => modifier.line_id),
  ]);

  return items.filter((item) => !lineIdsToRemove.has(item.line_id));
}

const POS_CANCEL_REASONS = [
  { value: "client", label: "Petició del client" },
  { value: "error", label: "Error en la comanda" },
  { value: "duplicate", label: "Comanda duplicada" },
  { value: "other", label: "Altre" },
];

function cartReducer(state: CartItem[], action: CartAction): CartItem[] {
  switch (action.type) {
    case "ADD": {
      const price = Number(action.price ?? action.product.price);
      const notes = action.note ?? null;
      const existing = action.merge === false
        ? null
        : state.find(
            (i) =>
              i.product_id === action.product.id &&
              i.price === price &&
              i.notes === notes
          );
      if (existing) {
        return normalizeCartModifierPrices(state.map((i) =>
          i.line_id === existing.line_id
            ? { ...i, qty: i.qty + 1 }
            : i
        ));
      }
      return normalizeCartModifierPrices([
        ...state,
        {
          line_id: action.lineId ?? makeCartLineId(action.product.id),
          product_id: action.product.id,
          name: action.product.name,
          price,
          qty: 1,
          notes,
        },
      ]);
    }
    case "UPDATE_QTY": {
      const target = state.find((item) => item.line_id === action.lineId);
      if (target && target.qty + action.delta <= 0) {
        return normalizeCartModifierPrices(removeCartItemWithModifiers(state, action.lineId));
      }
      return normalizeCartModifierPrices(state
        .map((i) =>
          i.line_id === action.lineId
            ? { ...i, qty: i.qty + action.delta }
            : i
        )
        .filter((i) => i.qty > 0));
    }
    case "REMOVE":
      return normalizeCartModifierPrices(removeCartItemWithModifiers(state, action.lineId));
    case "SET_NOTE":
      return normalizeCartModifierPrices(state.map((i) =>
        i.line_id === action.lineId && !getModifierParent(i.notes)
          ? { ...i, notes: buildBaseLineNote(i.line_id, action.note) }
          : i.line_id === action.lineId
          ? { ...i, notes: action.note }
          : i
      ));
    case "RESTORE":
      return normalizeCartModifierPrices(action.items.map((item) => ({ ...item })));
    case "NORMALIZE":
      return normalizeCartModifierPrices(state);
    case "CLEAR":
      return [];
  }
}

function makeCartLineId(productId: number) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${productId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `parked-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function localBusinessDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cartTotal(items: CartItem[]) {
  return Math.round(items.reduce((sum, item) => sum + item.price * item.qty, 0) * 100) / 100;
}

function cartItemCount(items: CartItem[]) {
  return items.reduce((sum, item) => sum + item.qty, 0);
}

function summarizeCart(items: CartItem[]) {
  const grouped = groupItemsWithModifiers(
    items,
    (item) => item.name,
    (item) => item.notes
  );
  const names = grouped.slice(0, 3).map(({ base }) => `${base.qty}x ${base.name}`);
  const remaining = grouped.length - names.length;
  return remaining > 0 ? `${names.join(", ")} +${remaining} mes` : names.join(", ");
}

function buildParkedTicket(
  items: CartItem[],
  employee: Employee | null,
  orderInfo?: Pick<ParkedTicket, "order_id" | "order_number" | "kitchen_sent_at" | "kitchen_error">
): ParkedTicket {
  const now = new Date();
  return {
    id: makeLocalId(),
    order_id: orderInfo?.order_id ?? null,
    order_number: orderInfo?.order_number ?? null,
    kitchen_sent_at: orderInfo?.kitchen_sent_at ?? null,
    kitchen_error: orderInfo?.kitchen_error ?? null,
    business_date: localBusinessDate(now),
    created_at: now.toISOString(),
    employee_id: employee?.id ?? null,
    employee_name: employee?.name ?? null,
    items: items.map((item) => ({ ...item })),
    total: cartTotal(items),
    item_count: cartItemCount(items),
    summary: summarizeCart(items) || "Comanda aparcada",
  };
}

function readParkedTickets() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PARKED_TICKETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ParkedTicket[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((ticket) => Array.isArray(ticket.items) && ticket.items.length > 0);
  } catch {
    return [];
  }
}

function writeParkedTickets(tickets: ParkedTicket[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PARKED_TICKETS_STORAGE_KEY, JSON.stringify(tickets));
}

interface Employee {
  id: number;
  name: string;
  role: string;
}

export default function PosPage() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [cart, dispatch] = useReducer(cartReducer, []);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCashClosing, setShowCashClosing] = useState(false);
  const [showCashlogy, setShowCashlogy] = useState(false);
  const [showSupplierPayments, setShowSupplierPayments] = useState(false);
  const [showTimeClock, setShowTimeClock] = useState(false);
  const [showParkedTickets, setShowParkedTickets] = useState(false);
  const [showRecentOrders, setShowRecentOrders] = useState(false);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [parkedTickets, setParkedTickets] = useState<ParkedTicket[]>([]);
  const [recoveringTicket, setRecoveringTicket] = useState<ParkedTicket | null>(null);
  const [activeParkedOrderId, setActiveParkedOrderId] = useState<number | null>(null);
  const [printingParkedTicketId, setPrintingParkedTicketId] = useState<string | null>(null);
  const [sendingParkedTicketId, setSendingParkedTicketId] = useState<string | null>(null);
  const [parkingInProgress, setParkingInProgress] = useState(false);
  const [shuttingDown, setShuttingDown] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("client");
  const [loading, setLoading] = useState(true);
  const [modifiersFor, setModifiersFor] = useState<Product | null>(null);

  useEffect(() => {
    dispatch({ type: "NORMALIZE" });
  }, [cart]);

  useEffect(() => {
    if (cart.length === 0) {
      setActiveParkedOrderId(null);
    }
  }, [cart.length]);

  // Split products by whether they belong to a modifier category. Modifier
  // products show up in the modifiers picker; everything else is a base product
  // that can OPEN the modifiers picker via long-press.
  const modifierGroupCategoryIds = useMemo(() => {
    const ids = new Set<number>();
    modifierGroups.forEach((group) => {
      group.category_ids.forEach((id) => ids.add(id));
    });
    return ids;
  }, [modifierGroups]);
  const modifierCategoryIds = useMemo(
    () =>
      new Set(
        categories
          .filter((c) => isModifierCategory(c.name) || modifierGroupCategoryIds.has(c.id))
          .map((c) => c.id)
      ),
    [categories, modifierGroupCategoryIds]
  );
  const baseProducts = useMemo(
    () => products.filter((p) => !modifierCategoryIds.has(p.category_id)),
    [products, modifierCategoryIds]
  );
  const baseCategories = useMemo(
    () => categories.filter((c) => !modifierCategoryIds.has(c.id)),
    [categories, modifierCategoryIds]
  );
  const modifierProducts = useMemo(
    () => products.filter((p) => modifierCategoryIds.has(p.category_id) && p.active !== false),
    [products, modifierCategoryIds]
  );
  const modifierCategories = useMemo(
    () => categories.filter((c) => modifierCategoryIds.has(c.id)),
    [categories, modifierCategoryIds]
  );
  const modifierProductIds = useMemo(
    () => new Set(modifierProducts.map((p) => p.id)),
    [modifierProducts]
  );
  const modifierGroupById = useMemo(
    () => new Map(modifierGroups.map((group) => [group.id, group])),
    [modifierGroups]
  );
  const activeModifierGroupIds = useMemo(
    () => new Set(modifierGroups.map((group) => group.id)),
    [modifierGroups]
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  const flavorModifierGroupIds = useMemo(
    () =>
      new Set(
        modifierGroups
          .filter((group) =>
            group.category_ids.some((categoryId) => {
              const category = categoriesById.get(categoryId);
              return category ? isFlavorCategory(category.name) : false;
            })
          )
          .map((group) => group.id)
      ),
    [categoriesById, modifierGroups]
  );
  const shouldOpenModifiersOnTap = useCallback(
    (product: Product) => {
      const categoryName = product.category_name ?? categoriesById.get(product.category_id)?.name;
      if (isGelatsCategory(categoryName)) return false;
      return Boolean(
        product.modifier_group_id &&
          flavorModifierGroupIds.has(product.modifier_group_id) &&
          modifierProducts.length > 0
      );
    },
    [categoriesById, flavorModifierGroupIds, modifierProducts.length]
  );
  const selectedModifierGroup = modifiersFor?.modifier_group_id
    ? modifierGroupById.get(modifiersFor.modifier_group_id) ?? null
    : null;
  const selectedModifierCategoryIds = useMemo(() => {
    if (selectedModifierGroup) return new Set(selectedModifierGroup.category_ids);
    return modifierCategoryIds;
  }, [selectedModifierGroup, modifierCategoryIds]);
  const availableModifierProducts = useMemo(
    () => modifierProducts.filter((p) => selectedModifierCategoryIds.has(p.category_id)),
    [modifierProducts, selectedModifierCategoryIds]
  );
  const availableModifierCategories = useMemo(
    () => modifierCategories.filter((c) => selectedModifierCategoryIds.has(c.id)),
    [modifierCategories, selectedModifierCategoryIds]
  );
  const customerDisplayItems = useMemo(
    () =>
      groupItemsWithModifiers(
        cart,
        (item) => item.name,
        (item) => item.notes
      ).map(({ base, modifiers }) => ({
        lineId: base.line_id,
        name: base.name,
        qty: base.qty,
        unitPrice: base.price,
        lineTotal: Math.round(base.price * base.qty * 100) / 100,
        note: getVisibleItemNote(base.notes),
        modifiers: modifiers.map((modifier) => ({
          lineId: modifier.line_id,
          name: getModifierDisplayName(modifier.name, modifier.notes),
          qty: modifier.qty,
          unitPrice: modifier.price,
          lineTotal: Math.round(modifier.price * modifier.qty * 100) / 100,
          note: getVisibleItemNote(modifier.notes),
        })),
      })),
    [cart]
  );
  const customerDisplayTotal = useMemo(
    () => Math.round(cart.reduce((sum, item) => sum + item.price * item.qty, 0) * 100) / 100,
    [cart]
  );
  const customerDisplayItemCount = useMemo(
    () => customerDisplayItems.reduce((sum, item) => sum + item.qty, 0),
    [customerDisplayItems]
  );
  const noLongPressIds = useMemo(() => {
    const ids = new Set(modifierProductIds);
    if (modifierGroups.length > 0) {
      for (const product of baseProducts) {
        if (
          !modifierProductIds.has(product.id) &&
          (!product.modifier_group_id || !activeModifierGroupIds.has(product.modifier_group_id))
        ) {
          ids.add(product.id);
        }
      }
    }
    return ids;
  }, [activeModifierGroupIds, baseProducts, modifierProductIds, modifierGroups.length]);

  useEffect(() => {
    publishCustomerDisplaySnapshot({
      status: !employee || cart.length === 0 ? "idle" : showCheckout ? "checkout" : "active",
      employeeName: employee?.name ?? null,
      items: employee ? customerDisplayItems : [],
      itemCount: employee ? customerDisplayItemCount : 0,
      total: employee ? customerDisplayTotal : 0,
      updatedAt: new Date().toISOString(),
    });
  }, [
    cart.length,
    customerDisplayItemCount,
    customerDisplayItems,
    customerDisplayTotal,
    employee,
    showCheckout,
  ]);

  const loadRecentOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/pos/orders");
      if (res.ok) {
        const data: Order[] = await res.json();
        // Today's orders only
        const today = new Date().toISOString().split("T")[0];
        setRecentOrders(
          data.filter((o) => new Date(o.created_at).toISOString().split("T")[0] === today)
        );
      }
    } catch { /* API not available */ }
  }, []);

  const handleCancelOrder = useCallback(async () => {
    if (!cancellingId) return;
    const reason = POS_CANCEL_REASONS.find((r) => r.value === cancelReason)?.label || cancelReason;
    try {
      const res = await fetch(`/api/pos/orders/${cancellingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, employee_id: employee?.id }),
      });
      if (res.ok) {
        setRecentOrders((prev) =>
          prev.map((o) =>
            o.id === cancellingId ? { ...o, status: "cancelled" as const, cancellation_reason: reason } : o
          )
        );
      }
    } catch { /* Error */ }
    setCancellingId(null);
    setCancelReason("client");
  }, [cancellingId, cancelReason, employee]);

  const saveParkedTickets = useCallback((tickets: ParkedTicket[]) => {
    const today = localBusinessDate();
    const todayTickets = tickets.filter((ticket) => ticket.business_date === today);
    setParkedTickets(todayTickets);
    writeParkedTickets(todayTickets);
  }, []);

  const sendParkedTicketToKds = useCallback(async (items: CartItem[], orderId?: number | null) => {
    const res = await fetch("/api/pos/orders/parked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: orderId || null,
        items,
        employee_id: employee?.id,
        table_number: null,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error || "No s'ha pogut enviar la comanda a cuina");
    }
    return data as Order & { kitchen_print?: { success?: boolean; error?: string } };
  }, [employee?.id]);

  const handleParkCurrentTicket = useCallback(async () => {
    if (cart.length === 0 || parkingInProgress) return;
    setParkingInProgress(true);
    try {
      let orderInfo: Pick<ParkedTicket, "order_id" | "order_number" | "kitchen_sent_at" | "kitchen_error"> = {
        order_id: activeParkedOrderId,
        order_number: null,
        kitchen_sent_at: null,
        kitchen_error: null,
      };
      try {
        const order = await sendParkedTicketToKds(cart, activeParkedOrderId);
        orderInfo = {
          order_id: order.id,
          order_number: order.order_number,
          kitchen_sent_at: new Date().toISOString(),
          kitchen_error: order.kitchen_print?.success ? null : order.kitchen_print?.error || "No s'ha pogut imprimir a cuina",
        };
      } catch (error) {
        orderInfo = {
          ...orderInfo,
          kitchen_error: (error as Error).message || "No s'ha pogut enviar a cuina",
        };
        window.alert(`Ticket aparcat, pero hi ha hagut un avís de cuina/KDS: ${orderInfo.kitchen_error}`);
      }
      const ticket = buildParkedTicket(cart, employee, orderInfo);
      const withoutSameOrder = parkedTickets.filter((candidate) => {
        if (ticket.order_id && candidate.order_id === ticket.order_id) return false;
        return candidate.id !== ticket.id;
      });
      saveParkedTickets([ticket, ...withoutSameOrder]);
      dispatch({ type: "CLEAR" });
      setActiveParkedOrderId(null);
      setShowCheckout(false);
      setModifiersFor(null);
    } finally {
      setParkingInProgress(false);
    }
  }, [activeParkedOrderId, cart, employee, parkedTickets, parkingInProgress, saveParkedTickets, sendParkedTicketToKds]);

  const restoreParkedTicket = useCallback((ticket: ParkedTicket) => {
    dispatch({ type: "RESTORE", items: ticket.items });
    setActiveParkedOrderId(ticket.order_id ?? null);
    saveParkedTickets(parkedTickets.filter((candidate) => candidate.id !== ticket.id));
    setShowParkedTickets(false);
    setRecoveringTicket(null);
    setShowCheckout(false);
    setModifiersFor(null);
  }, [parkedTickets, saveParkedTickets]);

  const handleRecoverParkedTicket = useCallback((ticket: ParkedTicket) => {
    if (cart.length > 0) {
      setRecoveringTicket(ticket);
      return;
    }
    restoreParkedTicket(ticket);
  }, [cart.length, restoreParkedTicket]);

  const handleParkCurrentAndRecover = useCallback(async () => {
    if (!recoveringTicket) return;
    let currentTicket: ParkedTicket | null = null;
    if (cart.length > 0) {
      let orderInfo: Pick<ParkedTicket, "order_id" | "order_number" | "kitchen_sent_at" | "kitchen_error"> = {
        order_id: activeParkedOrderId,
        order_number: null,
        kitchen_sent_at: null,
        kitchen_error: null,
      };
      try {
        const order = await sendParkedTicketToKds(cart, activeParkedOrderId);
        orderInfo = {
          order_id: order.id,
          order_number: order.order_number,
          kitchen_sent_at: new Date().toISOString(),
          kitchen_error: order.kitchen_print?.success ? null : order.kitchen_print?.error || "No s'ha pogut imprimir a cuina",
        };
      } catch (error) {
        orderInfo = {
          ...orderInfo,
          kitchen_error: (error as Error).message || "No s'ha pogut enviar a cuina",
        };
        window.alert(`Ticket aparcat, pero hi ha hagut un avís de cuina/KDS: ${orderInfo.kitchen_error}`);
      }
      currentTicket = buildParkedTicket(cart, employee, orderInfo);
    }
    const remaining = parkedTickets.filter((ticket) => ticket.id !== recoveringTicket.id);
    saveParkedTickets(currentTicket ? [currentTicket, ...remaining] : remaining);
    dispatch({ type: "RESTORE", items: recoveringTicket.items });
    setActiveParkedOrderId(recoveringTicket.order_id ?? null);
    setShowParkedTickets(false);
    setRecoveringTicket(null);
    setShowCheckout(false);
    setModifiersFor(null);
  }, [activeParkedOrderId, cart, employee, parkedTickets, recoveringTicket, saveParkedTickets, sendParkedTicketToKds]);

  const handleDiscardCurrentAndRecover = useCallback(() => {
    if (!recoveringTicket) return;
    dispatch({ type: "RESTORE", items: recoveringTicket.items });
    setActiveParkedOrderId(recoveringTicket.order_id ?? null);
    saveParkedTickets(parkedTickets.filter((ticket) => ticket.id !== recoveringTicket.id));
    setShowParkedTickets(false);
    setRecoveringTicket(null);
    setShowCheckout(false);
    setModifiersFor(null);
  }, [parkedTickets, recoveringTicket, saveParkedTickets]);

  const handleDeleteParkedTicket = useCallback(async (ticketId: string) => {
    const ticket = parkedTickets.find((candidate) => candidate.id === ticketId);
    if (ticket?.order_id) {
      try {
        await fetch(`/api/pos/orders/${ticket.order_id}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: "Ticket aparcat eliminat",
            employee_id: employee?.id,
          }),
        });
      } catch {
        // Keep local delete responsive even if the KDS/API is temporarily offline.
      }
    }
    saveParkedTickets(parkedTickets.filter((ticket) => ticket.id !== ticketId));
    setRecoveringTicket((current) => (current?.id === ticketId ? null : current));
  }, [employee?.id, parkedTickets, saveParkedTickets]);

  const handleSendParkedTicketToKds = useCallback(async (ticket: ParkedTicket) => {
    setSendingParkedTicketId(ticket.id);
    try {
      const order = await sendParkedTicketToKds(ticket.items, ticket.order_id);
      const updatedTicket: ParkedTicket = {
        ...ticket,
        order_id: order.id,
        order_number: order.order_number,
        kitchen_sent_at: new Date().toISOString(),
        kitchen_error: order.kitchen_print?.success ? null : order.kitchen_print?.error || "No s'ha pogut imprimir a cuina",
      };
      saveParkedTickets(parkedTickets.map((candidate) => (
        candidate.id === ticket.id ? updatedTicket : candidate
      )));
      if (updatedTicket.kitchen_error) {
        window.alert(`Enviat al KDS, pero hi ha hagut un avís de cuina: ${updatedTicket.kitchen_error}`);
      }
    } catch (error) {
      const updatedTicket: ParkedTicket = {
        ...ticket,
        kitchen_error: (error as Error).message || "No s'ha pogut enviar a cuina",
      };
      saveParkedTickets(parkedTickets.map((candidate) => (
        candidate.id === ticket.id ? updatedTicket : candidate
      )));
      window.alert(`No s'ha pogut enviar al KDS: ${updatedTicket.kitchen_error}`);
    } finally {
      setSendingParkedTicketId(null);
    }
  }, [parkedTickets, saveParkedTickets, sendParkedTicketToKds]);

  const handlePrintParkedTicket = useCallback(async (ticket: ParkedTicket) => {
    setPrintingParkedTicketId(ticket.id);
    try {
      let business: Business | undefined;
      try {
        const res = await fetch("/api/pos/business");
        if (res.ok) business = await res.json();
      } catch {
        // Ticket can still print without fiscal business data.
      }

      const totalBase = Math.round((ticket.total / 1.10) * 100) / 100;
      const totalVat = Math.round((ticket.total - totalBase) * 100) / 100;
      const result = await printTicket({
        orderNumber: ticket.order_number || "APARCAT",
        items: ticket.items.map((item) => ({
          name: getModifierParent(item.notes)
            ? `+ ${getModifierDisplayName(item.name, item.notes)}`
            : item.name,
          qty: item.qty,
          price: item.price,
        })),
        total: ticket.total,
        totalBase,
        totalVat,
        vatRate: 10,
        paymentMethod: "Aparcat",
        date: new Date(ticket.created_at).toLocaleString("es-ES"),
        business,
      });
      if (!result.success) {
        window.alert(result.error || "No s'ha pogut imprimir el ticket aparcat");
      }
    } finally {
      setPrintingParkedTicketId(null);
    }
  }, []);

  // Restore session
  useEffect(() => {
    const saved = localStorage.getItem("pos_employee");
    if (saved) {
      setEmployee(JSON.parse(saved));
    }
  }, []);

  // Load products (fallback to mock data if API unavailable)
  useEffect(() => {
    if (!employee) return;
    Promise.all([
      fetch("/api/pos/products").then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
      fetch("/api/pos/categories").then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
      fetch("/api/pos/modifier-groups").then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
    ])
      .then(([prods, cats, groups]) => {
        setProducts(prods);
        setCategories(cats);
        setModifierGroups(groups);
        setLoading(false);
      })
      .catch(() => {
        // Fallback to mock data
        setProducts(MOCK_PRODUCTS);
        setCategories(MOCK_CATEGORIES);
        setModifierGroups([]);
        setLoading(false);
      });
  }, [employee]);

  // Inactivity auto-logout
  useEffect(() => {
    if (!employee) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setEmployee(null);
        localStorage.removeItem("pos_employee");
        dispatch({ type: "CLEAR" });
      }, INACTIVITY_TIMEOUT_MS);
    };
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => {
      clearTimeout(timeoutId);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [employee]);

  // Kiosk/POS mode: long press is used for modifiers, so suppress the browser menu.
  useEffect(() => {
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("contextmenu", preventContextMenu, { capture: true });
    return () => {
      document.removeEventListener("contextmenu", preventContextMenu, { capture: true });
    };
  }, []);

  // Restore parked tickets for today and discard old ones.
  useEffect(() => {
    const today = localBusinessDate();
    const todayTickets = readParkedTickets().filter((ticket) => ticket.business_date === today);
    setParkedTickets(todayTickets);
    writeParkedTickets(todayTickets);
  }, []);

  const handleLogin = (emp: Employee) => {
    setEmployee(emp);
    localStorage.setItem("pos_employee", JSON.stringify(emp));
  };

  const handleLogout = () => {
    setEmployee(null);
    localStorage.removeItem("pos_employee");
    dispatch({ type: "CLEAR" });
    setActiveParkedOrderId(null);
    setLoading(true);
  };

  const handleShutdown = useCallback(async () => {
    const confirmed = window.confirm(
      "Tancar el POS, la pantalla client i els serveis de HiCream?"
    );
    if (!confirmed) return;

    setShuttingDown(true);
    try {
      const res = await fetch("/api/pos/shutdown", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "No s'ha pogut tancar el POS");
      }
    } catch (error) {
      setShuttingDown(false);
      window.alert((error as Error).message || "No s'ha pogut tancar el POS");
    }
  }, []);

  const handleCheckoutComplete = () => {
    dispatch({ type: "CLEAR" });
    setActiveParkedOrderId(null);
    setShowCheckout(false);
  };

  const handleCashClosingComplete = () => {
    saveParkedTickets([]);
    setShowCashClosing(false);
    handleLogout();
  };

  // PIN screen
  if (!employee) {
    return <PinLogin onLogin={handleLogin} />;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f5f4ef]">
        <div className="rounded-xl border border-[#ddd4c4] bg-[#faf9f6] px-5 py-4 text-base font-medium text-[#6f665c]">
          Cargando productos...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#f5f4ef] text-[#241f1c]">
      {/* Top header */}
      <header className="flex h-[64px] flex-shrink-0 items-center gap-1.5 border-b border-[#ded6c8] bg-[#faf9f6] px-2 py-1">
        <div className="flex w-[138px] shrink-0 items-center gap-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#d4cbbb] bg-white text-[11px] font-medium text-[#241f1c]">
            HC
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[26px] font-medium leading-[27px] text-[#241f1c]">Hi Cream</h1>
            <p className="truncate text-[9px] font-normal leading-[11px] text-[#6f665c]">
              {employee.name} - {employee.role === "admin" ? "Admin" : "Empleado"}
            </p>
          </div>
        </div>
        <div className="pos-menu-scroll flex min-w-0 flex-1 flex-nowrap items-center justify-start gap-1 overflow-x-auto py-1">
          <button
            onClick={() => setShowCashlogy(true)}
            className="min-h-[38px] shrink-0 whitespace-nowrap rounded-lg px-2 py-2 text-[13px] font-medium text-[#5f6878] active:bg-[#f1eee7]"
          >
            Cashlogy
          </button>
          <button
            onClick={() => setShowSupplierPayments(true)}
            className="min-h-[38px] shrink-0 whitespace-nowrap rounded-lg px-2 py-2 text-[13px] font-medium text-[#5f6878] active:bg-[#f1eee7]"
          >
            Pagaments
          </button>
          <button
            onClick={() => {
              loadRecentOrders();
              setShowRecentOrders(true);
            }}
            className="min-h-[38px] shrink-0 whitespace-nowrap rounded-lg bg-[#2e9e5b] px-2.5 py-2 text-[13px] font-medium text-white active:bg-[#27874e]"
          >
            Comandes
          </button>
          {employee.role === "admin" && (
            <>
              <a
                href="/admin/products"
                className="flex min-h-[38px] shrink-0 items-center whitespace-nowrap rounded-lg px-2 py-2 text-[13px] font-medium text-[#5f6878] active:bg-[#f1eee7]"
              >
                Productes
              </a>
              <a
                href="/admin/closings"
                className="flex min-h-[38px] shrink-0 items-center whitespace-nowrap rounded-lg px-2 py-2 text-[13px] font-medium text-[#5f6878] active:bg-[#f1eee7]"
              >
                Tancaments
              </a>
              <button
                onClick={() => setShowCashClosing(true)}
                className="min-h-[38px] shrink-0 whitespace-nowrap rounded-lg px-2 py-2 text-[13px] font-medium text-[#5f6878] active:bg-[#f1eee7]"
              >
                Tancar caixa
              </button>
            </>
          )}
          <button
            onClick={handleShutdown}
            disabled={shuttingDown}
            className="min-h-[38px] shrink-0 whitespace-nowrap rounded-lg border border-[#e2c0b8] bg-[#fff4f1] px-2 py-2 text-[13px] font-medium text-[#a33a2c] active:bg-[#f7dfd8] disabled:opacity-60"
          >
            {shuttingDown ? "Tancant..." : "Sortir"}
          </button>
          <button
            onClick={() => setShowTimeClock(true)}
            className="min-h-[38px] shrink-0 whitespace-nowrap rounded-lg border border-[#d6c8ad] bg-[#fff8e8] px-2 py-2 text-[13px] font-semibold text-[#7b5b12] active:bg-[#f3e6c7]"
          >
            Fichar
          </button>
          <button
            onClick={handleLogout}
            className="min-h-[42px] shrink-0 whitespace-nowrap rounded-lg border border-[#d4cbbb] bg-white px-2.5 py-2 text-[13px] font-medium text-[#241f1c] active:bg-[#f1eee7]"
          >
            Canviar
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Product catalog — 75% */}
        <div className="min-h-0 min-w-0 flex-1">
          <ProductGrid
            products={baseProducts}
            categories={baseCategories}
            onAddToCart={(p) => {
              if (shouldOpenModifiersOnTap(p)) {
                setModifiersFor(p);
                return;
              }
              dispatch({ type: "ADD", product: p });
            }}
            onLongPress={
              modifierGroups.length > 0 && modifierProducts.length > 0
                ? (p) => setModifiersFor(p)
                : undefined
            }
            noLongPressIds={noLongPressIds}
          />
        </div>

        {/* Cart — fixed width */}
        <div className="h-[42vh] w-full flex-shrink-0 lg:h-auto lg:w-[400px]">
          <Cart
            items={cart}
            onUpdateQty={(lineId, delta) =>
              dispatch({ type: "UPDATE_QTY", lineId, delta })
            }
            onRemove={(lineId) =>
              dispatch({ type: "REMOVE", lineId })
            }
            onSetNote={(lineId, note) =>
              dispatch({ type: "SET_NOTE", lineId, note })
            }
            onPark={handleParkCurrentTicket}
            onOpenParkedTickets={() => setShowParkedTickets(true)}
            onCheckout={() => setShowCheckout(true)}
            parkedCount={parkedTickets.length}
          />
        </div>
      </div>

      {/* Checkout modal */}
      {showCheckout && (
        <CheckoutModal
          items={cart}
          total={cart.reduce((sum, i) => sum + i.price * i.qty, 0)}
          employeeId={employee.id}
          parkedOrderId={activeParkedOrderId}
          onClose={() => setShowCheckout(false)}
          onComplete={handleCheckoutComplete}
        />
      )}

      {/* Modifiers modal — opened on long-press of a base product */}
      {modifiersFor && (
        <ModifiersModal
          baseProduct={modifiersFor}
          modifierGroupName={selectedModifierGroup?.name ?? null}
          modifierProducts={availableModifierProducts}
          modifierCategories={availableModifierCategories}
          includedCount={modifiersFor.modifier_included_count ?? 0}
          extraPrice={modifiersFor.modifier_extra_price ?? 0}
          onCancel={() => setModifiersFor(null)}
          onConfirm={(extras, note) => {
            const hasCustomizations = extras.length > 0 || Boolean(note?.trim());
            const baseLineId = makeCartLineId(modifiersFor.id);
            dispatch({
              type: "ADD",
              product: modifiersFor,
              note: hasCustomizations ? buildBaseLineNote(baseLineId, note) : note,
              merge: !hasCustomizations,
              lineId: hasCustomizations ? baseLineId : undefined,
            });
            for (const { product, qty, unitPrice } of extras) {
              for (let i = 0; i < qty; i++) {
                dispatch({
                  type: "ADD",
                  product,
                  price: unitPrice,
                  note: buildModifierNote(modifiersFor.name, product.name, baseLineId),
                });
              }
            }
            setModifiersFor(null);
          }}
        />
      )}

      {/* Cash closing modal */}
      {showCashClosing && (
        <CashClosingModal
          employeeId={employee.id}
          onClose={() => setShowCashClosing(false)}
          onComplete={handleCashClosingComplete}
        />
      )}

      {/* Cashlogy inventory modal */}
      {showCashlogy && (
        <CashlogyModal onClose={() => setShowCashlogy(false)} />
      )}

      {/* Supplier payments modal */}
      {showSupplierPayments && (
        <SupplierPaymentsModal
          employeeId={employee.id}
          onClose={() => setShowSupplierPayments(false)}
        />
      )}

      {showTimeClock && (
        <TimeClockModal onClose={() => setShowTimeClock(false)} />
      )}

      {/* Parked tickets modal */}
      {showParkedTickets && (
        <ParkedTicketsModal
          tickets={parkedTickets}
          currentCartHasItems={cart.length > 0}
          onRecover={handleRecoverParkedTicket}
          onDelete={handleDeleteParkedTicket}
          onPrint={handlePrintParkedTicket}
          onSendToKds={handleSendParkedTicketToKds}
          printingTicketId={printingParkedTicketId}
          sendingTicketId={sendingParkedTicketId}
          onClose={() => {
            setShowParkedTickets(false);
            setRecoveringTicket(null);
          }}
        />
      )}

      {/* Recover parked ticket confirmation */}
      {recoveringTicket && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#10131b]/72 p-3">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-[#ddd4c4] bg-[#faf9f6] p-6 text-[#241f1c] shadow-2xl">
            <h3 className="mb-2 text-2xl font-medium text-[#241f1c]">
              Recuperar ticket aparcat?
            </h3>
            <p className="mb-5 text-sm font-medium leading-6 text-[#6f665c]">
              Ara tens una comanda oberta. Pots aparcar-la abans de recuperar el ticket de les{" "}
              {new Date(recoveringTicket.created_at).toLocaleTimeString("ca-ES", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              , descartar-la o tornar enrere.
            </p>
            <div className="space-y-3">
              <button
                onClick={handleParkCurrentAndRecover}
                className="w-full rounded-xl bg-[#2e9e5b] px-4 py-3 text-base font-semibold text-white active:bg-[#27874e]"
              >
                Aparcar actual i recuperar
              </button>
              <button
                onClick={handleDiscardCurrentAndRecover}
                className="w-full rounded-xl bg-[#fdeceb] px-4 py-3 text-base font-semibold text-[#c4423a] active:bg-[#fad6d3]"
              >
                Descartar actual i recuperar
              </button>
              <button
                onClick={() => setRecoveringTicket(null)}
                className="w-full rounded-xl border border-[#d4cbbb] bg-white px-4 py-3 text-base font-medium text-[#6f665c] active:bg-[#f1eee7]"
              >
                Cancel.lar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent orders modal */}
      {showRecentOrders && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10131b]/68 p-3">
          <div className="mx-4 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-[#ddd4c4] bg-[#faf9f6] text-[#241f1c]">
            <div className="flex items-center justify-between border-b border-[#ddd4c4] px-6 py-4">
              <h3 className="text-2xl font-medium text-[#241f1c]">Comandes d&apos;avui</h3>
              <div className="flex gap-2">
                <a
                  href="/admin/orders"
                  className="rounded-xl border border-[#d4cbbb] bg-white px-3 py-1.5 text-xs font-medium text-[#5f6878] active:bg-[#f1eee7]"
                >
                  Veure tot
                </a>
                <button
                  onClick={() => setShowRecentOrders(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#d4cbbb] bg-white text-lg text-[#6f665c] active:bg-[#f1eee7]"
                >
                  &#10005;
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-3">
              {recentOrders.length === 0 ? (
                <p className="py-8 text-center font-medium text-[#7b7469]">Cap comanda avui</p>
              ) : (
                <div className="space-y-2">
                  {recentOrders.map((order) => (
                    <div
                      key={order.id}
                      className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                        order.status === "cancelled" ? "border-[#f0bdb4] bg-[#fdeceb]" : "border-[#ddd4c4] bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-semibold text-[#241f1c]">{order.order_number}</span>
                        {order.table_number && (
                          <span className="rounded-full bg-[#fbf0cc] px-2 py-0.5 text-xs font-medium text-[#87620d]">
                            T{order.table_number}
                          </span>
                        )}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          order.status === "cancelled" ? "bg-[#fdeceb] text-[#c4423a]"
                          : order.status === "completed" ? "bg-[#dff5e6] text-[#1e6b3a]"
                          : order.status === "ready" ? "bg-[#e4f0fb] text-[#275a8f]"
                          : order.status === "preparing" ? "bg-[#fbf0cc] text-[#87620d]"
                          : "bg-[#f1eee7] text-[#6f665c]"
                        }`}>
                          {order.status === "cancelled" ? "Anul·lat"
                          : order.status === "completed" ? "Completat"
                          : order.status === "ready" ? "Llest"
                          : order.status === "preparing" ? "Preparant"
                          : "Pendent"}
                        </span>
                        <span className="text-xs text-[#8a8276]">
                          {new Date(order.created_at).toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-semibold ${order.status === "cancelled" ? "text-[#8a8276] line-through" : "text-[#241f1c]"}`}>
                          {Number(order.total).toFixed(2)}€
                        </span>
                        {order.status !== "cancelled" && (
                          <button
                            onClick={() => setCancellingId(order.id)}
                            className="rounded-xl bg-[#fdeceb] px-2.5 py-1 text-xs font-medium text-[#c4423a] transition-colors active:bg-[#fad6d3]"
                          >
                            Anul·lar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel confirmation (POS) */}
      {cancellingId !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#10131b]/72 p-3">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-[#ddd4c4] bg-[#faf9f6] p-6 text-[#241f1c]">
            <h3 className="mb-3 text-xl font-medium text-[#241f1c]">Anul·lar comanda?</h3>
            <select
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mb-4 w-full rounded-xl border border-[#d4cbbb] bg-white px-3 py-2 text-sm text-[#241f1c] outline-none focus:border-[#2e9e5b] focus:ring-2 focus:ring-[#2e9e5b]/15"
            >
              {POS_CANCEL_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => { setCancellingId(null); setCancelReason("client"); }}
                className="flex-1 rounded-xl border border-[#d4cbbb] bg-white py-2.5 text-sm font-medium text-[#6f665c] active:bg-[#f1eee7]"
              >
                Tornar
              </button>
              <button
                onClick={handleCancelOrder}
                className="flex-1 rounded-xl bg-[#c4423a] py-2.5 text-sm font-semibold text-white active:bg-[#a93630]"
              >
                Anul·lar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
