"use client";

import { useState } from "react";
import { CartItem } from "@/types/pos";
import {
  getModifierParent,
  getVisibleItemNote,
  groupItemsWithModifiers,
} from "@/lib/item-grouping";
import { titleCase } from "@/lib/palette";

interface CartProps {
  items: CartItem[];
  onUpdateQty: (lineId: string, delta: number) => void;
  onRemove: (lineId: string) => void;
  onSetNote: (lineId: string, note: string | null) => void;
  onPark: () => void;
  onOpenParkedTickets: () => void;
  onCheckout: () => void;
  parkedCount: number;
}

function isSingleChoiceCartModifier(name: string, parent: string | null): boolean {
  if (!parent) return false;
  const lowerName = name.toLowerCase();
  if (lowerName.includes("bola gelat") || lowerName.includes("bola helado")) return true;
  return lowerName.trim() === "nata" && parent.trim().toLowerCase() === "batut";
}

export default function Cart({
  items,
  onUpdateQty,
  onRemove,
  onSetNote,
  onPark,
  onOpenParkedTickets,
  onCheckout,
  parkedCount,
}: CartProps) {
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const [editingNoteFor, setEditingNoteFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const groupedItems = groupItemsWithModifiers(
    items,
    (item) => item.name,
    (item) => item.notes
  );

  return (
    <div className="flex h-full flex-col border-t border-[#ded6c8] bg-[#faf9f6] lg:border-l lg:border-t-0">
      <div className="border-b border-[#ded6c8] p-4">
        <h2 className="text-[22px] font-medium leading-7 text-[#241f1c]">Comanda actual</h2>
        <p className="text-[13px] font-normal text-[#6f665c]">
          {items.length} {items.length === 1 ? "producte" : "productes"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[#7b746a]">
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
                key={base.line_id}
                className="rounded-xl border border-[#ddd4c4] bg-white p-3"
              >
                <CartLine
                  item={base}
                  isModifier={Boolean(isOrphanModifier)}
                  onUpdateQty={onUpdateQty}
                  onRemove={onRemove}
                  onEditNote={(item) => {
                    setEditingNoteFor(item.line_id);
                    setNoteDraft(getVisibleItemNote(item.notes) || "");
                  }}
                />

                {modifiers.length > 0 && (
                  <div className="mt-3 border-l-2 border-[#0052cc]/65 pl-3">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-[#6f665c]">
                      Complements d&apos;aquest producte
                    </p>
                    <div className="space-y-2">
                      {modifiers.map((modifier) => (
                        <CartLine
                          key={modifier.line_id}
                          item={modifier}
                          isModifier
                          onUpdateQty={onUpdateQty}
                          onRemove={onRemove}
                          onEditNote={(item) => {
                            setEditingNoteFor(item.line_id);
                            setNoteDraft(getVisibleItemNote(item.notes) || "");
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

      <div className="space-y-4 border-t border-[#ded6c8] bg-[#faf9f6] p-4">
        <div className="flex items-center justify-between">
          <span className="text-[20px] font-medium text-[#241f1c]">Total</span>
          <span className="text-[48px] font-medium leading-[56px] tracking-[-0.02em] tabular-nums text-[#241f1c]">
            {total.toFixed(2)} &euro;
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onPark}
            disabled={items.length === 0}
            className="rounded-xl border border-[#d4cbbb] bg-white py-3 text-[16px] font-medium text-[#241f1c] active:bg-[#f1eee7] disabled:cursor-not-allowed disabled:bg-[#ebe7de] disabled:text-[#9a9184]"
          >
            Aparcar
          </button>
          <button
            onClick={onOpenParkedTickets}
            disabled={parkedCount === 0}
            className="rounded-xl border border-[#d4cbbb] bg-white py-3 text-[16px] font-medium text-[#241f1c] active:bg-[#f1eee7] disabled:cursor-not-allowed disabled:bg-[#ebe7de] disabled:text-[#9a9184]"
          >
            Aparcats ({parkedCount})
          </button>
        </div>
        <button
          onClick={onCheckout}
          disabled={items.length === 0}
          className="w-full rounded-xl bg-[#2e9e5b] py-4 text-[20px] font-medium text-white active:bg-[#27874e] disabled:cursor-not-allowed disabled:bg-[#d8d4cc] disabled:text-[#8f887c]"
        >
          Cobrar
        </button>
      </div>

      {editingNoteFor !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-[#ddd4c4] bg-white p-6">
            <h3 className="mb-3 text-lg font-medium text-[#241f1c]">Nota per a cuina</h3>
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
                className="flex-1 rounded-xl border border-[#ddd4c4] bg-white py-2.5 text-sm font-medium text-[#241f1c] active:bg-[#f1eee7]"
              >
                Cancel.lar
              </button>
              <button
                onClick={() => {
                  onSetNote(editingNoteFor, noteDraft.trim() || null);
                  setEditingNoteFor(null);
                  setNoteDraft("");
                }}
                className="flex-1 rounded-xl bg-[#2e9e5b] py-2.5 text-sm font-medium text-white active:bg-[#27874e]"
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
  onUpdateQty: (lineId: string, delta: number) => void;
  onRemove: (lineId: string) => void;
  onEditNote: (item: CartItem) => void;
}) {
  const modifierParent = getModifierParent(item.notes);
  const visibleNote = !modifierParent ? getVisibleItemNote(item.notes) : null;
  const hideIncreaseButton = isSingleChoiceCartModifier(item.name, modifierParent);

  return (
    <div className={`flex items-center gap-3 ${isModifier ? "py-1" : ""}`}>
      <div className="min-w-0 flex-1">
        <p
          className={`line-clamp-2 font-medium leading-5 ${
            isModifier ? "text-sm text-[#6f665c]" : "text-[#241f1c]"
          }`}
        >
          {isModifier ? "+ " : ""}
          {titleCase(item.name)}
        </p>
        <p className="text-sm font-normal text-[#6f665c]">
          {Number(item.price).toFixed(2)} &euro; c/u
        </p>
        {visibleNote && (
          <p className="mt-0.5 truncate text-xs font-normal text-[#ba7517]">
            Nota: {visibleNote}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onUpdateQty(item.line_id, -1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ddd4c4] bg-[#f1eee7] text-lg font-medium text-[#241f1c] active:bg-[#e6dfd2]"
        >
          -
        </button>
        <span className="w-7 text-center font-medium text-[#241f1c]">{item.qty}</span>
        {!hideIncreaseButton && (
          <button
            onClick={() => onUpdateQty(item.line_id, 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ddd4c4] bg-[#f1eee7] text-lg font-medium text-[#241f1c] active:bg-[#e6dfd2]"
          >
            +
          </button>
        )}
      </div>

      <div className="flex min-w-[58px] flex-col items-end gap-1">
        <span className="font-medium tabular-nums text-[#241f1c]">
          {(item.price * item.qty).toFixed(2)} &euro;
        </span>
        <div className="flex gap-2">
          {!modifierParent && (
            <button
              onClick={() => onEditNote(item)}
              className="text-xs font-medium text-[#ba7517]"
            >
              Nota
            </button>
          )}
          <button
            onClick={() => onRemove(item.line_id)}
            className="text-xs font-medium text-[#b84335]"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
