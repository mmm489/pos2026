"use client";

import { Product, Category } from "@/types/pos";
import { useMemo, useRef, useState } from "react";

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
    <div className="flex h-full flex-col bg-[#0f172a]">
      {/* Top bar — search + breadcrumb */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-white/10 bg-slate-950/60 px-5 py-4 shadow-2xl shadow-black/10 backdrop-blur">
        {showProducts && !isSearching && (
          <button
            onClick={() => setSelectedCategory(null)}
            className="flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-slate-200 transition-colors hover:bg-white/15 active:bg-white/20"
            aria-label="Tornar a categories"
          >
            <span className="text-lg leading-none">&#8592;</span>
            <span>Categories</span>
          </button>
        )}

        {selectedCategory && !isSearching && (
          <>
            <span className="text-slate-600">/</span>
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: selectedCategory.color }}
              />
              <h2 className="text-lg font-black text-white">{selectedCategory.name}</h2>
              <span className="text-sm text-slate-500">
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
            className="w-full rounded-xl border border-white/10 bg-white/10 py-2.5 pl-10 pr-10 text-sm font-medium text-white outline-none transition-all placeholder:text-slate-500 focus:border-sky-300/40 focus:bg-white/15 focus:ring-2 focus:ring-sky-300/10"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-500">
            &#128269;
          </span>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-white/15 hover:text-slate-200"
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
  const cardClass =
    "group flex min-h-[156px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#27272A] px-4 py-5 text-center shadow-[0_18px_50px_rgba(0,0,0,0.22)] transition-all duration-200 hover:-translate-y-1 hover:border-sky-300/35 hover:bg-[#2f2f33] hover:shadow-[0_24px_65px_rgba(0,0,0,0.34)] active:scale-[0.98]";

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {/* "Tots" tile */}
      <button
        onClick={onSelectAll}
        className={cardClass}
      >
        <CategoryGlyph />
        <span className="mt-4 text-base font-black leading-tight text-white">
          Tots els productes
        </span>
        <span className="mt-1 text-sm font-semibold text-zinc-400">{totalProducts}</span>
      </button>

      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat)}
          className={cardClass}
        >
          <CategoryGlyph color={cat.color} />
          <span className="mt-4 text-base font-black leading-tight text-white">
            {cat.name}
          </span>
          <span className="mt-1 text-sm font-semibold text-zinc-400">
            {counts.get(cat.id) || 0} producte{(counts.get(cat.id) || 0) !== 1 ? "s" : ""}
          </span>
        </button>
      ))}
    </div>
  );
}

function CategoryGlyph({ color = "#38bdf8" }: { color?: string }) {
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/8 ring-1 ring-white/10 transition-colors group-hover:bg-white/12">
      <svg
        className="h-6 w-6"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M5 8.5C5 6.57 6.57 5 8.5 5h7C17.43 5 19 6.57 19 8.5v7c0 1.93-1.57 3.5-3.5 3.5h-7A3.5 3.5 0 0 1 5 15.5v-7Z"
          stroke={color}
          strokeWidth="1.8"
        />
        <path
          d="M9 9h6M9 12h6M9 15h3.5"
          stroke={color}
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
    </span>
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
      <div className="flex h-full items-center justify-center text-slate-500">
        <div className="text-center">
          <p className="mb-3 text-5xl">&#128269;</p>
          <p className="text-lg font-bold">Cap producte</p>
          {isSearching && (
            <p className="mt-1 text-sm">Prova amb un altre text</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
  // Long-press detection. Refs survive re-renders so the timer started in
  // mousedown is the same one cleared in mouseup. Plain `let` variables would
  // be reset to null/false on every render and the cleanup wouldn't fire,
  // making every short tap also trigger a long-press.
  const [pressing, setPressing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedLongPressRef = useRef(false);

  const start = () => {
    if (!onLongPress) return;
    firedLongPressRef.current = false;
    setPressing(true);
    timerRef.current = setTimeout(() => {
      firedLongPressRef.current = true;
      setPressing(false);
      onLongPress(product);
    }, LONG_PRESS_MS);
  };
  const cancel = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPressing(false);
  };
  const handleClick = () => {
    if (firedLongPressRef.current) {
      // The long-press already fired the modifiers modal — swallow this click.
      firedLongPressRef.current = false;
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
      className={`group relative flex min-h-[112px] flex-col overflow-hidden rounded-2xl border bg-[#27272A] shadow-[0_14px_40px_rgba(0,0,0,0.2)] transition-all active:scale-[0.97] ${
        isFlashing
          ? "border-emerald-500 ring-2 ring-emerald-200"
          : pressing
          ? "border-rose-400 ring-2 ring-rose-200"
          : "border-white/10 hover:-translate-y-0.5 hover:border-sky-300/30 hover:shadow-[0_20px_55px_rgba(0,0,0,0.3)]"
      }`}
    >
      <div
        className="h-1.5"
        style={{ backgroundColor: isFlashing ? "#10B981" : color }}
      />
      <div className="flex flex-1 flex-col justify-between p-3">
        <span className="line-clamp-2 text-left text-sm font-black leading-snug text-white">
          {product.name}
        </span>
        <div className="mt-2 flex items-baseline justify-between">
          <span
            className="text-lg font-black tabular-nums"
            style={{ color: isFlashing ? "#10B981" : "#F8FAFC" }}
          >
            {Number(product.price).toFixed(2)}
            <span className="text-sm font-bold ml-0.5">€</span>
          </span>
          {isFlashing && (
            <span className="text-xl leading-none text-emerald-600">&#10003;</span>
          )}
        </div>
      </div>
      {onLongPress && (
        <span
          className="pointer-events-none absolute right-2 top-1.5 select-none text-[10px] text-slate-500 group-hover:text-slate-300"
          aria-hidden
        >
          +
        </span>
      )}
    </button>
  );
}
