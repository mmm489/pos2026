"use client";

import { useMemo, useState } from "react";

interface CustomAmountModalProps {
  onCancel: () => void;
  onConfirm: (amount: number) => void;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "borrar"];

function formatAmountInput(value: string) {
  if (!value) return "0,00";
  const normalized = value.replace(".", ",");
  const [euros, cents = ""] = normalized.split(",");
  return `${euros || "0"}${normalized.includes(",") ? "," : ""}${cents}`;
}

function parseAmount(value: string) {
  const amount = Number(value.replace(",", "."));
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

export default function CustomAmountModal({ onCancel, onConfirm }: CustomAmountModalProps) {
  const [value, setValue] = useState("");

  const amount = useMemo(() => parseAmount(value), [value]);
  const canConfirm = amount > 0;

  const press = (key: string) => {
    if (key === "borrar") {
      setValue((current) => current.slice(0, -1));
      return;
    }

    if (key === ",") {
      setValue((current) => (current.includes(",") || current.includes(".") ? current : `${current || "0"},`));
      return;
    }

    setValue((current) => {
      const normalized = current.replace(".", ",");
      const [, cents = ""] = normalized.split(",");
      if (normalized.includes(",") && cents.length >= 2) return current;
      if (!normalized.includes(",") && normalized.replace(/^0+/, "").length >= 4) return current;
      if (normalized === "0") return key;
      return `${current}${key}`;
    });
  };

  const submit = () => {
    if (!canConfirm) return;
    onConfirm(amount);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-[480px] overflow-hidden rounded-2xl border border-[#d8cfbf] bg-[#faf9f6] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#ded6c8] px-6 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8f887c]">
              Cobro rapido
            </p>
            <h2 className="text-2xl font-medium text-[#241f1c]">Importe libre</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#d4cbbb] bg-white text-2xl text-[#241f1c] active:bg-[#f1eee7]"
            aria-label="Cerrar"
          >
            x
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="mb-4 rounded-2xl border border-[#d4cbbb] bg-white px-5 py-5 text-right">
            <span className="text-[54px] font-semibold leading-none text-[#241f1c]">
              {formatAmountInput(value)} €
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => press(key)}
                className={`min-h-[72px] rounded-xl border text-2xl font-semibold active:brightness-95 ${
                  key === "borrar"
                    ? "border-[#e2c0b8] bg-[#fff4f1] text-[#a33a2c]"
                    : "border-[#d4cbbb] bg-white text-[#241f1c]"
                }`}
              >
                {key === "borrar" ? "Borrar" : key}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-[#ded6c8] bg-[#f5f1e9] px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[58px] rounded-xl border border-[#d4cbbb] bg-white text-lg font-medium text-[#241f1c] active:bg-[#f1eee7]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canConfirm}
            className="min-h-[58px] rounded-xl bg-[#2e9e5b] text-lg font-bold text-white active:bg-[#27874e] disabled:bg-[#d8d2c8] disabled:text-[#8f887c]"
          >
            Afegir
          </button>
        </div>
      </div>
    </div>
  );
}
