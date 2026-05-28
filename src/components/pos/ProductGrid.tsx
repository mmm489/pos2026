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

export default function ProductGrid({
  products,
  categories,
  onAddToCart,
  onLongPress,
  noLongPressIds,
}: ProductGridProps) {
  // Square-style two-step navigation: start on category overview,
  // click a category to drill into its products.
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);

  const showProducts = selectedCategory !== null;

  const filtered = useMemo(() => {
    if (!selectedCategory) return [];
    if (selectedCategory.id === -1) return products;
    return products.filter((p) => p.category_id === selectedCategory.id);
  }, [products, selectedCategory]);

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
    <div className="flex h-full flex-col bg-[#11131a]">
      {/* Top bar — breadcrumb */}
      {selectedCategory && (
        <div className="flex flex-shrink-0 items-center gap-4 border-b border-[#434654]/60 bg-[#11131a] px-4 py-4">
          <button
            onClick={() => setSelectedCategory(null)}
            className="flex items-center gap-2 rounded-full bg-[#32343c] px-4 py-2 text-[17px] font-medium text-[#e1e2ec] transition-colors hover:bg-[#3a3d46] active:bg-[#282a31]"
            aria-label="Tornar a categories"
          >
            <span className="text-lg leading-none">&#8592;</span>
            <span>Categories</span>
          </button>

          <>
            <span className="text-xl text-[#5d6070]">/</span>
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: selectedCategory.color }}
              />
              <h2 className="text-2xl font-bold tracking-[0.01em] text-[#e1e2ec]">{selectedCategory.name}</h2>
              <span className="text-sm font-semibold text-[#c3c6d6]">
                ({countByCategory.get(selectedCategory.id) || 0})
              </span>
            </div>
          </>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
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
            products={filtered}
            flashId={flashId}
            onAdd={handleAdd}
            onLongPress={onLongPress}
            noLongPressIds={noLongPressIds}
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
    "group flex min-h-[92px] flex-col items-center justify-center rounded-lg border border-[#434654]/70 bg-[#282a31] px-4 py-3 text-center shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition-colors duration-150 hover:border-[#0052cc]/70 hover:bg-[#32343c] active:scale-[0.98]";

  return (
    <div className="grid grid-cols-4 gap-3">
      {/* "Tots" tile */}
      <button
        onClick={onSelectAll}
        className={cardClass}
      >
        <span className="line-clamp-2 max-w-full text-[16px] font-bold leading-tight text-[#e1e2ec]">
          Tots els productes
        </span>
        <span className="mt-1 text-xs font-medium text-[#c3c6d6]">{totalProducts}</span>
      </button>

      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat)}
          className={cardClass}
        >
          <span className="line-clamp-2 max-w-full text-[16px] font-bold leading-tight text-[#e1e2ec]">
            {cat.name}
          </span>
          <span className="mt-1 text-xs font-medium text-[#c3c6d6]">
            {counts.get(cat.id) || 0} producte{(counts.get(cat.id) || 0) !== 1 ? "s" : ""}
          </span>
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
}: {
  products: Product[];
  flashId: number | null;
  onAdd: (p: Product) => void;
  onLongPress?: (p: Product) => void;
  noLongPressIds?: Set<number>;
}) {
  if (products.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[#8d90a0]">
        <div className="text-center">
          <p className="mb-3 text-5xl">&#128269;</p>
          <p className="text-lg font-bold">Cap producte</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
      className={`group relative flex h-[120px] flex-col overflow-hidden rounded-lg border bg-[#282a31] shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition-colors active:scale-[0.98] ${
        isFlashing
          ? "border-[#41dfa5] ring-2 ring-[#41dfa5]/30"
          : pressing
          ? "border-[#ffb4ab] ring-2 ring-[#ffb4ab]/25"
          : "border-[#434654]/70 hover:border-[#0052cc]/70 hover:bg-[#32343c]"
      }`}
    >
      <div
        className="h-[3px]"
        style={{ backgroundColor: isFlashing ? "#41dfa5" : color }}
      />
      <div className="flex flex-1 flex-col justify-between p-3">
        <span className="line-clamp-2 pr-6 text-left text-[12px] font-bold uppercase leading-[16px] text-[#e1e2ec]">
          {product.name}
        </span>
        <div className="mt-2 flex items-baseline justify-between">
          <span
            className="text-[26px] font-black leading-8 tabular-nums"
            style={{ color: isFlashing ? "#41dfa5" : "#e1e2ec" }}
          >
            {Number(product.price).toFixed(2)}
            <span className="ml-1 text-[14px] font-bold">&euro;</span>
          </span>
          {isFlashing && (
            <span className="text-xl leading-none text-[#41dfa5]">&#10003;</span>
          )}
        </div>
      </div>
      <span
        className="pointer-events-none absolute right-3 top-3 select-none text-[22px] font-light leading-none text-[#8d90a0] group-hover:text-[#c3c6d6]"
        aria-hidden
      >
        +
      </span>
    </button>
  );
}
