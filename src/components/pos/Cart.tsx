"use client";

import { useState } from "react";
import { CartItem } from "@/types/pos";
import { getModifierParent, groupItemsWithModifiers } from "@/lib/item-grouping";

interface CartProps {
  items: CartItem[];
  onUpdateQty: (productId: number, delta: number) => void;
  onRemove: (productId: number) => void;
  onSetNote: (productId: number, note: string | null) => void;
  onCheckout: () => void;
}

export default function Cart({
  items,
  onUpdateQty,
  onRemove,
  onSetNote,
  onCheckout,
}: CartProps) {
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const [editingNoteFor, setEditingNoteFor] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const groupedItems = groupItemsWithModifiers(
    items,
    (item) => item.name,
    (item) => item.notes
  );

  return (
    <div className="flex h-full flex-col border-t border-white/10 bg-zinc-900/90 shadow-2xl shadow-black/20 backdrop-blur lg:border-l lg:border-t-0">
      <div className="border-b border-white/10 p-4">
        <h2 className="text-lg font-black text-white">Comanda actual</h2>
        <p className="text-sm font-medium text-slate-400">
          {items.length} {items.length === 1 ? "producte" : "productes"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-500">
            <p className="text-center text-sm font-medium leading-6">
              Toca un producte per
              <br />
              afegir-lo a la comanda
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {groupedItems.map(({ base, modifiers, isOrphanModifier }) => (
              <div
                key={`${base.product_id}-${base.notes || "base"}`}
                className="rounded-2xl border border-white/10 bg-[#27272A] p-3 shadow-lg shadow-black/10"
              >
                <CartLine
                  item={base}
                  isModifier={Boolean(isOrphanModifier)}
                  onUpdateQty={onUpdateQty}
                  onRemove={onRemove}
                  onEditNote={(item) => {
                    setEditingNoteFor(item.product_id);
                    setNoteDraft(item.notes || "");
                  }}
                />

                {modifiers.length > 0 && (
                  <div className="mt-3 border-l-2 border-sky-300/45 pl-3">
                    <p className="mb-2 text-[11px] font-black uppercase text-sky-200/80">
                      Complements d&apos;aquest producte
                    </p>
                    <div className="space-y-2">
                      {modifiers.map((modifier) => (
                        <CartLine
                          key={`${modifier.product_id}-${modifier.notes || "modifier"}`}
                          item={modifier}
                          isModifier
                          onUpdateQty={onUpdateQty}
                          onRemove={onRemove}
                          onEditNote={(item) => {
                            setEditingNoteFor(item.product_id);
                            setNoteDraft(item.notes || "");
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-white/10 bg-zinc-950/55 p-4">
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-slate-300">Total</span>
          <span className="text-3xl font-black tabular-nums text-white">
            {total.toFixed(2)} &euro;
          </span>
        </div>
        <button
          onClick={onCheckout}
          disabled={items.length === 0}
          className="w-full rounded-2xl bg-emerald-500 py-4 text-xl font-black text-white shadow-lg shadow-emerald-950/30 transition-colors hover:bg-emerald-400 active:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          COBRAR
        </button>
      </div>

      {editingNoteFor !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-2xl ring-1 ring-slate-900/10">
            <h3 className="mb-3 text-lg font-black text-slate-950">Nota per a cuina</h3>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Ex. sense sucre, sense lactosa, extra xocolata..."
              className="h-24 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              autoFocus
            />
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => {
                  setEditingNoteFor(null);
                  setNoteDraft("");
                }}
                className="flex-1 rounded-lg bg-slate-100 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200"
              >
                Cancel.lar
              </button>
              <button
                onClick={() => {
                  onSetNote(editingNoteFor, noteDraft.trim() || null);
                  setEditingNoteFor(null);
                  setNoteDraft("");
                }}
                className="flex-1 rounded-lg bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600"
              >
                Desar nota
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CartLine({
  item,
  isModifier = false,
  onUpdateQty,
  onRemove,
  onEditNote,
}: {
  item: CartItem;
  isModifier?: boolean;
  onUpdateQty: (productId: number, delta: number) => void;
  onRemove: (productId: number) => void;
  onEditNote: (item: CartItem) => void;
}) {
  const modifierParent = getModifierParent(item.notes);
  const visibleNote = item.notes && !modifierParent ? item.notes : null;

  return (
    <div className={`flex items-center gap-3 ${isModifier ? "py-1" : ""}`}>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate font-bold ${
            isModifier ? "text-sm text-slate-100" : "text-white"
          }`}
        >
          {isModifier ? "+ " : ""}
          {item.name}
        </p>
        <p className="text-sm font-medium text-slate-400">
          {Number(item.price).toFixed(2)} &euro; c/u
        </p>
        {visibleNote && (
          <p className="mt-0.5 truncate text-xs font-semibold italic text-amber-600">
            Nota: {visibleNote}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onUpdateQty(item.product_id, -1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-lg font-black text-slate-200 ring-1 ring-white/10 transition-colors hover:bg-white/15 active:bg-white/20"
        >
          -
        </button>
        <span className="w-7 text-center font-black text-white">{item.qty}</span>
        <button
          onClick={() => onUpdateQty(item.product_id, 1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-lg font-black text-slate-950 transition-colors hover:bg-slate-200 active:bg-slate-300"
        >
          +
        </button>
      </div>

      <div className="flex min-w-[58px] flex-col items-end gap-1">
        <span className="font-black text-white">
          {(item.price * item.qty).toFixed(2)} &euro;
        </span>
        <div className="flex gap-2">
          {!modifierParent && (
            <button
              onClick={() => onEditNote(item)}
              className="text-xs font-bold text-amber-600 transition-colors hover:text-amber-700"
            >
              Nota
            </button>
          )}
          <button
            onClick={() => onRemove(item.product_id)}
            className="text-xs font-bold text-red-500 transition-colors hover:text-red-600"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
