"use client";

import { Product, Category } from "@/types/pos";
import { resolveColor, sentenceCase, textColorOn, titleCase } from "@/lib/palette";
import type { CSSProperties } from "react";
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

function tileStyle(color: string | null | undefined, selected = false): CSSProperties {
  const background = color || "#9A9A9A";
  return {
    backgroundColor: background,
    borderColor: selected ? "#20242a" : "rgba(0, 0, 0, 0.14)",
    borderWidth: selected ? 3 : 1,
    color: textColorOn(background),
  };
}

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
    <div className="flex h-full flex-col bg-[#f5f4ef] text-[#241f1c]">
      {/* Top bar — breadcrumb */}
      {selectedCategory && (
        <div className="flex flex-shrink-0 items-center gap-4 border-b border-[#ded6c8] bg-[#faf9f6] px-4 py-3">
          <button
            onClick={() => setSelectedCategory(null)}
            className="flex items-center gap-2 rounded-xl border border-[#d4cbbb] bg-white px-4 py-2 text-[17px] font-medium text-[#241f1c] active:bg-[#f1eee7]"
            aria-label="Tornar a categories"
          >
            <span className="text-lg leading-none">&#8592;</span>
            <span>Categories</span>
          </button>

          <>
            <span className="text-xl text-[#8f887c]">/</span>
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: selectedCategory.color }}
              />
              <h2 className="text-2xl font-medium tracking-[0.01em] text-[#241f1c]">
                {sentenceCase(selectedCategory.name)}
              </h2>
              <span className="text-sm font-bold text-[#6f7787]">
                ({countByCategory.get(selectedCategory.id) || 0})
              </span>
            </div>
          </>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        {!showProducts ? (
          <CategoryGrid
            categories={categories}
            onSelect={setSelectedCategory}
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
  onSelect,
  onSelectAll,
}: {
  categories: Category[];
  onSelect: (cat: Category) => void;
  onSelectAll: () => void;
}) {
  const cardClass =
    "group flex min-h-[78px] flex-col items-center justify-center rounded-xl border px-4 py-3 text-center active:brightness-95";

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {/* "Tots" tile */}
      <button
        onClick={onSelectAll}
        className={cardClass}
        style={tileStyle(resolveColor({ category: "Tots els productes" }))}
      >
        <span className="line-clamp-2 max-w-full text-center text-[18px] font-medium leading-tight">
          Tots els productes
        </span>
      </button>

      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat)}
          className={cardClass}
          style={tileStyle(resolveColor({ category: cat.name }))}
        >
          <span className="line-clamp-2 max-w-full text-center text-[18px] font-medium leading-tight">
            {sentenceCase(cat.name)}
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
      <div className="flex h-full items-center justify-center text-[#6f7787]">
        <div className="text-center">
          <p className="mb-3 text-5xl">&#128269;</p>
          <p className="text-lg font-bold">Cap producte</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
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
  const color = resolveColor({
    flavor: product.name,
    category: product.category_name,
  });
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
      className={`group relative flex h-[92px] flex-col items-center justify-center overflow-hidden rounded-xl border px-3 py-3 text-center active:brightness-95 ${
        isFlashing ? "ring-2 ring-[#20242a]/40" : pressing ? "ring-2 ring-[#ba7517]/35" : ""
      }`}
      style={tileStyle(color, isFlashing)}
    >
      <span
        className={`line-clamp-2 text-center font-medium leading-[20px] ${
          product.name.length > 16 ? "text-[17px]" : "text-[19px]"
        }`}
      >
        {titleCase(product.name)}
      </span>
      {isFlashing && (
        <span className="absolute bottom-2 right-2 text-sm font-medium leading-none">&#10003;</span>
      )}
    </button>
  );
}
