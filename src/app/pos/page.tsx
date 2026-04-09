"use client";

import { useEffect, useReducer, useState, useCallback } from "react";
import { Product, Category, CartItem, Order } from "@/types/pos";
import ProductGrid from "@/components/pos/ProductGrid";
import Cart from "@/components/pos/Cart";
import CheckoutModal from "@/components/pos/CheckoutModal";
import PinLogin from "@/components/pos/PinLogin";
import CashClosingModal from "@/components/pos/CashClosingModal";
import CashlogyModal from "@/components/pos/CashlogyModal";
import { MOCK_PRODUCTS, MOCK_CATEGORIES } from "@/lib/mock-data";

type CartAction =
  | { type: "ADD"; product: Product }
  | { type: "UPDATE_QTY"; productId: number; delta: number }
  | { type: "REMOVE"; productId: number }
  | { type: "CLEAR" };

const POS_CANCEL_REASONS = [
  { value: "client", label: "Petició del client" },
  { value: "error", label: "Error en la comanda" },
  { value: "duplicate", label: "Comanda duplicada" },
  { value: "other", label: "Altre" },
];

function cartReducer(state: CartItem[], action: CartAction): CartItem[] {
  switch (action.type) {
    case "ADD": {
      const existing = state.find(
        (i) => i.product_id === action.product.id
      );
      if (existing) {
        return state.map((i) =>
          i.product_id === action.product.id
            ? { ...i, qty: i.qty + 1 }
            : i
        );
      }
      return [
        ...state,
        {
          product_id: action.product.id,
          name: action.product.name,
          price: Number(action.product.price),
          qty: 1,
          notes: null,
        },
      ];
    }
    case "UPDATE_QTY": {
      return state
        .map((i) =>
          i.product_id === action.productId
            ? { ...i, qty: i.qty + action.delta }
            : i
        )
        .filter((i) => i.qty > 0);
    }
    case "REMOVE":
      return state.filter((i) => i.product_id !== action.productId);
    case "CLEAR":
      return [];
  }
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
  const [cart, dispatch] = useReducer(cartReducer, []);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCashClosing, setShowCashClosing] = useState(false);
  const [showCashlogy, setShowCashlogy] = useState(false);
  const [showRecentOrders, setShowRecentOrders] = useState(false);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("client");
  const [loading, setLoading] = useState(true);

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
    const saved = sessionStorage.getItem("pos_employee");
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
    ])
      .then(([prods, cats]) => {
        setProducts(prods);
        setCategories(cats);
        setLoading(false);
      })
      .catch(() => {
        // Fallback to mock data
        setProducts(MOCK_PRODUCTS);
        setCategories(MOCK_CATEGORIES);
        setLoading(false);
      });
  }, [employee]);

  const handleLogin = (emp: Employee) => {
    setEmployee(emp);
    sessionStorage.setItem("pos_employee", JSON.stringify(emp));
  };

  const handleLogout = () => {
    setEmployee(null);
    sessionStorage.removeItem("pos_employee");
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
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-xl text-gray-400">Cargando productos...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Top header */}
      <header className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
        <h1 className="text-xl font-bold text-pink-500">Hi Cream</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            {employee.name}{" "}
            <span className="text-xs text-gray-400">
              ({employee.role === "admin" ? "Admin" : "Empleado"})
            </span>
          </span>
          <button
            onClick={() => setShowCashlogy(true)}
            className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-sm font-semibold hover:bg-emerald-100 transition-colors"
          >
            Cashlogy
          </button>
          <button
            onClick={() => {
              loadRecentOrders();
              setShowRecentOrders(true);
            }}
            className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-sm font-semibold hover:bg-blue-100 transition-colors"
          >
            Comandes
          </button>
          {employee.role === "admin" && (
            <>
              <a
                href="/admin/products"
                className="px-3 py-1.5 rounded-lg bg-purple-50 text-purple-600 text-sm font-semibold hover:bg-purple-100 transition-colors"
              >
                Productes
              </a>
              <button
                onClick={() => setShowCashClosing(true)}
                className="px-3 py-1.5 rounded-lg bg-orange-100 text-orange-700 text-sm font-semibold hover:bg-orange-200 transition-colors"
              >
                Tancar caixa
              </button>
            </>
          )}
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm hover:bg-gray-200 transition-colors"
          >
            Canviar empleat
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Product catalog — 70% */}
        <div className="flex-[7] min-w-0">
          <ProductGrid
            products={products}
            categories={categories}
            onAddToCart={(p) => dispatch({ type: "ADD", product: p })}
          />
        </div>

        {/* Cart — 30% */}
        <div className="flex-[3] min-w-[320px] max-w-[420px]">
          <Cart
            items={cart}
            onUpdateQty={(productId, delta) =>
              dispatch({ type: "UPDATE_QTY", productId, delta })
            }
            onRemove={(productId) =>
              dispatch({ type: "REMOVE", productId })
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-800">Comandes d&apos;avui</h3>
              <div className="flex gap-2">
                <a
                  href="/admin/orders"
                  className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200"
                >
                  Veure tot
                </a>
                <button
                  onClick={() => setShowRecentOrders(false)}
                  className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 text-lg flex items-center justify-center"
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
                      className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
                        order.status === "cancelled" ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-gray-800">{order.order_number}</span>
                        {order.table_number && (
                          <span className="px-1.5 py-0.5 bg-pink-100 text-pink-600 rounded text-xs font-semibold">
                            T{order.table_number}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          order.status === "cancelled" ? "bg-red-100 text-red-700"
                          : order.status === "completed" ? "bg-green-100 text-green-700"
                          : order.status === "ready" ? "bg-blue-100 text-blue-700"
                          : order.status === "preparing" ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-200 text-gray-600"
                        }`}>
                          {order.status === "cancelled" ? "Anul·lat"
                          : order.status === "completed" ? "Completat"
                          : order.status === "ready" ? "Llest"
                          : order.status === "preparing" ? "Preparant"
                          : "Pendent"}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(order.created_at).toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-bold ${order.status === "cancelled" ? "text-gray-400 line-through" : "text-gray-800"}`}>
                          {Number(order.total).toFixed(2)}€
                        </span>
                        {order.status !== "cancelled" && (
                          <button
                            onClick={() => setCancellingId(order.id)}
                            className="px-2.5 py-1 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors"
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-800 mb-3">Anul·lar comanda?</h3>
            <select
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 text-sm"
            >
              {POS_CANCEL_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => { setCancellingId(null); setCancelReason("client"); }}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm"
              >
                Tornar
              </button>
              <button
                onClick={handleCancelOrder}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm"
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
