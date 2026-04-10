"use client";

import { Product, Category } from "@/types/pos";
import { useMemo, useState } from "react";

interface ProductGridProps {
  products: Product[];
  categories: Category[];
  onAddToCart: (product: Product) => void;
}

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export default function ProductGrid({
  products,
  categories,
  onAddToCart,
}: ProductGridProps) {
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [flashId, setFlashId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    let list = products;
    if (activeCategory) {
      list = list.filter((p) => p.category_id === activeCategory);
    }
    if (search.trim()) {
      const q = normalize(search.trim());
      list = list.filter((p) => normalize(p.name).includes(q));
    }
    return list;
  }, [products, activeCategory, search]);

  const handleAdd = (product: Product) => {
    onAddToCart(product);
    setFlashId(product.id);
    setTimeout(() => setFlashId((curr) => (curr === product.id ? null : curr)), 400);
  };

  // Category counts
  const countByCategory = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of products) {
      map.set(p.category_id, (map.get(p.category_id) || 0) + 1);
    }
    return map;
  }, [products]);

  return (
    <div className="flex h-full">
      {/* Category sidebar */}
      <aside className="w-36 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
        <button
          onClick={() => setActiveCategory(null)}
          className={`w-full text-left px-3 py-3 border-b border-gray-100 transition-colors ${
            activeCategory === null
              ? "bg-gray-800 text-white font-bold"
              : "hover:bg-gray-50 text-gray-700 font-semibold"
          }`}
        >
          <div className="text-sm">Tots</div>
          <div className={`text-xs ${activeCategory === null ? "text-gray-300" : "text-gray-400"}`}>
            {products.length}
          </div>
        </button>
        {categories.map((cat) => {
          const active = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className="w-full text-left px-3 py-3 border-b border-gray-100 transition-all"
              style={{
                backgroundColor: active ? cat.color : "white",
                color: active ? "white" : "#374151",
                borderLeft: `4px solid ${cat.color}`,
              }}
            >
              <div className="text-sm font-bold leading-tight">{cat.name}</div>
              <div
                className="text-xs mt-0.5"
                style={{ color: active ? "rgba(255,255,255,0.8)" : "#9CA3AF" }}
              >
                {countByCategory.get(cat.id) || 0}
              </div>
            </button>
          );
        })}
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search bar */}
        <div className="p-3 border-b border-gray-100 bg-white flex-shrink-0">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cercar producte..."
              className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 focus:bg-white"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
              &#128269;
            </span>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-200"
              >
                &#10005;
              </button>
            )}
          </div>
          {search && (
            <p className="text-xs text-gray-500 mt-1.5">
              {filtered.length} resultat{filtered.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <p className="text-4xl mb-2">&#128269;</p>
                <p className="text-lg font-semibold">Cap producte</p>
                {search && (
                  <p className="text-sm mt-1">Prova amb un altre text</p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {filtered.map((product) => {
                const color = product.category_color || "#6B7280";
                const isFlashing = flashId === product.id;
                return (
                  <button
                    key={product.id}
                    onClick={() => handleAdd(product)}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-xl border-2 active:scale-95 transition-all min-h-[90px] ${
                      isFlashing
                        ? "border-green-500 scale-95"
                        : "border-transparent hover:border-gray-300 hover:shadow-md"
                    }`}
                    style={{
                      backgroundColor: isFlashing ? "#D1FAE5" : hexToRgba(color, 0.12),
                    }}
                  >
                    <span className="text-sm font-bold text-gray-800 text-center leading-tight line-clamp-2">
                      {product.name}
                    </span>
                    <span
                      className="mt-1.5 text-base font-black"
                      style={{ color }}
                    >
                      {Number(product.price).toFixed(2)}&euro;
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
