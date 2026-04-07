"use client";

import { useEffect, useReducer, useState } from "react";
import { Product, Category, CartItem } from "@/types/pos";
import ProductGrid from "@/components/pos/ProductGrid";
import Cart from "@/components/pos/Cart";
import CheckoutModal from "@/components/pos/CheckoutModal";
import PinLogin from "@/components/pos/PinLogin";
import CashClosingModal from "@/components/pos/CashClosingModal";
import { MOCK_PRODUCTS, MOCK_CATEGORIES } from "@/lib/mock-data";

type CartAction =
  | { type: "ADD"; product: Product }
  | { type: "UPDATE_QTY"; productId: number; delta: number }
  | { type: "REMOVE"; productId: number }
  | { type: "CLEAR" };

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
  const [loading, setLoading] = useState(true);

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
          <a
            href="/admin/orders"
            className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-sm font-semibold hover:bg-blue-100 transition-colors"
          >
            Comandes
          </a>
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
    </div>
  );
}
