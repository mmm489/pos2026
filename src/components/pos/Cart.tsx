"use client";

import { useState } from "react";
import { CartItem } from "@/types/pos";
import { getModifierParent, groupItemsWithModifiers } from "@/lib/item-grouping";

interface CartProps {
  items: CartItem[];
  onUpdateQty: (lineId: string, delta: number) => void;
  onRemove: (lineId: string) => void;
  onSetNote: (lineId: string, note: string | null) => void;
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
  const [editingNoteFor, setEditingNoteFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const groupedItems = groupItemsWithModifiers(
    items,
    (item) => item.name,
    (item) => item.notes
  );

  return (
    <div className="flex h-full flex-col border-t border-[#434654] bg-[#191b23] lg:border-l lg:border-t-0">
      <div className="border-b border-[#434654]/70 p-4">
        <h2 className="text-[22px] font-bold leading-7 text-[#e1e2ec]">Comanda actual</h2>
        <p className="text-[13px] font-medium text-[#c3c6d6]">
          {items.length} {items.length === 1 ? "producte" : "productes"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[#8d90a0]">
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
                className="rounded-lg border border-[#434654]/70 bg-[#282a31] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.16)]"
              >
                <CartLine
                  item={base}
                  isModifier={Boolean(isOrphanModifier)}
                  onUpdateQty={onUpdateQty}
                  onRemove={onRemove}
                  onEditNote={(item) => {
                    setEditingNoteFor(item.line_id);
                    setNoteDraft(item.notes || "");
                  }}
                />

                {modifiers.length > 0 && (
                  <div className="mt-3 border-l-2 border-[#0052cc]/65 pl-3">
                    <p className="mb-2 text-[11px] font-bold uppercase text-[#c4d2ff]">
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

      <div className="space-y-4 border-t border-[#434654] bg-[#11131a] p-4">
        <div className="flex items-center justify-between">
          <span className="text-[20px] font-bold text-[#e1e2ec]">Total</span>
          <span className="text-[48px] font-black leading-[56px] tracking-[-0.02em] tabular-nums text-[#e1e2ec]">
            {total.toFixed(2)} &euro;
          </span>
        </div>
        <button
          onClick={onCheckout}
          disabled={items.length === 0}
          className="w-full rounded-lg bg-[#41dfa5] py-4 text-[20px] font-bold uppercase tracking-[0.04em] text-[#003825] transition-colors hover:bg-[#50f0b2] active:bg-[#33c892] disabled:cursor-not-allowed disabled:bg-[#32343c] disabled:text-[#8d90a0]"
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
  onUpdateQty: (lineId: string, delta: number) => void;
  onRemove: (lineId: string) => void;
  onEditNote: (item: CartItem) => void;
}) {
  const modifierParent = getModifierParent(item.notes);
  const visibleNote = item.notes && !modifierParent ? item.notes : null;

  return (
    <div className={`flex items-center gap-3 ${isModifier ? "py-1" : ""}`}>
      <div className="min-w-0 flex-1">
        <p
          className={`line-clamp-2 font-bold leading-5 ${
            isModifier ? "text-sm text-[#c3c6d6]" : "text-[#e1e2ec]"
          }`}
        >
          {isModifier ? "+ " : ""}
          {item.name}
        </p>
        <p className="text-sm font-medium text-[#c3c6d6]">
          {Number(item.price).toFixed(2)} &euro; c/u
        </p>
        {visibleNote && (
          <p className="mt-0.5 truncate text-xs font-semibold italic text-[#f6c453]">
            Nota: {visibleNote}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onUpdateQty(item.line_id, -1)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#32343c] text-lg font-bold text-[#e1e2ec] transition-colors hover:bg-[#3a3d46] active:bg-[#282a31]"
        >
          -
        </button>
        <span className="w-7 text-center font-bold text-[#e1e2ec]">{item.qty}</span>
        <button
          onClick={() => onUpdateQty(item.line_id, 1)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#32343c] text-lg font-bold text-[#e1e2ec] transition-colors hover:bg-[#3a3d46] active:bg-[#282a31]"
        >
          +
        </button>
      </div>

      <div className="flex min-w-[58px] flex-col items-end gap-1">
        <span className="font-bold text-[#e1e2ec]">
          {(item.price * item.qty).toFixed(2)} &euro;
        </span>
        <div className="flex gap-2">
          {!modifierParent && (
            <button
              onClick={() => onEditNote(item)}
              className="text-xs font-bold text-[#f6c453] transition-colors hover:text-[#ffe08a]"
            >
              Nota
            </button>
          )}
          <button
            onClick={() => onRemove(item.line_id)}
            className="text-xs font-bold text-[#ffb4ab] transition-colors hover:text-[#ffd5d0]"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
