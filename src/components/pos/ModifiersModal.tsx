"use client";

import { Category, Product } from "@/types/pos";
import { resolveColor, sentenceCase, textColorOn, titleCase } from "@/lib/palette";
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
  return `${value.toFixed(2).replace(".", ",")} €`;
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

function toppingCardStyle(color: string, selected: boolean): CSSProperties {
  return {
    backgroundColor: color,
    borderColor: selected ? "#20242a" : "rgba(0, 0, 0, 0.14)",
    borderWidth: selected ? 3 : 1,
    color: textColorOn(color),
  };
}

function toppingActionStyle(color: string, selected: boolean): CSSProperties {
  return {
    backgroundColor: selected ? "#ffffff" : "rgba(255, 255, 255, 0.64)",
    borderColor: color,
    color: "#241f1c",
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10131b]/68 p-3">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#ddd4c4] bg-[#faf9f6]">
        <div className="flex items-start justify-between border-b border-[#ddd4c4] bg-[#faf9f6] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#7b746a]">
              Personalitzar
            </p>
            <h2 className="mt-1 truncate text-[26px] font-medium leading-8 text-[#241f1c]">
              {sentenceCase(baseProduct.name)}
            </h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-normal text-[#5f6878]">
              {modifierGroupName && <span>{sentenceCase(modifierGroupName)}</span>}
              <span>Base {formatPrice(Number(baseProduct.price))}</span>
              {hasFlavorSection ? (
                <span className="font-black text-[#169b68]">
                  Max {includedLimit} sabor{includedLimit === 1 ? "" : "s"} gratis
                  {hasPaidSection ? `, extres +${formatPrice(extraUnitPrice)}` : ""}
                </span>
              ) : (
                <span className="font-black text-[#169b68]">
                  {includedLimit} gratis, extres +{formatPrice(extraUnitPrice)}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onCancel}
            className="ml-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#d4cbbb] bg-white text-[#241f1c] active:bg-[#f1eee7]"
            aria-label="Tancar"
          >
            <span className="text-lg">&#10005;</span>
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {modifierProducts.length === 0 ? (
            <p className="py-8 text-center font-bold text-[#6f7787]">
              No hi ha extres configurats per aquest producte.
            </p>
          ) : (
            displayedModifierCategories.map((category) => {
              const items = grouped.get(category.id);
              if (!items || items.length === 0) return null;

              return (
                <section key={category.id}>
                  <h3 className="mb-2 flex items-center gap-2 text-[15px] font-medium text-[#241f1c]">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    {sentenceCase(category.name)}
                  </h3>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {items.map((product) => {
                      const qty = selections.get(product.id) || 0;
                      const isSelected = qty > 0;
                      const isFlavor = flavorCategoryIds.has(product.category_id);
                      const cardColor = resolveColor({
                        flavor: product.name,
                        category: category.name,
                      });
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
                          ? `${titleCase(selectedIceCreamBallFlavor)} +${formatPrice(nextIceCreamBallPrice)}`
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
                      const status = isIceCreamBall
                        ? iceCreamBallStatus
                        : hasFlavorSection && isFlavor
                          ? isSelected
                            ? "Sabor escollit"
                            : maxFlavorReached
                              ? "Max sabors"
                              : ""
                          : hasFlavorSection
                            ? isSingleChoiceExtra && isSelected
                              ? "Afegit"
                              : `+${formatPrice(extraUnitPrice)}`
                            : isSelected
                              ? regularSelectedStatus
                              : selectedQty < includedLimit
                                ? "Gratis ara"
                                : `+${formatPrice(extraUnitPrice)}`;
                      const statusColor = maxFlavorReached
                        ? "text-current opacity-55"
                        : "text-current opacity-80";

                      return (
                        <div
                          key={product.id}
                          className={`flex min-h-[76px] items-center justify-between rounded-xl border px-3 py-2 active:brightness-95 ${
                            maxFlavorReached ? "opacity-50" : ""
                          }`}
                          style={toppingCardStyle(cardColor, isSelected)}
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
                            <p className="line-clamp-2 pr-2 text-[17px] font-medium leading-[19px]">
                              {titleCase(product.name)}
                            </p>
                            {status && (
                              <p className={`mt-1 text-[11px] font-medium leading-3 ${statusColor}`}>
                                {status}
                              </p>
                            )}
                          </button>

                          {isSelected ? (
                            <div className="ml-2 flex shrink-0 items-center gap-1">
                              <button
                                onClick={() => removeSelection(product.id, qty - 1)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border text-base font-medium active:bg-[#f1eee7]"
                                style={toppingActionStyle(cardColor, true)}
                                aria-label="Restar"
                              >
                                &#8722;
                              </button>
                              <span className="w-5 text-center text-sm font-medium text-current">
                                {qty}
                              </span>
                            </div>
                          ) : (
                            <span className="ml-2 h-8 w-8 shrink-0" aria-hidden />
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
            <label className="mb-2 block text-sm font-medium text-[#241f1c]">
              Nota especial
            </label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Sense lactosa, sense sucre, etc."
              className="h-16 w-full resize-none rounded-xl border border-[#d4cbbb] bg-white px-3 py-2 text-sm font-normal text-[#241f1c] outline-none placeholder:text-[#8f887c] focus:border-[#2e9e5b] focus:ring-2 focus:ring-[#2e9e5b]/20"
            />
          </div>
        </div>

        {flavorPickerFor && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#10131b]/68 p-4">
            <div className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#ddd4c4] bg-[#faf9f6]">
              <div className="flex items-center justify-between border-b border-[#ddd4c4] bg-[#faf9f6] px-5 py-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#7b746a]">
                    Sabor bola gelat
                  </p>
                  <h3 className="text-[24px] font-medium leading-7 text-[#241f1c]">
                    {titleCase(flavorPickerFor.name)}
                  </h3>
                </div>
                <button
                  onClick={() => setFlavorPickerFor(null)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d4cbbb] bg-white text-[#241f1c] active:bg-[#f1eee7]"
                  aria-label="Tancar sabors"
                >
                  <span className="text-lg">&#10005;</span>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3 overflow-y-auto p-5 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {nestedFlavorProducts.map((flavor) => (
                  <button
                    key={flavor.id}
                    onClick={() => chooseIceCreamBallFlavor(flavor.name)}
                    className="min-h-[74px] rounded-xl border px-3 py-2 text-left active:brightness-95"
                    style={toppingCardStyle(resolveColor({ flavor: flavor.name }), false)}
                  >
                    <span className="line-clamp-2 text-[17px] font-medium leading-[19px]">
                      {titleCase(flavor.name)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-[#ddd4c4] bg-[#faf9f6] px-5 py-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#7b746a]">
              Total amb extres
            </p>
            <p className="text-[30px] font-medium leading-8 tabular-nums text-[#241f1c]">
              {formatPrice(Number(baseProduct.price) + totalExtra)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="rounded-xl border border-[#d4cbbb] bg-white px-5 py-3 font-medium text-[#241f1c] active:bg-[#f1eee7]"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              className="rounded-xl bg-[#2e9e5b] px-7 py-3 font-medium text-white active:bg-[#27874e]"
            >
              Afegir al carro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
