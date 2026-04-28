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
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-pink-50 to-pink-100 py-6 gap-4">
      <div className="bg-white rounded-3xl shadow-xl p-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-pink-500">Hi Cream</h1>
          <p className="text-gray-500 mt-1">Introduce tu PIN</p>
        </div>

        {/* PIN display */}
        <div className="flex justify-center gap-4 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                pin.length > i
                  ? "border-pink-400 bg-pink-50 text-pink-600"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              {pin.length > i ? "\u2022" : ""}
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <p className="text-center text-red-500 text-sm mb-4">{error}</p>
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
                  className="h-16 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-600 text-lg font-semibold transition-colors"
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
                className="h-16 rounded-xl bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-gray-800 text-2xl font-semibold transition-colors"
              >
                {d}
              </button>
            );
          })}
        </div>

        {loading && (
          <div className="mt-4 text-center text-gray-500">Verificando...</div>
        )}
      </div>

      <DeviceStatusBar className="max-w-md w-full px-4" />
    </div>
  );
}
