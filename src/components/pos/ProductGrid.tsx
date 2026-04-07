"use client";

import { Product, Category } from "@/types/pos";
import { useState } from "react";

interface ProductGridProps {
  products: Product[];
  categories: Category[];
  onAddToCart: (product: Product) => void;
}

export default function ProductGrid({
  products,
  categories,
  onAddToCart,
}: ProductGridProps) {
  const [activeCategory, setActiveCategory] = useState<number | null>(null);

  const filtered = activeCategory
    ? products.filter((p) => p.category_id === activeCategory)
    : products;

  return (
    <div className="flex flex-col h-full">
      {/* Category grid */}
      <div className="flex flex-wrap gap-1.5 p-3 flex-shrink-0">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeCategory === null
              ? "bg-gray-800 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Tots
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{
              backgroundColor:
                activeCategory === cat.id ? cat.color : `${cat.color}20`,
              color: activeCategory === cat.id ? "white" : cat.color,
            }}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((product) => (
            <button
              key={product.id}
              onClick={() => onAddToCart(product)}
              className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white border-2 border-gray-100 hover:border-gray-300 hover:shadow-md active:scale-95 transition-all min-h-[120px]"
              style={{ borderLeftColor: product.category_color, borderLeftWidth: 4 }}
            >
              <span className="text-base font-semibold text-gray-800 text-center leading-tight">
                {product.name}
              </span>
              <span
                className="mt-2 text-lg font-bold"
                style={{ color: product.category_color }}
              >
                {Number(product.price).toFixed(2)} &euro;
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
