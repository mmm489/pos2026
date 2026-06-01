"use client";

import { Category, Product } from "@/types/pos";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";

interface PricedModifierSelection {
  product: Product;
  qty: number;
  unitPrice: number;
  included: boolean;
}

interface ModifiersModalProps {
  baseProduct: Product;
  modifierGroupName?: string | null;
  modifierProducts: Product[];
  modifierCategories: Category[];
  includedCount?: number | null;
  extraPrice?: number | null;
  onConfirm: (selections: PricedModifierSelection[], note: string | null) => void;
  onCancel: () => void;
}

function formatPrice(value: number) {
  return `${value.toFixed(2)} EUR`;
}

function isFlavorCategoryName(name: string) {
  return name.toLowerCase().includes("sabor");
}

function isSingleChoiceExtraCategoryName(name: string) {
  return name.toLowerCase().includes("extres batut");
}

function isIceCreamBallProductName(name: string) {
  const lower = name.toLowerCase();
  return lower.includes("bola") && (lower.includes("gelat") || lower.includes("helado"));
}

function hexToRgb(hex: string | null | undefined) {
  const clean = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return { r: 65, g: 223, b: 165 };
  }
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgba(hex: string | null | undefined, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function toppingCardStyle(color: string, selected: boolean): CSSProperties {
  return {
    background: selected
      ? `linear-gradient(135deg, ${rgba(color, 0.34)}, ${rgba(color, 0.18)} 42%, rgba(40, 42, 49, 0.96))`
      : `linear-gradient(135deg, ${rgba(color, 0.2)}, ${rgba(color, 0.08)} 42%, rgba(40, 42, 49, 0.94))`,
    borderColor: selected ? rgba(color, 0.92) : rgba(color, 0.44),
    boxShadow: selected
      ? `0 0 0 1px ${rgba(color, 0.22)}, 0 8px 24px rgba(0, 0, 0, 0.22)`
      : `0 6px 18px rgba(0, 0, 0, 0.16), inset 0 1px 0 ${rgba(color, 0.12)}`,
  };
}

function toppingActionStyle(color: string, selected: boolean): CSSProperties {
  return {
    backgroundColor: selected ? rgba(color, 0.28) : rgba(color, 0.16),
    borderColor: rgba(color, selected ? 0.46 : 0.24),
  };
}

export default function ModifiersModal({
  baseProduct,
  modifierGroupName,
  modifierProducts,
  modifierCategories,
  includedCount,
  extraPrice,
  onConfirm,
  onCancel,
}: ModifiersModalProps) {
  const [selections, setSelections] = useState<Map<number, number>>(new Map());
  const [iceCreamBallFlavors, setIceCreamBallFlavors] = useState<Map<number, string>>(new Map());
  const [flavorPickerFor, setFlavorPickerFor] = useState<Product | null>(null);
  const [note, setNote] = useState("");
  const includedLimit = Math.max(0, Math.floor(Number(includedCount ?? 0)));
  const extraUnitPrice = Math.max(0, Number(extraPrice ?? 0));

  const productById = useMemo(
    () => new Map(modifierProducts.map((product) => [product.id, product])),
    [modifierProducts]
  );

  const flavorCategoryIds = useMemo(
    () =>
      new Set(
        modifierCategories
          .filter((category) => isFlavorCategoryName(category.name))
          .map((category) => category.id)
      ),
    [modifierCategories]
  );
  const singleChoiceExtraCategoryIds = useMemo(
    () =>
      new Set(
        modifierCategories
          .filter((category) => isSingleChoiceExtraCategoryName(category.name))
          .map((category) => category.id)
      ),
    [modifierCategories]
  );
  const hasNestedFlavorPicker = useMemo(
    () =>
      flavorCategoryIds.size > 0 &&
      modifierProducts.some((product) => isIceCreamBallProductName(product.name)),
    [flavorCategoryIds, modifierProducts]
  );
  const hasFlavorSection = flavorCategoryIds.size > 0 && !hasNestedFlavorPicker;
  const displayedModifierCategories = useMemo(
    () =>
      hasNestedFlavorPicker
        ? modifierCategories.filter((category) => !flavorCategoryIds.has(category.id))
        : modifierCategories,
    [flavorCategoryIds, hasNestedFlavorPicker, modifierCategories]
  );
  const nestedFlavorProducts = useMemo(
    () =>
      hasNestedFlavorPicker
        ? modifierProducts.filter((product) => flavorCategoryIds.has(product.category_id))
        : [],
    [flavorCategoryIds, hasNestedFlavorPicker, modifierProducts]
  );
  const hasPaidSection = displayedModifierCategories.some(
    (category) => !flavorCategoryIds.has(category.id)
  );

  const grouped = useMemo(() => {
    const map = new Map<number, Product[]>();
    for (const product of modifierProducts) {
      const list = map.get(product.category_id) || [];
      list.push(product);
      map.set(product.category_id, list);
    }
    return map;
  }, [modifierProducts]);

  const setQty = (productId: number, qty: number) => {
    setSelections((prev) => {
      const product = productById.get(productId);
      const isFlavor = Boolean(product && flavorCategoryIds.has(product.category_id));
      const isSingleChoiceExtra = Boolean(
        product &&
          (singleChoiceExtraCategoryIds.has(product.category_id) ||
            isIceCreamBallProductName(product.name))
      );
      const normalizedQty =
        isFlavor || isSingleChoiceExtra ? Math.min(Math.max(qty, 0), 1) : qty;

      if (isFlavor && normalizedQty > (prev.get(productId) || 0)) {
        const currentFlavorQty = Array.from(prev.entries()).reduce((sum, [id, itemQty]) => {
          if (id === productId) return sum;
          const candidate = productById.get(id);
          return candidate && flavorCategoryIds.has(candidate.category_id) ? sum + itemQty : sum;
        }, 0);
        if (currentFlavorQty >= includedLimit) return prev;
      }

      const next = new Map(prev);
      if (normalizedQty <= 0) next.delete(productId);
      else next.set(productId, normalizedQty);
      return next;
    });
  };

  const selectedQty = useMemo(
    () => Array.from(selections.values()).reduce((sum, qty) => sum + qty, 0),
    [selections]
  );

  const selectedFlavorQty = useMemo(
    () =>
      Array.from(selections.entries()).reduce((sum, [id, qty]) => {
        const product = productById.get(id);
        return product && flavorCategoryIds.has(product.category_id) ? sum + qty : sum;
      }, 0),
    [selections, productById, flavorCategoryIds]
  );

  const pricingByProduct = useMemo(() => {
    const map = new Map<number, { included: number; extra: number }>();
    let consumedIncluded = 0;
    const entries = Array.from(selections.entries());
    const orderedEntries = hasNestedFlavorPicker
      ? [...entries].sort(([leftId], [rightId]) => {
          const left = productById.get(leftId);
          const right = productById.get(rightId);
          return (
            Number(Boolean(left && isIceCreamBallProductName(left.name))) -
            Number(Boolean(right && isIceCreamBallProductName(right.name)))
          );
        })
      : entries;

    for (const [id, qty] of orderedEntries) {
      const product = productById.get(id);
      if (hasFlavorSection && product) {
        if (flavorCategoryIds.has(product.category_id)) {
          map.set(id, { included: qty, extra: 0 });
        } else {
          map.set(id, { included: 0, extra: qty });
        }
        continue;
      }

      let included = 0;
      let extra = 0;
      for (let index = 0; index < qty; index += 1) {
        if (consumedIncluded < includedLimit) included += 1;
        else extra += 1;
        consumedIncluded += 1;
      }
      map.set(id, { included, extra });
    }

    return map;
  }, [
    selections,
    productById,
    hasNestedFlavorPicker,
    hasFlavorSection,
    flavorCategoryIds,
    includedLimit,
  ]);

  const pricedSelections = useMemo(() => {
    const groupedSelections = new Map<string, PricedModifierSelection>();
    let consumedIncluded = 0;

    const addPricedSelection = (
      product: Product,
      qty: number,
      unitPrice: number,
      included: boolean,
      displayName?: string
    ) => {
      const pricedProduct = displayName ? { ...product, name: displayName } : product;
      const key = `${product.id}-${unitPrice}-${included ? "included" : "extra"}-${displayName ?? product.name}`;
      const current = groupedSelections.get(key);
      if (current) current.qty += qty;
      else groupedSelections.set(key, { product: pricedProduct, qty, unitPrice, included });
    };

    const entries = Array.from(selections.entries());
    const orderedEntries = hasNestedFlavorPicker
      ? [...entries].sort(([leftId], [rightId]) => {
          const left = productById.get(leftId);
          const right = productById.get(rightId);
          return (
            Number(Boolean(left && isIceCreamBallProductName(left.name))) -
            Number(Boolean(right && isIceCreamBallProductName(right.name)))
          );
        })
      : entries;

    for (const [id, qty] of orderedEntries) {
      const product = productById.get(id);
      if (!product || qty <= 0) continue;

      if (hasFlavorSection) {
        if (flavorCategoryIds.has(product.category_id)) {
          addPricedSelection(product, qty, 0, true);
        } else {
          addPricedSelection(product, qty, extraUnitPrice, false);
        }
        continue;
      }

      for (let index = 0; index < qty; index += 1) {
        const included = consumedIncluded < includedLimit;
        const isIceCreamBall = isIceCreamBallProductName(product.name);
        const unitPrice = isIceCreamBall
          ? included
            ? extraUnitPrice
            : extraUnitPrice * 2
          : included
            ? 0
            : extraUnitPrice;
        const selectedFlavor = iceCreamBallFlavors.get(product.id);
        const displayName =
          isIceCreamBall && selectedFlavor ? `${product.name} ${selectedFlavor}` : undefined;
        addPricedSelection(product, 1, unitPrice, included, displayName);
        consumedIncluded += 1;
      }
    }

    return Array.from(groupedSelections.values());
  }, [
    selections,
    productById,
    hasNestedFlavorPicker,
    hasFlavorSection,
    flavorCategoryIds,
    includedLimit,
    extraUnitPrice,
    iceCreamBallFlavors,
  ]);

  const totalExtra = useMemo(
    () => pricedSelections.reduce((sum, item) => sum + item.unitPrice * item.qty, 0),
    [pricedSelections]
  );

  const handleConfirm = () => {
    for (const [id, qty] of Array.from(selections.entries())) {
      const product = productById.get(id);
      if (product && qty > 0 && isIceCreamBallProductName(product.name) && !iceCreamBallFlavors.get(id)) {
        setFlavorPickerFor(product);
        return;
      }
    }
    onConfirm(pricedSelections, note.trim() || null);
  };

  const removeSelection = (productId: number, nextQty: number) => {
    setQty(productId, nextQty);
    if (nextQty <= 0) {
      setIceCreamBallFlavors((prev) => {
        if (!prev.has(productId)) return prev;
        const next = new Map(prev);
        next.delete(productId);
        return next;
      });
    }
  };

  const chooseIceCreamBallFlavor = (flavorName: string) => {
    if (!flavorPickerFor) return;
    setQty(flavorPickerFor.id, 1);
    setIceCreamBallFlavors((prev) => {
      const next = new Map(prev);
      next.set(flavorPickerFor.id, flavorName);
      return next;
    });
    setFlavorPickerFor(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-[#434654] bg-[#11131a] shadow-2xl shadow-black/40">
        <div className="flex items-start justify-between border-b border-[#434654] bg-[#171922] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8d90a0]">
              Personalitzar
            </p>
            <h2 className="mt-1 truncate text-[26px] font-black uppercase leading-8 text-[#e1e2ec]">
              {baseProduct.name}
            </h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-[#c3c6d6]">
              {modifierGroupName && <span>{modifierGroupName}</span>}
              <span>Base {formatPrice(Number(baseProduct.price))}</span>
              {hasFlavorSection ? (
                <span className="font-black text-[#41dfa5]">
                  Max {includedLimit} sabor{includedLimit === 1 ? "" : "s"} gratis
                  {hasPaidSection ? `, extres +${formatPrice(extraUnitPrice)}` : ""}
                </span>
              ) : (
                <span className="font-black text-[#41dfa5]">
                  {includedLimit} gratis, extres +{formatPrice(extraUnitPrice)}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onCancel}
            className="ml-4 flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[#282a31] text-[#c3c6d6] transition-colors hover:bg-[#32343c]"
            aria-label="Tancar"
          >
            <span className="text-lg">&#10005;</span>
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {modifierProducts.length === 0 ? (
            <p className="py-8 text-center text-[#8d90a0]">
              No hi ha extres configurats per aquest producte.
            </p>
          ) : (
            displayedModifierCategories.map((category) => {
              const items = grouped.get(category.id);
              if (!items || items.length === 0) return null;

              return (
                <section key={category.id}>
                  <h3 className="mb-2 flex items-center gap-2 text-[13px] font-black uppercase tracking-[0.05em] text-[#e1e2ec]">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    {category.name}
                  </h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {items.map((product) => {
                      const qty = selections.get(product.id) || 0;
                      const isSelected = qty > 0;
                      const isFlavor = flavorCategoryIds.has(product.category_id);
                      const isIceCreamBall = isIceCreamBallProductName(product.name);
                      const isSingleChoiceExtra = singleChoiceExtraCategoryIds.has(
                        product.category_id
                      ) || isIceCreamBall;
                      const selectedIceCreamBallFlavor = iceCreamBallFlavors.get(product.id);
                      const selectedPricing = pricingByProduct.get(product.id);
                      const nextIceCreamBallPrice =
                        (selectedPricing?.included ?? 0) > 0 || selectedQty < includedLimit
                          ? extraUnitPrice
                          : extraUnitPrice * 2;
                      const iceCreamBallStatus = isSelected
                        ? selectedIceCreamBallFlavor
                          ? `${selectedIceCreamBallFlavor} +${formatPrice(nextIceCreamBallPrice)}`
                          : `Escull sabor +${formatPrice(nextIceCreamBallPrice)}`
                        : `+${formatPrice(selectedQty < includedLimit ? extraUnitPrice : extraUnitPrice * 2)} sabor`;
                      const regularSelectedStatus = [
                        selectedPricing?.included ? `${selectedPricing.included} gratis` : null,
                        selectedPricing?.extra ? `${selectedPricing.extra} extra` : null,
                      ]
                        .filter(Boolean)
                        .join(" + ");
                      const maxFlavorReached =
                        hasFlavorSection && isFlavor && !isSelected && selectedFlavorQty >= includedLimit;
                      const status =
                        isIceCreamBall
                          ? iceCreamBallStatus
                          : hasFlavorSection && isFlavor
                          ? isSelected
                            ? "Sabor escollit"
                            : maxFlavorReached
                              ? "Max sabors"
                              : "Sabor gratis"
                          : hasFlavorSection
                            ? isSingleChoiceExtra && isSelected
                              ? "Afegit"
                              : `+${formatPrice(extraUnitPrice)}`
                            : isSelected
                              ? regularSelectedStatus
                              : selectedQty < includedLimit
                                ? "Gratis ara"
                                : `+${formatPrice(extraUnitPrice)}`;
                      const statusColor =
                        isIceCreamBall || (hasFlavorSection && !isFlavor)
                          ? "text-[#ffb86b]"
                          : isSelected || (isFlavor ? !maxFlavorReached : selectedQty < includedLimit)
                            ? "text-[#c7f9df]"
                            : "text-[#ffb86b]";

                      return (
                        <div
                          key={product.id}
                          className={`flex min-h-[68px] items-center justify-between rounded border px-3 py-2 transition-transform duration-150 hover:-translate-y-0.5 ${
                            maxFlavorReached ? "opacity-50" : ""
                          }`}
                          style={toppingCardStyle(category.color, isSelected)}
                        >
                          <button
                            onClick={() => {
                              if (maxFlavorReached) return;
                              if (isIceCreamBall) {
                                if (!isSelected) setQty(product.id, 1);
                                setFlavorPickerFor(product);
                                return;
                              }
                              setQty(product.id, qty + 1);
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="line-clamp-2 pr-2 text-[13px] font-black uppercase leading-[15px] text-[#e1e2ec]">
                              {product.name}
                            </p>
                            <p
                              className={`mt-1 text-[11px] font-bold leading-3 ${statusColor}`}
                            >
                              {status}
                            </p>
                          </button>

                          {isSelected ? (
                            <div className="ml-2 flex shrink-0 items-center gap-1">
                              <button
                                onClick={() => removeSelection(product.id, qty - 1)}
                                className="flex h-7 w-7 items-center justify-center rounded border text-base font-black text-[#e1e2ec] transition-colors hover:bg-white/10"
                                style={toppingActionStyle(category.color, true)}
                                aria-label="Restar"
                              >
                                &#8722;
                              </button>
                              <span className="w-5 text-center text-sm font-black text-[#41dfa5]">
                                {qty}
                              </span>
                              {!isSingleChoiceExtra && (
                                <button
                                  onClick={() => setQty(product.id, qty + 1)}
                                  className="flex h-7 w-7 items-center justify-center rounded border text-base font-black text-[#e1e2ec] transition-colors hover:bg-white/10"
                                  style={toppingActionStyle(category.color, true)}
                                  aria-label="Sumar"
                                >
                                  +
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                if (maxFlavorReached) return;
                                if (isIceCreamBall) {
                                  setQty(product.id, 1);
                                  setFlavorPickerFor(product);
                                  return;
                                }
                                setQty(product.id, 1);
                              }}
                              disabled={maxFlavorReached}
                              className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded border text-base font-black text-[#e1e2ec] transition-colors hover:bg-white/10"
                              style={toppingActionStyle(category.color, false)}
                              aria-label="Afegir"
                            >
                              +
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}

          <div>
            <label className="mb-2 block text-sm font-bold text-[#c3c6d6]">
              Nota especial
            </label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Sense lactosa, sense sucre, etc."
              className="h-16 w-full resize-none rounded border border-[#434654] bg-[#282a31] px-3 py-2 text-sm font-semibold text-[#e1e2ec] outline-none placeholder:text-[#8d90a0] focus:border-[#0052cc] focus:ring-2 focus:ring-[#0052cc]/30"
            />
          </div>
        </div>

        {flavorPickerFor && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-[#434654] bg-[#11131a] shadow-2xl shadow-black/50">
              <div className="flex items-center justify-between border-b border-[#434654] bg-[#171922] px-5 py-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8d90a0]">
                    Sabor bola gelat
                  </p>
                  <h3 className="text-[24px] font-black uppercase leading-7 text-[#e1e2ec]">
                    {flavorPickerFor.name}
                  </h3>
                </div>
                <button
                  onClick={() => setFlavorPickerFor(null)}
                  className="flex h-10 w-10 items-center justify-center rounded bg-[#282a31] text-[#c3c6d6] transition-colors hover:bg-[#32343c]"
                  aria-label="Tancar sabors"
                >
                  <span className="text-lg">&#10005;</span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 overflow-y-auto p-5 sm:grid-cols-3 lg:grid-cols-4">
                {nestedFlavorProducts.map((flavor) => (
                  <button
                    key={flavor.id}
                    onClick={() => chooseIceCreamBallFlavor(flavor.name)}
                    className="min-h-[64px] rounded border border-[#f59e0b]/50 bg-[#f59e0b]/15 px-3 py-2 text-left transition-colors hover:bg-[#f59e0b]/24"
                  >
                    <span className="line-clamp-2 text-[14px] font-black uppercase leading-4 text-[#e1e2ec]">
                      {flavor.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-[#434654] bg-[#171922] px-5 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8d90a0]">
              Total amb extres
            </p>
            <p className="text-[30px] font-black leading-8 text-[#e1e2ec]">
              {formatPrice(Number(baseProduct.price) + totalExtra)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="rounded bg-[#282a31] px-5 py-3 font-bold text-[#c3c6d6] transition-colors hover:bg-[#32343c]"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              className="rounded bg-[#41dfa5] px-7 py-3 font-black uppercase tracking-[0.04em] text-[#003825] transition-colors hover:bg-[#50f0b2]"
            >
              Afegir al carro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
