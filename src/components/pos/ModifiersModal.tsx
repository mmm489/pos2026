"use client";

import { Product, Category } from "@/types/pos";
import { useMemo, useState } from "react";

interface ModifiersModalProps {
  baseProduct: Product;
  modifierProducts: Product[];
  modifierCategories: Category[];
  onConfirm: (selections: { product: Product; qty: number }[], note: string | null) => void;
  onCancel: () => void;
}

/**
 * Long-press a product → this modal opens. Shows the available modifier
 * products (any product whose category name contains "topping", "extra",
 * "salsa", "complement"... see resolveModifiers in pos/page.tsx) grouped
 * by their category, plus a free-form note for special requests.
 *
 * On confirm, the parent adds the base product plus each selected modifier
 * with qty > 0 to the cart.
 */
export default function ModifiersModal({
  baseProduct,
  modifierProducts,
  modifierCategories,
  onConfirm,
  onCancel,
}: ModifiersModalProps) {
  const [selections, setSelections] = useState<Map<number, number>>(new Map());
  const [note, setNote] = useState("");

  const grouped = useMemo(() => {
    const map = new Map<number, Product[]>();
    for (const p of modifierProducts) {
      const list = map.get(p.category_id) || [];
      list.push(p);
      map.set(p.category_id, list);
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

  const totalExtra = useMemo(() => {
    let sum = 0;
    for (const [id, qty] of Array.from(selections.entries())) {
      const p = modifierProducts.find((mp) => mp.id === id);
      if (p) sum += Number(p.price) * qty;
    }
    return sum;
  }, [selections, modifierProducts]);

  const handleConfirm = () => {
    const list: { product: Product; qty: number }[] = [];
    for (const [id, qty] of Array.from(selections.entries())) {
      const p = modifierProducts.find((mp) => mp.id === id);
      if (p && qty > 0) list.push({ product: p, qty });
    }
    onConfirm(list, note.trim() || null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Personalitzar</p>
            <h2 className="text-2xl font-bold text-gray-800">{baseProduct.name}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Base: {Number(baseProduct.price).toFixed(2)}€
            </p>
          </div>
          <button
            onClick={onCancel}
            className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600"
            aria-label="Tancar"
          >
            <span className="text-xl">&#10005;</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {modifierProducts.length === 0 ? (
            <p className="text-center text-gray-400 py-8">
              No hi ha extras configurats. Crea una categoria amb &quot;topping&quot;,
              &quot;extra&quot; o &quot;salsa&quot; al nom des de l&apos;admin.
            </p>
          ) : (
            modifierCategories.map((cat) => {
              const items = grouped.get(cat.id);
              if (!items || items.length === 0) return null;
              return (
                <div key={cat.id}>
                  <h3
                    className="text-sm font-bold mb-2 flex items-center gap-2"
                    style={{ color: cat.color }}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                    {cat.name}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {items.map((p) => {
                      const qty = selections.get(p.id) || 0;
                      const isSelected = qty > 0;
                      return (
                        <div
                          key={p.id}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-xl border-2 transition-colors ${
                            isSelected
                              ? "border-pink-400 bg-pink-50"
                              : "border-gray-200 bg-white"
                          }`}
                        >
                          <button
                            onClick={() => setQty(p.id, qty + 1)}
                            className="flex-1 text-left"
                          >
                            <p className="text-sm font-bold text-gray-800 leading-tight">{p.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              +{Number(p.price).toFixed(2)}€
                            </p>
                          </button>
                          {isSelected ? (
                            <div className="flex items-center gap-1 ml-2">
                              <button
                                onClick={() => setQty(p.id, qty - 1)}
                                className="w-8 h-8 rounded-full bg-pink-200 hover:bg-pink-300 text-pink-800 font-bold flex items-center justify-center"
                              >
                                &#8722;
                              </button>
                              <span className="w-6 text-center font-bold text-pink-800">{qty}</span>
                              <button
                                onClick={() => setQty(p.id, qty + 1)}
                                className="w-8 h-8 rounded-full bg-pink-200 hover:bg-pink-300 text-pink-800 font-bold flex items-center justify-center"
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setQty(p.id, 1)}
                              className="ml-2 w-8 h-8 rounded-full bg-gray-100 hover:bg-pink-100 text-gray-600 hover:text-pink-700 font-bold flex items-center justify-center"
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

          {/* Note */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Nota especial (opcional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Sense lactosa, sense sucre, etc."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-gray-400">Total amb extras</p>
            <p className="text-xl font-black text-gray-800">
              {(Number(baseProduct.price) + totalExtra).toFixed(2)}€
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-5 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition-colors"
            >
              Cancel·lar
            </button>
            <button
              onClick={handleConfirm}
              className="px-6 py-3 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-bold transition-colors"
            >
              Afegir al carro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
