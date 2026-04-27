"use client";

import { Product, Category } from "@/types/pos";
import { useMemo, useState } from "react";

interface ProductGridProps {
  products: Product[];
  categories: Category[];
  onAddToCart: (product: Product) => void;
  /** Optional: triggered on long press (~500ms) for products that allow modifiers. */
  onLongPress?: (product: Product) => void;
  /** Optional: ids of products that should NOT trigger long-press (e.g. modifier products themselves). */
  noLongPressIds?: Set<number>;
}

const LONG_PRESS_MS = 500;

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export default function ProductGrid({
  products,
  categories,
  onAddToCart,
  onLongPress,
  noLongPressIds,
}: ProductGridProps) {
  // Square-style two-step navigation: start on category overview,
  // click a category to drill into its products. Search jumps over the
  // category gate so cashiers can find anything fast.
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [search, setSearch] = useState("");
  const [flashId, setFlashId] = useState<number | null>(null);

  const isSearching = search.trim().length > 0;
  const showProducts = selectedCategory !== null || isSearching;

  const filtered = useMemo(() => {
    let list = products;
    if (selectedCategory && !isSearching) {
      list = list.filter((p) => p.category_id === selectedCategory.id);
    }
    if (isSearching) {
      const q = normalize(search.trim());
      list = list.filter((p) => normalize(p.name).includes(q));
    }
    return list;
  }, [products, selectedCategory, search, isSearching]);

  const handleAdd = (product: Product) => {
    onAddToCart(product);
    setFlashId(product.id);
    setTimeout(() => setFlashId((curr) => (curr === product.id ? null : curr)), 400);
  };

  const countByCategory = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of products) {
      map.set(p.category_id, (map.get(p.category_id) || 0) + 1);
    }
    return map;
  }, [products]);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Top bar — search + breadcrumb */}
      <div className="flex items-center gap-3 px-5 py-4 bg-white border-b border-gray-200 flex-shrink-0">
        {showProducts && !isSearching && (
          <button
            onClick={() => setSelectedCategory(null)}
            className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700 font-semibold text-sm transition-colors"
            aria-label="Tornar a categories"
          >
            <span className="text-lg leading-none">&#8592;</span>
            <span>Categories</span>
          </button>
        )}

        {selectedCategory && !isSearching && (
          <>
            <span className="text-gray-300">/</span>
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: selectedCategory.color }}
              />
              <h2 className="text-lg font-bold text-gray-800">{selectedCategory.name}</h2>
              <span className="text-sm text-gray-400">
                ({countByCategory.get(selectedCategory.id) || 0})
              </span>
            </div>
          </>
        )}

        <div className="flex-1 relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cercar producte..."
            className="w-full pl-10 pr-10 py-2.5 bg-gray-100 border border-transparent rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-800 focus:bg-white transition-all"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
            &#128269;
          </span>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-200"
              aria-label="Esborrar cerca"
            >
              &#10005;
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {!showProducts ? (
          <CategoryGrid
            categories={categories}
            counts={countByCategory}
            onSelect={setSelectedCategory}
            totalProducts={products.length}
            onSelectAll={() => {
              // Pseudo-category for "all products" — no color, no id match.
              setSelectedCategory({ id: -1, name: "Tots els productes", sort_order: 0, color: "#374151" });
            }}
          />
        ) : (
          <ProductsGrid
            products={
              selectedCategory && selectedCategory.id === -1 && !isSearching
                ? products
                : filtered
            }
            flashId={flashId}
            onAdd={handleAdd}
            onLongPress={onLongPress}
            noLongPressIds={noLongPressIds}
            isSearching={isSearching}
          />
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Category overview — Square-style large tiles
// =====================================================================

function CategoryGrid({
  categories,
  counts,
  totalProducts,
  onSelect,
  onSelectAll,
}: {
  categories: Category[];
  counts: Map<number, number>;
  totalProducts: number;
  onSelect: (cat: Category) => void;
  onSelectAll: () => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {/* "Tots" tile */}
      <button
        onClick={onSelectAll}
        className="group flex flex-col bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition-all min-h-[140px]"
      >
        <div className="h-2 bg-gray-800" />
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <span className="text-3xl mb-2">&#128722;</span>
          <span className="text-base font-bold text-gray-800 leading-tight">
            Tots els productes
          </span>
          <span className="text-sm text-gray-400 mt-1">{totalProducts}</span>
        </div>
      </button>

      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat)}
          className="group flex flex-col bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition-all min-h-[140px]"
          style={{
            // Subtle tinted background using the category color.
            backgroundColor: hexToRgba(cat.color, 0.06),
          }}
        >
          <div className="h-2" style={{ backgroundColor: cat.color }} />
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
            <span
              className="text-base font-bold leading-tight"
              style={{ color: cat.color }}
            >
              {cat.name}
            </span>
            <span className="text-sm text-gray-500 mt-1">
              {counts.get(cat.id) || 0} producte{(counts.get(cat.id) || 0) !== 1 ? "s" : ""}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

// =====================================================================
// Products grid — clean white cards with color accent
// =====================================================================

function ProductsGrid({
  products,
  flashId,
  onAdd,
  onLongPress,
  noLongPressIds,
  isSearching,
}: {
  products: Product[];
  flashId: number | null;
  onAdd: (p: Product) => void;
  onLongPress?: (p: Product) => void;
  noLongPressIds?: Set<number>;
  isSearching: boolean;
}) {
  if (products.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <p className="text-5xl mb-3">&#128269;</p>
          <p className="text-lg font-semibold">Cap producte</p>
          {isSearching && (
            <p className="text-sm mt-1">Prova amb un altre text</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          isFlashing={flashId === product.id}
          onAdd={onAdd}
          onLongPress={
            onLongPress && !noLongPressIds?.has(product.id) ? onLongPress : undefined
          }
        />
      ))}
    </div>
  );
}

function ProductCard({
  product,
  isFlashing,
  onAdd,
  onLongPress,
}: {
  product: Product;
  isFlashing: boolean;
  onAdd: (p: Product) => void;
  onLongPress?: (p: Product) => void;
}) {
  const color = product.category_color || "#6B7280";
  // Long-press detection. We track the timer + a "did long press" flag so the
  // mouseup that ends a long press doesn't ALSO fire the regular click.
  const [pressing, setPressing] = useState(false);

  // We use refs through the closure rather than useRef to keep the file flat.
  // The handlers below are stable enough for this small component.
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firedLongPress = false;

  const start = () => {
    if (!onLongPress) return;
    firedLongPress = false;
    setPressing(true);
    timer = setTimeout(() => {
      firedLongPress = true;
      setPressing(false);
      onLongPress(product);
    }, LONG_PRESS_MS);
  };
  const cancel = () => {
    if (timer) clearTimeout(timer);
    setPressing(false);
  };
  const handleClick = () => {
    if (firedLongPress) {
      // The long-press already fired the modifiers modal — swallow this click.
      firedLongPress = false;
      return;
    }
    onAdd(product);
  };

  return (
    <button
      onMouseDown={start}
      onMouseUp={cancel}
      onMouseLeave={cancel}
      onTouchStart={start}
      onTouchEnd={cancel}
      onTouchCancel={cancel}
      onClick={handleClick}
      onContextMenu={(e) => {
        // Suppress the right-click menu on long press for desktop testers.
        if (onLongPress) e.preventDefault();
      }}
      className={`group flex flex-col bg-white rounded-2xl border overflow-hidden active:scale-[0.97] transition-all min-h-[110px] relative ${
        isFlashing
          ? "border-green-500 ring-2 ring-green-200"
          : pressing
          ? "border-pink-400 ring-2 ring-pink-200"
          : "border-gray-200 hover:shadow-md hover:-translate-y-0.5"
      }`}
    >
      <div
        className="h-1.5"
        style={{ backgroundColor: isFlashing ? "#10B981" : color }}
      />
      <div className="flex-1 flex flex-col justify-between p-3">
        <span className="text-sm font-bold text-gray-800 text-left leading-snug line-clamp-2">
          {product.name}
        </span>
        <div className="flex items-baseline justify-between mt-2">
          <span
            className="text-lg font-black tabular-nums"
            style={{ color: isFlashing ? "#10B981" : "#111827" }}
          >
            {Number(product.price).toFixed(2)}
            <span className="text-sm font-bold ml-0.5">€</span>
          </span>
          {isFlashing && (
            <span className="text-green-600 text-xl leading-none">&#10003;</span>
          )}
        </div>
      </div>
      {onLongPress && (
        <span
          className="absolute top-1.5 right-2 text-[10px] text-gray-300 group-hover:text-gray-400 select-none pointer-events-none"
          aria-hidden
        >
          +
        </span>
      )}
    </button>
  );
}
