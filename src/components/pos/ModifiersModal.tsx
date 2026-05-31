"use client";

import { Product, Category } from "@/types/pos";
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
  const [note, setNote] = useState("");
  const includedLimit = Math.max(0, Math.floor(Number(includedCount ?? 0)));
  const extraUnitPrice = Math.max(0, Number(extraPrice ?? 0));

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
      const next = new Map(prev);
      if (qty <= 0) next.delete(productId);
      else next.set(productId, qty);
      return next;
    });
  };

  const selectedQty = useMemo(
    () => Array.from(selections.values()).reduce((sum, qty) => sum + qty, 0),
    [selections]
  );

  const pricedSelections = useMemo(() => {
    const groupedSelections = new Map<string, PricedModifierSelection>();
    let consumedIncluded = 0;

    for (const [id, qty] of Array.from(selections.entries())) {
      const product = modifierProducts.find((candidate) => candidate.id === id);
      if (!product || qty <= 0) continue;

      for (let index = 0; index < qty; index += 1) {
        const included = consumedIncluded < includedLimit;
        const unitPrice = included ? 0 : extraUnitPrice;
        const key = `${product.id}-${unitPrice}-${included ? "included" : "extra"}`;
        const current = groupedSelections.get(key);
        if (current) current.qty += 1;
        else groupedSelections.set(key, { product, qty: 1, unitPrice, included });
        consumedIncluded += 1;
      }
    }

    return Array.from(groupedSelections.values());
  }, [selections, modifierProducts, includedLimit, extraUnitPrice]);

  const totalExtra = useMemo(
    () => pricedSelections.reduce((sum, item) => sum + item.unitPrice * item.qty, 0),
    [pricedSelections]
  );

  const handleConfirm = () => {
    onConfirm(pricedSelections, note.trim() || null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Personalitzar</p>
            <h2 className="text-2xl font-bold text-gray-800">{baseProduct.name}</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {modifierGroupName ? `${modifierGroupName} - ` : ""}Base: {Number(baseProduct.price).toFixed(2)} EUR
            </p>
            <p className="mt-1 text-xs font-semibold text-pink-600">
              Inclou {includedLimit} topping{includedLimit === 1 ? "" : "s"} gratis · Extra {extraUnitPrice.toFixed(2)} EUR
            </p>
          </div>
          <button
            onClick={onCancel}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
            aria-label="Tancar"
          >
            <span className="text-xl">&#10005;</span>
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          {modifierProducts.length === 0 ? (
            <p className="py-8 text-center text-gray-400">
              No hi ha extras configurats. Crea una categoria amb &quot;topping&quot;,
              &quot;extra&quot; o &quot;salsa&quot; al nom des de l&apos;admin.
            </p>
          ) : (
            modifierCategories.map((category) => {
              const items = grouped.get(category.id);
              if (!items || items.length === 0) return null;
              return (
                <div key={category.id}>
                  <h3
                    className="mb-2 flex items-center gap-2 text-sm font-bold"
                    style={{ color: category.color }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.color }} />
                    {category.name}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((product) => {
                      const qty = selections.get(product.id) || 0;
                      const isSelected = qty > 0;
                      return (
                        <div
                          key={product.id}
                          className={`flex items-center justify-between rounded-xl border-2 px-3 py-2.5 transition-colors ${
                            isSelected ? "border-pink-400 bg-pink-50" : "border-gray-200 bg-white"
                          }`}
                        >
                          <button onClick={() => setQty(product.id, qty + 1)} className="flex-1 text-left">
                            <p className="text-sm font-bold leading-tight text-gray-800">{product.name}</p>
                            <p className="mt-0.5 text-xs text-gray-500">
                              {selectedQty < includedLimit ? "Inclòs si el selecciones ara" : `+${extraUnitPrice.toFixed(2)} EUR`}
                            </p>
                          </button>
                          {isSelected ? (
                            <div className="ml-2 flex items-center gap-1">
                              <button
                                onClick={() => setQty(product.id, qty - 1)}
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-pink-200 font-bold text-pink-800 hover:bg-pink-300"
                              >
                                &#8722;
                              </button>
                              <span className="w-6 text-center font-bold text-pink-800">{qty}</span>
                              <button
                                onClick={() => setQty(product.id, qty + 1)}
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-pink-200 font-bold text-pink-800 hover:bg-pink-300"
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setQty(product.id, 1)}
                              className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 font-bold text-gray-600 hover:bg-pink-100 hover:text-pink-700"
                              aria-label="Afegir"
                            >
                              +
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">
              Nota especial (opcional)
            </label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Sense lactosa, sense sucre, etc."
              className="h-16 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-6 py-4">
          <div>
            <p className="text-xs text-gray-400">Total amb extras</p>
            <p className="text-xl font-black text-gray-800">
              {(Number(baseProduct.price) + totalExtra).toFixed(2)} EUR
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="rounded-xl bg-gray-100 px-5 py-3 font-bold text-gray-700 transition-colors hover:bg-gray-200"
            >
              Cancel.lar
            </button>
            <button
              onClick={handleConfirm}
              className="rounded-xl bg-pink-500 px-6 py-3 font-bold text-white transition-colors hover:bg-pink-600"
            >
              Afegir al carro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
