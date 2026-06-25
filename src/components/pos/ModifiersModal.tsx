"use client";

import { Category, Product } from "@/types/pos";
import { resolveColor, sentenceCase, textColorOn, titleCase } from "@/lib/palette";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import TouchKeyboard from "./TouchKeyboard";

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
  initialSelections?: Map<number, number>;
  initialIceCreamBallFlavors?: Map<number, string[]>;
  initialNote?: string | null;
  confirmLabel?: string;
  onConfirm: (selections: PricedModifierSelection[], note: string | null) => void;
  onCancel: () => void;
}

const MAX_ICE_CREAM_BALLS = 2;
const SECOND_ICE_CREAM_BALL_PRICE = 2;
const NO_CREAM_ICE_CREAM_FLAVOR = "SIN NATA";
const NO_CREAM_NOTE = "Sin nata";

function formatPrice(value: number) {
  return `${value.toFixed(2).replace(".", ",")} €`;
}

function isFlavorCategoryName(name: string) {
  return name.toLowerCase().includes("sabor");
}

function isSingleChoiceExtraCategoryName(name: string) {
  const lower = name.toLowerCase();
  return (
    lower.includes("extres batut") ||
    lower.includes("extres frappes") ||
    lower.includes("opcions xurros")
  );
}

function isTemperatureCategoryName(name: string) {
  const lower = name.toLowerCase();
  return lower.includes("temperatura") || (lower.includes("fred") && lower.includes("calent"));
}

function isSizeCategoryName(name: string) {
  const lower = name.toLowerCase();
  return lower.includes("mida") || lower.includes("tamany") || lower.includes("size");
}

function usesCatalogPriceCategoryName(name: string) {
  const lower = name.trim().toLowerCase();
  return lower === "varios" || lower === "opcions xurros";
}

function requiresModifierSelection(product: Product, modifierGroupName: string | null | undefined) {
  const productName = product.name.trim().toLowerCase();
  const groupName = String(modifierGroupName || "").trim().toLowerCase();
  return productName === "pack 3 xurros" || groupName === "opcions pack 3 xurros";
}

function isIceCreamBallProductName(name: string) {
  const lower = name.toLowerCase();
  return lower.includes("bola") && (lower.includes("gelat") || lower.includes("helado"));
}

function isHiPopName(name: string | null | undefined) {
  const compact = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return compact.includes("hipop");
}

function allowsRepeatedGelatFlavor(product: Product) {
  const compact = product.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return ["cucurutxom", "cucurutxol", "potm", "potl"].includes(compact);
}

function isNoCreamFlavorName(name: string) {
  const lower = name.toLowerCase();
  return lower.includes("sin nata") || lower.includes("sense nata");
}

function toggleNoCreamInNote(value: string) {
  const parts = value
    .split(/\s*[,;\n]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.some((part) => isNoCreamFlavorName(part))) {
    return parts.filter((part) => !isNoCreamFlavorName(part)).join(", ");
  }

  return [...parts, NO_CREAM_NOTE].join(", ");
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
  initialSelections,
  initialIceCreamBallFlavors,
  initialNote,
  confirmLabel = "Afegir al carro",
  onConfirm,
  onCancel,
}: ModifiersModalProps) {
  const [selections, setSelections] = useState<Map<number, number>>(
    () => new Map(initialSelections ?? [])
  );
  const [iceCreamBallFlavors, setIceCreamBallFlavors] = useState<Map<number, string[]>>(
    () =>
      new Map(
        Array.from(initialIceCreamBallFlavors ?? []).map(([productId, flavors]) => [
          productId,
          [...flavors],
        ])
      )
  );
  const [flavorPickerFor, setFlavorPickerFor] = useState<Product | null>(null);
  const [note, setNote] = useState(initialNote ?? "");
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
  const temperatureCategoryIds = useMemo(
    () =>
      new Set(
        modifierCategories
          .filter((category) => isTemperatureCategoryName(category.name))
          .map((category) => category.id)
      ),
    [modifierCategories]
  );
  const sizeCategoryIds = useMemo(
    () =>
      new Set(
        modifierCategories
          .filter((category) => isSizeCategoryName(category.name))
          .map((category) => category.id)
      ),
    [modifierCategories]
  );
  const catalogPriceCategoryIds = useMemo(
    () =>
      new Set(
        modifierCategories
          .filter((category) => usesCatalogPriceCategoryName(category.name))
          .map((category) => category.id)
      ),
    [modifierCategories]
  );
  const hasTemperatureSection = temperatureCategoryIds.size > 0;
  const hasSizeSection = sizeCategoryIds.size > 0;
  const hasCatalogPriceSection = catalogPriceCategoryIds.size > 0;
  const requiresSelection = requiresModifierSelection(baseProduct, modifierGroupName);
  const sizeUnitPrice = extraUnitPrice > 0 ? extraUnitPrice : 1;
  const hasNestedFlavorPicker = useMemo(
    () =>
      flavorCategoryIds.size > 0 &&
      modifierProducts.some((product) => isIceCreamBallProductName(product.name)),
    [flavorCategoryIds, modifierProducts]
  );
  const hasFlavorSection = flavorCategoryIds.size > 0 && !hasNestedFlavorPicker;
  const allowRepeatedFlavorSelections = hasFlavorSection && allowsRepeatedGelatFlavor(baseProduct);
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
  const showNoCreamIceCreamOption = useMemo(
    () =>
      hasNestedFlavorPicker &&
      (isHiPopName(baseProduct.name) ||
        isHiPopName(baseProduct.category_name) ||
        isHiPopName(modifierGroupName)) &&
      !nestedFlavorProducts.some((product) => isNoCreamFlavorName(product.name)),
    [baseProduct.category_name, baseProduct.name, hasNestedFlavorPicker, modifierGroupName, nestedFlavorProducts]
  );
  const showNoCreamMainFlavorOption = useMemo(
    () =>
      hasFlavorSection &&
      (isHiPopName(baseProduct.name) ||
        isHiPopName(baseProduct.category_name) ||
        isHiPopName(modifierGroupName)) &&
      !modifierProducts.some((product) => isNoCreamFlavorName(product.name)),
    [baseProduct.category_name, baseProduct.name, hasFlavorSection, modifierGroupName, modifierProducts]
  );
  const hasNoCreamNote = isNoCreamFlavorName(note);
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
      const isTemperature = Boolean(product && temperatureCategoryIds.has(product.category_id));
      const isSize = Boolean(product && sizeCategoryIds.has(product.category_id));
      const isIceCreamBall = Boolean(product && isIceCreamBallProductName(product.name));
      const canRepeatFlavor = Boolean(isFlavor && allowRepeatedFlavorSelections);
      const isSingleChoiceExtra = Boolean(
        product &&
          (singleChoiceExtraCategoryIds.has(product.category_id) ||
            isTemperature ||
            isSize)
      );
      const currentFlavorQty = isFlavor
        ? Array.from(prev.entries()).reduce((sum, [id, itemQty]) => {
            if (id === productId) return sum;
            const candidate = productById.get(id);
            return candidate && flavorCategoryIds.has(candidate.category_id) ? sum + itemQty : sum;
          }, 0)
        : 0;
      const maxFlavorQty = canRepeatFlavor
        ? Math.max(0, includedLimit - currentFlavorQty)
        : 1;
      const normalizedQty = isFlavor
        ? Math.min(Math.max(qty, 0), maxFlavorQty)
        : isSingleChoiceExtra
          ? Math.min(Math.max(qty, 0), 1)
          : isIceCreamBall
            ? Math.min(Math.max(qty, 0), MAX_ICE_CREAM_BALLS)
            : qty;

      if (isFlavor && normalizedQty > (prev.get(productId) || 0)) {
        if (currentFlavorQty + normalizedQty > includedLimit) return prev;
      }

      const next = new Map(prev);
      if (product && normalizedQty > 0 && (isSingleChoiceExtra || isTemperature || isSize)) {
        for (const id of Array.from(next.keys())) {
          const candidate = productById.get(id);
          if (candidate?.category_id === product.category_id && id !== productId) {
            next.delete(id);
          }
        }
      }
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

      if (product && temperatureCategoryIds.has(product.category_id)) {
        map.set(id, { included: qty, extra: 0 });
        continue;
      }

      if (product && sizeCategoryIds.has(product.category_id)) {
        map.set(id, { included: 0, extra: qty });
        continue;
      }

      if (product && catalogPriceCategoryIds.has(product.category_id)) {
        map.set(id, { included: Number(product.price) <= 0 ? qty : 0, extra: Number(product.price) > 0 ? qty : 0 });
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
    temperatureCategoryIds,
    sizeCategoryIds,
    catalogPriceCategoryIds,
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
      displayName?: string,
      keySuffix?: string
    ) => {
      const pricedProduct = displayName ? { ...product, name: displayName } : product;
      const key = `${product.id}-${unitPrice}-${included ? "included" : "extra"}-${keySuffix ?? displayName ?? product.name}`;
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

      if (temperatureCategoryIds.has(product.category_id)) {
        addPricedSelection(product, qty, 0, true);
        continue;
      }

      if (sizeCategoryIds.has(product.category_id)) {
        addPricedSelection(product, qty, sizeUnitPrice, false);
        continue;
      }

      if (catalogPriceCategoryIds.has(product.category_id)) {
        const unitPrice = Math.max(0, Number(product.price) || 0);
        addPricedSelection(product, qty, unitPrice, unitPrice <= 0);
        continue;
      }

      for (let index = 0; index < qty; index += 1) {
        const included = consumedIncluded < includedLimit;
        const isIceCreamBall = isIceCreamBallProductName(product.name);
        const unitPrice = isIceCreamBall
          ? index === 0 && included
            ? extraUnitPrice
            : SECOND_ICE_CREAM_BALL_PRICE
          : included
            ? 0
            : extraUnitPrice;
        const selectedFlavor = iceCreamBallFlavors.get(product.id)?.[index];
        const displayName =
          isIceCreamBall && selectedFlavor ? `${product.name} ${selectedFlavor}` : undefined;
        addPricedSelection(
          product,
          1,
          unitPrice,
          included,
          displayName,
          isIceCreamBall ? `bola-${index}` : undefined
        );
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
    temperatureCategoryIds,
    sizeCategoryIds,
    catalogPriceCategoryIds,
    includedLimit,
    extraUnitPrice,
    sizeUnitPrice,
    iceCreamBallFlavors,
  ]);

  const totalExtra = useMemo(
    () => pricedSelections.reduce((sum, item) => sum + item.unitPrice * item.qty, 0),
    [pricedSelections]
  );

  const handleConfirm = () => {
    if (requiresSelection && selectedQty <= 0) return;

    for (const [id, qty] of Array.from(selections.entries())) {
      const product = productById.get(id);
      const flavors = iceCreamBallFlavors.get(id) ?? [];
      if (product && qty > 0 && isIceCreamBallProductName(product.name) && flavors.length < qty) {
        setFlavorPickerFor(product);
        return;
      }
    }
    onConfirm(pricedSelections, note.trim() || null);
  };

  const removeSelection = (productId: number, nextQty: number) => {
    const product = productById.get(productId);
    if (product && isIceCreamBallProductName(product.name)) {
      const normalizedQty = Math.max(0, Math.min(nextQty, MAX_ICE_CREAM_BALLS));
      setQty(productId, normalizedQty);
      setIceCreamBallFlavors((prev) => {
        const current = prev.get(productId) ?? [];
        const nextFlavors = current.slice(0, normalizedQty);
        const next = new Map(prev);
        if (nextFlavors.length === 0) next.delete(productId);
        else next.set(productId, nextFlavors);
        return next;
      });
      return;
    }

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
    const currentFlavors = iceCreamBallFlavors.get(flavorPickerFor.id) ?? [];
    const nextFlavors = [...currentFlavors, flavorName].slice(0, MAX_ICE_CREAM_BALLS);
    setIceCreamBallFlavors((prev) => {
      const next = new Map(prev);
      next.set(flavorPickerFor.id, nextFlavors);
      return next;
    });
    setQty(flavorPickerFor.id, nextFlavors.length);
    setFlavorPickerFor(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10131b]/68 p-2">
      <div className="flex max-h-[calc(100vh-18px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#ddd4c4] bg-[#faf9f6]">
        <div className="flex items-start justify-between border-b border-[#ddd4c4] bg-[#faf9f6] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#7b746a]">
              Personalitzar
            </p>
            <h2 className="mt-0.5 truncate text-[24px] font-medium leading-7 text-[#241f1c]">
              {sentenceCase(baseProduct.name)}
            </h2>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-normal text-[#5f6878]">
              {modifierGroupName && <span>{sentenceCase(modifierGroupName)}</span>}
              <span>Base {formatPrice(Number(baseProduct.price))}</span>
              {hasFlavorSection ? (
                <span className="font-black text-[#169b68]">
                  Max {includedLimit} sabor{includedLimit === 1 ? "" : "s"} gratis
                  {hasPaidSection ? `, extres +${formatPrice(extraUnitPrice)}` : ""}
                </span>
              ) : hasTemperatureSection || hasSizeSection ? (
                <span className="font-black text-[#169b68]">
                  {hasTemperatureSection ? "Fred/Calent gratis" : ""}
                  {hasTemperatureSection && hasSizeSection ? ", " : ""}
                  {hasSizeSection ? `XL +${formatPrice(sizeUnitPrice)}` : ""}
                </span>
              ) : hasCatalogPriceSection ? (
                <span className="font-black text-[#169b68]">
                  Extres amb preu propi
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

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
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
                  <h3 className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-[#241f1c]">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    {sentenceCase(category.name)}
                  </h3>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                    {showNoCreamMainFlavorOption && flavorCategoryIds.has(category.id) && (
                      <button
                        onClick={() => setNote((current) => toggleNoCreamInNote(current))}
                        className="flex min-h-[54px] flex-col justify-center rounded-xl border px-2.5 py-1.5 text-left active:brightness-95"
                        style={toppingCardStyle(
                          resolveColor({ flavor: NO_CREAM_ICE_CREAM_FLAVOR }),
                          hasNoCreamNote
                        )}
                      >
                        <span className="line-clamp-2 text-[14px] font-semibold leading-[15px]">
                          {titleCase(NO_CREAM_NOTE)}
                        </span>
                        <span className="mt-0.5 text-[9px] font-semibold leading-[10px] opacity-80">
                          {hasNoCreamNote ? "Nota activa" : "Afegir nota"}
                        </span>
                      </button>
                    )}
                    {items.map((product) => {
                      const qty = selections.get(product.id) || 0;
                      const isSelected = qty > 0;
                      const isFlavor = flavorCategoryIds.has(product.category_id);
                      const isTemperature = temperatureCategoryIds.has(product.category_id);
                      const isSize = sizeCategoryIds.has(product.category_id);
                      const usesCatalogPrice = catalogPriceCategoryIds.has(product.category_id);
                      const catalogUnitPrice = Math.max(0, Number(product.price) || 0);
                      const cardColor = resolveColor({
                        flavor: product.name,
                        category: category.name,
                      });
                      const isIceCreamBall = isIceCreamBallProductName(product.name);
                      const isSingleChoiceExtra = singleChoiceExtraCategoryIds.has(
                        product.category_id
                      ) || isIceCreamBall || isTemperature || isSize;
                      const selectedIceCreamBallFlavors = iceCreamBallFlavors.get(product.id) ?? [];
                      const selectedPricing = pricingByProduct.get(product.id);
                      const nextIceCreamBallPrice =
                        qty >= 1
                          ? SECOND_ICE_CREAM_BALL_PRICE
                        : selectedQty < includedLimit
                          ? extraUnitPrice
                          : SECOND_ICE_CREAM_BALL_PRICE;
                      const iceCreamFlavorLabel = selectedIceCreamBallFlavors
                        .map((flavor) => titleCase(flavor))
                        .join(" + ");
                      const iceCreamBallStatus = isSelected
                        ? `${qty}/${MAX_ICE_CREAM_BALLS} ${iceCreamFlavorLabel || "Escull sabor"}${
                            qty < MAX_ICE_CREAM_BALLS
                              ? ` · 2a +${formatPrice(SECOND_ICE_CREAM_BALL_PRICE)}`
                              : ""
                          }`
                        : `0/${MAX_ICE_CREAM_BALLS} +${formatPrice(nextIceCreamBallPrice)} sabor`;
                      const regularSelectedStatus = [
                        selectedPricing?.included ? `${selectedPricing.included} gratis` : null,
                        selectedPricing?.extra ? `${selectedPricing.extra} extra` : null,
                      ]
                        .filter(Boolean)
                        .join(" + ");
                      const maxFlavorReached =
                        hasFlavorSection && isFlavor && !isSelected && selectedFlavorQty >= includedLimit;
                      const selectedFlavorAtLimit =
                        hasFlavorSection && isFlavor && isSelected && selectedFlavorQty >= includedLimit;
                      const maxIceCreamBallsReached = isIceCreamBall && qty >= MAX_ICE_CREAM_BALLS;
                      const status = isIceCreamBall
                        ? iceCreamBallStatus
                        : isTemperature
                          ? isSelected
                            ? "Escollit"
                            : "Fred/Calent"
                        : isSize
                          ? isSelected
                            ? `+${formatPrice(sizeUnitPrice)}`
                            : `+${formatPrice(sizeUnitPrice)}`
                        : usesCatalogPrice
                          ? catalogUnitPrice > 0
                            ? `+${formatPrice(catalogUnitPrice)}`
                            : isSelected
                              ? "Afegit"
                              : "Gratis"
                        : hasFlavorSection && isFlavor
                          ? isSelected
                            ? allowRepeatedFlavorSelections
                              ? `${qty}/${includedLimit} sabor${qty === 1 ? "" : "s"}`
                              : "Sabor escollit"
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
                          className={`flex min-h-[54px] items-center justify-between rounded-xl border px-2.5 py-1.5 active:brightness-95 ${
                            maxFlavorReached ? "opacity-50" : ""
                          }`}
                          style={toppingCardStyle(cardColor, isSelected)}
                        >
                          <button
                            onClick={() => {
                              if (maxFlavorReached) return;
                              if (selectedFlavorAtLimit) return;
                              if (isIceCreamBall) {
                                if (maxIceCreamBallsReached) return;
                                setFlavorPickerFor(product);
                                return;
                              }
                              setQty(product.id, qty + 1);
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="line-clamp-2 pr-1.5 text-[14px] font-semibold leading-[15px]">
                              {titleCase(product.name)}
                            </p>
                            {status && (
                              <p className={`mt-0.5 text-[9px] font-semibold leading-[10px] ${statusColor}`}>
                                {status}
                              </p>
                            )}
                          </button>

                          {isSelected ? (
                            <div className="ml-1.5 flex shrink-0 items-center gap-0.5">
                              <button
                                onClick={() => removeSelection(product.id, qty - 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border text-sm font-bold active:bg-[#f1eee7]"
                                style={toppingActionStyle(cardColor, true)}
                                aria-label="Restar"
                              >
                                &#8722;
                              </button>
                              <span className="w-4 text-center text-xs font-bold text-current">
                                {qty}
                              </span>
                            </div>
                          ) : (
                            <span className="ml-1.5 h-7 w-1 shrink-0" aria-hidden />
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
            <label className="mb-1.5 block text-sm font-medium text-[#241f1c]">
              Nota especial
            </label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Sense lactosa, sense sucre, etc."
              className="h-12 w-full resize-none rounded-xl border border-[#d4cbbb] bg-white px-3 py-2 text-sm font-normal text-[#241f1c] outline-none placeholder:text-[#8f887c] focus:border-[#2e9e5b] focus:ring-2 focus:ring-[#2e9e5b]/20"
            />
            <div className="mt-2">
              <TouchKeyboard value={note} onChange={setNote} compact />
            </div>
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
                    {titleCase(flavorPickerFor.name)} {(iceCreamBallFlavors.get(flavorPickerFor.id)?.length ?? 0) + 1}/{MAX_ICE_CREAM_BALLS}
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
              <div className="grid grid-cols-4 gap-2 overflow-y-auto p-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
                {showNoCreamIceCreamOption && (
                  <button
                    onClick={() => chooseIceCreamBallFlavor(NO_CREAM_ICE_CREAM_FLAVOR)}
                    className="min-h-[54px] rounded-xl border px-2.5 py-1.5 text-left active:brightness-95"
                    style={toppingCardStyle(resolveColor({ flavor: NO_CREAM_ICE_CREAM_FLAVOR }), false)}
                  >
                    <span className="line-clamp-2 text-[14px] font-semibold leading-[15px]">
                      {titleCase(NO_CREAM_ICE_CREAM_FLAVOR)}
                    </span>
                  </button>
                )}
                {nestedFlavorProducts.map((flavor) => (
                  <button
                    key={flavor.id}
                    onClick={() => chooseIceCreamBallFlavor(flavor.name)}
                    className="min-h-[54px] rounded-xl border px-2.5 py-1.5 text-left active:brightness-95"
                    style={toppingCardStyle(resolveColor({ flavor: flavor.name }), false)}
                  >
                    <span className="line-clamp-2 text-[14px] font-semibold leading-[15px]">
                      {titleCase(flavor.name)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-[#ddd4c4] bg-[#faf9f6] px-4 py-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#7b746a]">
              Total amb extres
            </p>
            <p className="text-[28px] font-medium leading-7 tabular-nums text-[#241f1c]">
              {formatPrice(Number(baseProduct.price) + totalExtra)}
            </p>
            {requiresSelection && selectedQty <= 0 && (
              <p className="mt-1 text-xs font-semibold text-[#a86538]">
                Tria una opcio per continuar
              </p>
            )}
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
              disabled={requiresSelection && selectedQty <= 0}
              className="rounded-xl bg-[#2e9e5b] px-7 py-3 font-medium text-white active:bg-[#27874e] disabled:bg-[#cfc8bb] disabled:text-[#7b746a]"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
