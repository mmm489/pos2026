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
import { MOCK_PRODUCTS, MOCK_CATEGORIES } from "@/lib/mock-data";
import { getModifierParent, groupItemsWithModifiers } from "@/lib/item-grouping";

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
    const group = groups.get(parent) ?? { balls: [], others: [] };
    if (isIceCreamBallName(item.name)) group.balls.push(item);
    else group.others.push(item);
    groups.set(parent, group);
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
        i.line_id === action.lineId ? { ...i, notes: action.note } : i
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
    (product: Product) =>
      Boolean(
        product.modifier_group_id &&
          flavorModifierGroupIds.has(product.modifier_group_id) &&
          modifierProducts.length > 0
      ),
    [flavorModifierGroupIds, modifierProducts.length]
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
      <div className="flex h-screen items-center justify-center bg-[#11131a]">
        <div className="rounded-lg border border-[#434654] bg-[#282a31] px-5 py-4 text-base font-semibold text-[#c3c6d6] shadow-2xl shadow-black/25">
          Cargando productos...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#11131a] text-[#e1e2ec]">
      {/* Top header */}
      <header className="flex h-[78px] flex-shrink-0 items-center justify-between gap-4 border-b border-[#434654] bg-[#11131a] px-4 py-1 shadow-none">
        <div className="flex min-w-[180px] items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded bg-[#e1e2ec] text-sm font-black text-[#11131a] shadow-none">
            HC
          </div>
          <div className="min-w-0">
            <h1 className="text-[32px] font-black leading-[36px] tracking-[-0.01em] text-[#e1e2ec]">Hi Cream</h1>
            <p className="truncate text-[11px] font-semibold leading-[14px] text-[#c3c6d6]">
              {employee.name} - {employee.role === "admin" ? "Admin" : "Empleado"}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-2 overflow-hidden py-1">
          <button
            onClick={() => setShowCashlogy(true)}
            className="min-h-[42px] shrink-0 whitespace-nowrap rounded px-4 py-2 text-[16px] font-medium text-[#c3c6d6] transition-colors hover:bg-[#32343c] active:bg-[#373941]"
          >
            Cashlogy
          </button>
          <button
            onClick={() => {
              loadRecentOrders();
              setShowRecentOrders(true);
            }}
            className="min-h-[42px] shrink-0 whitespace-nowrap rounded bg-[#0052cc] px-4 py-2 text-[16px] font-semibold text-[#c4d2ff] shadow-none transition-colors hover:bg-[#0c56d0] active:bg-[#0040a2]"
          >
            Comandes
          </button>
          {employee.role === "admin" && (
            <>
              <a
                href="/admin/products"
                className="flex min-h-[42px] shrink-0 items-center whitespace-nowrap rounded px-4 py-2 text-[16px] font-medium text-[#c3c6d6] transition-colors hover:bg-[#32343c] active:bg-[#373941]"
              >
                Productes
              </a>
              <a
                href="/admin/employees"
                className="flex min-h-[42px] shrink-0 items-center whitespace-nowrap rounded px-4 py-2 text-[16px] font-medium text-[#c3c6d6] transition-colors hover:bg-[#32343c] active:bg-[#373941]"
              >
                Empleats
              </a>
              <a
                href="/admin/closings"
                className="flex min-h-[42px] shrink-0 items-center whitespace-nowrap rounded px-4 py-2 text-[16px] font-medium text-[#c3c6d6] transition-colors hover:bg-[#32343c] active:bg-[#373941]"
              >
                Tancaments
              </a>
              <button
                onClick={() => setShowCashClosing(true)}
                className="min-h-[42px] shrink-0 whitespace-nowrap rounded px-4 py-2 text-[16px] font-medium text-[#c3c6d6] transition-colors hover:bg-[#32343c] active:bg-[#373941]"
              >
                Tancar caixa
              </button>
            </>
          )}
          <button
            onClick={handleLogout}
            className="ml-2 min-h-[52px] shrink-0 whitespace-nowrap rounded border border-[#434654] bg-transparent px-5 py-2 text-[16px] font-semibold text-[#e1e2ec] transition-colors hover:bg-[#32343c] active:bg-[#373941]"
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
            dispatch({ type: "ADD", product: modifiersFor, note, merge: !note });
            for (const { product, qty, unitPrice } of extras) {
              for (let i = 0; i < qty; i++) {
                dispatch({
                  type: "ADD",
                  product,
                  price: unitPrice,
                  note: `Per ${modifiersFor.name}`,
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

      {/* Recent orders modal */}
      {showRecentOrders && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-sm">
          <div className="mx-4 flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg bg-white shadow-2xl ring-1 ring-slate-900/10">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-xl font-black text-slate-950">Comandes d&apos;avui</h3>
              <div className="flex gap-2">
                <a
                  href="/admin/orders"
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
                >
                  Veure tot
                </a>
                <button
                  onClick={() => setShowRecentOrders(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-lg text-slate-500 hover:bg-slate-200"
                >
                  &#10005;
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-3">
              {recentOrders.length === 0 ? (
                <p className="text-center text-gray-400 py-8">Cap comanda avui</p>
              ) : (
                <div className="space-y-2">
                  {recentOrders.map((order) => (
                    <div
                      key={order.id}
                      className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                        order.status === "cancelled" ? "border-red-100 bg-red-50" : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-black text-slate-950">{order.order_number}</span>
                        {order.table_number && (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs font-bold text-rose-700">
                            T{order.table_number}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          order.status === "cancelled" ? "bg-red-100 text-red-700"
                          : order.status === "completed" ? "bg-green-100 text-green-700"
                          : order.status === "ready" ? "bg-blue-100 text-blue-700"
                          : order.status === "preparing" ? "bg-yellow-100 text-yellow-700"
                          : "bg-slate-200 text-slate-600"
                        }`}>
                          {order.status === "cancelled" ? "Anul·lat"
                          : order.status === "completed" ? "Completat"
                          : order.status === "ready" ? "Llest"
                          : order.status === "preparing" ? "Preparant"
                          : "Pendent"}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(order.created_at).toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-black ${order.status === "cancelled" ? "text-slate-400 line-through" : "text-slate-950"}`}>
                          {Number(order.total).toFixed(2)}€
                        </span>
                        {order.status !== "cancelled" && (
                          <button
                            onClick={() => setCancellingId(order.id)}
                            className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600 transition-colors hover:bg-red-100"
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-2xl ring-1 ring-slate-900/10">
            <h3 className="mb-3 text-lg font-black text-slate-950">Anul·lar comanda?</h3>
            <select
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            >
              {POS_CANCEL_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => { setCancellingId(null); setCancelReason("client"); }}
                className="flex-1 rounded-lg bg-slate-100 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200"
              >
                Tornar
              </button>
              <button
                onClick={handleCancelOrder}
                className="flex-1 rounded-lg bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600"
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
