"use client";

import { useState } from "react";

const KEY_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "\u00f1"],
  ["z", "x", "c", "v", "b", "n", "m", ",", "."],
];

const QUICK_TEXTS = ["sense", "amb", "extra", "sucre", "lactosa", "nata", "xocolata"];

interface TouchKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  onDone?: () => void;
  compact?: boolean;
  quickTexts?: string[];
}

function appendText(value: string, text: string) {
  if (!text) return value;
  if (!value) return text;
  if (/\s$/.test(value) || /^[,.;:!?]/.test(text)) return `${value}${text}`;
  return `${value} ${text}`;
}

export default function TouchKeyboard({
  value,
  onChange,
  onDone,
  compact = false,
  quickTexts = QUICK_TEXTS,
}: TouchKeyboardProps) {
  const [shift, setShift] = useState(false);

  const pressKey = (key: string) => {
    onChange(value + (shift ? key.toLocaleUpperCase("ca-ES") : key));
    if (shift) setShift(false);
  };

  const pressQuick = (text: string) => {
    onChange(appendText(value, text));
  };

  const backspace = () => {
    onChange(value.slice(0, -1));
  };

  return (
    <div className="rounded-xl border border-[#ddd4c4] bg-[#f4f0e8] p-2">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {quickTexts.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => pressQuick(text)}
            className="rounded-lg border border-[#d4cbbb] bg-white px-3 py-2 text-[13px] font-medium text-[#241f1c] active:bg-[#e6dfd2]"
          >
            {text}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {KEY_ROWS.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className={`grid gap-1.5 ${
              rowIndex === 2 ? "grid-cols-11" : "grid-cols-10"
            }`}
          >
            {rowIndex === 2 && (
              <button
                type="button"
                onClick={() => setShift((current) => !current)}
                className={`rounded-lg border px-2 font-medium active:bg-[#e6dfd2] ${
                  compact ? "min-h-[38px] text-[13px]" : "min-h-[44px] text-[15px]"
                } ${
                  shift
                    ? "border-[#2e9e5b] bg-[#dff5e8] text-[#17633c]"
                    : "border-[#d4cbbb] bg-white text-[#241f1c]"
                }`}
              >
                Maj
              </button>
            )}
            {row.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => pressKey(key)}
                className={`rounded-lg border border-[#d4cbbb] bg-white font-medium text-[#241f1c] active:bg-[#e6dfd2] ${
                  compact ? "min-h-[38px] text-[16px]" : "min-h-[44px] text-[18px]"
                }`}
              >
                {shift ? key.toLocaleUpperCase("ca-ES") : key}
              </button>
            ))}
            {rowIndex === 2 && (
              <button
                type="button"
                onClick={backspace}
                className={`rounded-lg border border-[#d4cbbb] bg-white px-2 font-medium text-[#241f1c] active:bg-[#e6dfd2] ${
                  compact ? "min-h-[38px] text-[13px]" : "min-h-[44px] text-[15px]"
                }`}
              >
                Borrar
              </button>
            )}
          </div>
        ))}
      </div>

      <div
        className={`mt-1.5 grid gap-1.5 ${
          onDone ? "grid-cols-[1fr_2fr_1fr]" : "grid-cols-[1fr_2fr]"
        }`}
      >
        <button
          type="button"
          onClick={() => onChange("")}
          className={`rounded-lg border border-[#d4cbbb] bg-white font-medium text-[#b84335] active:bg-[#f4e3df] ${
            compact ? "min-h-[38px] text-[13px]" : "min-h-[44px] text-[15px]"
          }`}
        >
          Netejar
        </button>
        <button
          type="button"
          onClick={() => onChange(`${value} `)}
          className={`rounded-lg border border-[#d4cbbb] bg-white font-medium text-[#241f1c] active:bg-[#e6dfd2] ${
            compact ? "min-h-[38px] text-[13px]" : "min-h-[44px] text-[15px]"
          }`}
        >
          Espai
        </button>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className={`rounded-lg bg-[#2e9e5b] font-medium text-white active:bg-[#27874e] ${
              compact ? "min-h-[38px] text-[13px]" : "min-h-[44px] text-[15px]"
            }`}
          >
            Fet
          </button>
        )}
      </div>
    </div>
  );
}
