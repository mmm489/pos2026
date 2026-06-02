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

type CartAction =
  | { type: "ADD"; product: Product; price?: number; note?: string | null; merge?: boolean; lineId?: string }
  | { type: "UPDATE_QTY"; lineId: string; delta: number }
  | { type: "REMOVE"; lineId: string }
  | { type: "SET_NOTE"; lineId: string; note: string | null }
  | { type: "NORMALIZE" }
  | { type: "CLEAR" };

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 min

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
  const [showRecentOrders, setShowRecentOrders] = useState(false);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("client");
  const [loading, setLoading] = useState(true);
  const [modifiersFor, setModifiersFor] = useState<Product | null>(null);

  useEffect(() => {
    dispatch({ type: "NORMALIZE" });
  }, [cart]);

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

  const handleLogin = (emp: Employee) => {
    setEmployee(emp);
    localStorage.setItem("pos_employee", JSON.stringify(emp));
  };

  const handleLogout = () => {
    setEmployee(null);
    localStorage.removeItem("pos_employee");
    dispatch({ type: "CLEAR" });
    setLoading(true);
  };

  const handleCheckoutComplete = () => {
    dispatch({ type: "CLEAR" });
    setShowCheckout(false);
  };

  const handleCashClosingComplete = () => {
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
      <header className="flex h-[74px] flex-shrink-0 items-center gap-3 border-b border-[#ded6c8] bg-[#faf9f6] px-3 py-1">
        <div className="flex min-w-[170px] shrink-0 items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#d4cbbb] bg-white text-xs font-medium text-[#241f1c]">
            HC
          </div>
          <div className="min-w-0">
            <h1 className="text-[30px] font-medium leading-[32px] tracking-[-0.01em] text-[#241f1c]">Hi Cream</h1>
            <p className="truncate text-[10px] font-normal leading-[13px] text-[#6f665c]">
              {employee.name} - {employee.role === "admin" ? "Admin" : "Empleado"}
            </p>
          </div>
        </div>
        <div className="pos-menu-scroll flex min-w-0 flex-1 flex-nowrap items-center justify-start gap-1.5 overflow-x-auto py-1">
          <button
            onClick={() => setShowCashlogy(true)}
            className="min-h-[42px] shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-[14px] font-medium text-[#5f6878] active:bg-[#f1eee7]"
          >
            Cashlogy
          </button>
          <button
            onClick={() => setShowSupplierPayments(true)}
            className="min-h-[42px] shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-[14px] font-medium text-[#5f6878] active:bg-[#f1eee7]"
          >
            Pagaments
          </button>
          <a
            href="/pantalla-cliente"
            target="hicream-customer-display"
            className="flex min-h-[42px] shrink-0 items-center whitespace-nowrap rounded-xl px-3 py-2 text-[14px] font-medium text-[#5f6878] active:bg-[#f1eee7]"
          >
            Client
          </a>
          <button
            onClick={() => {
              loadRecentOrders();
              setShowRecentOrders(true);
            }}
            className="min-h-[42px] shrink-0 whitespace-nowrap rounded-xl bg-[#2e9e5b] px-3 py-2 text-[14px] font-medium text-white active:bg-[#27874e]"
          >
            Comandes
          </button>
          {employee.role === "admin" && (
            <>
              <a
                href="/admin/products"
                className="flex min-h-[42px] shrink-0 items-center whitespace-nowrap rounded-xl px-3 py-2 text-[14px] font-medium text-[#5f6878] active:bg-[#f1eee7]"
              >
                Productes
              </a>
              <a
                href="/admin/employees"
                className="flex min-h-[42px] shrink-0 items-center whitespace-nowrap rounded-xl px-3 py-2 text-[14px] font-medium text-[#5f6878] active:bg-[#f1eee7]"
              >
                Empleats
              </a>
              <a
                href="/admin/closings"
                className="flex min-h-[42px] shrink-0 items-center whitespace-nowrap rounded-xl px-3 py-2 text-[14px] font-medium text-[#5f6878] active:bg-[#f1eee7]"
              >
                Tancaments
              </a>
              <button
                onClick={() => setShowCashClosing(true)}
                className="min-h-[42px] shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-[14px] font-medium text-[#5f6878] active:bg-[#f1eee7]"
              >
                Tancar caixa
              </button>
            </>
          )}
          <button
            onClick={handleLogout}
            className="ml-1 min-h-[50px] shrink-0 whitespace-nowrap rounded-xl border border-[#d4cbbb] bg-white px-4 py-2 text-[14px] font-medium text-[#241f1c] active:bg-[#f1eee7]"
          >
            Canviar empleat
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
            onCheckout={() => setShowCheckout(true)}
          />
        </div>
      </div>

      {/* Checkout modal */}
      {showCheckout && (
        <CheckoutModal
          items={cart}
          total={cart.reduce((sum, i) => sum + i.price * i.qty, 0)}
          employeeId={employee.id}
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
