"use client";

import { useState } from "react";
import DeviceStatusBar from "./DeviceStatusBar";

interface PinLoginProps {
  onLogin: (employee: { id: number; name: string; role: string }) => void;
}

export default function PinLogin({ onLogin }: PinLoginProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError("");

      // Auto-submit on 4 digits
      if (newPin.length === 4) {
        submitPin(newPin);
      }
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setError("");
  };

  const demoPins: Record<string, { id: number; name: string; role: string }> = {
    "0000": { id: 1, name: "Admin (Demo)", role: "admin" },
    "1234": { id: 2, name: "María (Demo)", role: "employee" },
    "5678": { id: 3, name: "Carlos (Demo)", role: "employee" },
  };

  const submitPin = async (pinValue: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/pos/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinValue }),
      });

      if (res.ok) {
        const employee = await res.json();
        onLogin(employee);
        return;
      }

      // API returned error — if it's a 500 (DB down), try demo fallback
      if (res.status >= 500 && demoPins[pinValue]) {
        onLogin(demoPins[pinValue]);
        return;
      }

      // 401 or other client error — PIN incorrecto
      const data = await res.json().catch(() => ({}));
      setError(data.error || "PIN incorrecto");
      setPin("");
    } catch {
      // Network error — try demo fallback
      if (demoPins[pinValue]) {
        onLogin(demoPins[pinValue]);
        return;
      }
      setError("PIN incorrecto");
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f5f7fb] px-4 py-6">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-lg bg-slate-950 text-lg font-black text-white shadow-sm">
            HC
          </div>
          <h1 className="text-4xl font-black text-slate-950">Hi Cream</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Introduce tu PIN</p>
        </div>

        {/* PIN display */}
        <div className="flex justify-center gap-4 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`flex h-14 w-14 items-center justify-center rounded-lg border text-2xl font-black transition-all ${
                pin.length > i
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              {pin.length > i ? "\u2022" : ""}
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <p className="mb-4 text-center text-sm font-semibold text-red-500">{error}</p>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3">
          {digits.map((d, i) => {
            if (d === "") return <div key={i} />;
            if (d === "del") {
              return (
                <button
                  key={i}
                  onClick={handleDelete}
                  disabled={loading}
                  className="h-16 rounded-lg bg-slate-100 text-lg font-bold text-slate-600 transition-colors hover:bg-slate-200 active:bg-slate-300"
                >
                  &#9003;
                </button>
              );
            }
            return (
              <button
                key={i}
                onClick={() => handleDigit(d)}
                disabled={loading || pin.length >= 4}
                className="h-16 rounded-lg bg-slate-50 text-2xl font-bold text-slate-950 ring-1 ring-slate-200 transition-colors hover:bg-slate-100 active:bg-slate-200"
              >
                {d}
              </button>
            );
          })}
        </div>

        {loading && (
          <div className="mt-4 text-center text-sm font-semibold text-slate-500">Verificando...</div>
        )}
      </div>

      <DeviceStatusBar className="max-w-md w-full px-4" />
    </div>
  );
}
