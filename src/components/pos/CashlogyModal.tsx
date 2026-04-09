"use client";

import { useEffect, useState } from "react";
import { getCashlogyState } from "@/lib/bridge";

interface CashlogyModalProps {
  onClose: () => void;
}

interface DenominationInfo {
  value: number;
  quantity: number;
}

export default function CashlogyModal({ onClose }: CashlogyModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<Record<string, unknown> | null>(null);

  const fetchState = async () => {
    setLoading(true);
    setError(null);
    const result = await getCashlogyState();
    if (result.error) {
      setError(result.error);
    } else {
      setState(result);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchState();
  }, []);

  // Parse denominations from cashlogy state
  function parseDenominations(): { coins: DenominationInfo[]; bills: DenominationInfo[]; total: number } {
    if (!state) return { coins: [], bills: [], total: 0 };

    const coins: DenominationInfo[] = [];
    const bills: DenominationInfo[] = [];
    let total = 0;

    // CashlogyConnector returns denomination data in various formats
    // Try to extract from recyclers/coinbox/stacker etc.
    const denominations = state.denominations || state.inventory || state.content || state;

    if (Array.isArray(denominations)) {
      for (const d of denominations) {
        const value = (d.value || d.denomination || 0) as number;
        const qty = (d.quantity || d.count || d.qty || 0) as number;
        if (value > 0 && qty > 0) {
          const valueCents = value >= 100 ? value : value * 100;
          const valueEur = valueCents / 100;
          total += valueEur * qty;
          if (valueEur >= 5) {
            bills.push({ value: valueEur, quantity: qty });
          } else {
            coins.push({ value: valueEur, quantity: qty });
          }
        }
      }
    } else if (typeof denominations === "object" && denominations !== null) {
      // Could be { "500": 3, "200": 1, ... } format (cents) or nested
      for (const [key, val] of Object.entries(denominations as Record<string, unknown>)) {
        const numKey = parseFloat(key);
        const qty = typeof val === "number" ? val : (val as { quantity?: number })?.quantity || 0;
        if (!isNaN(numKey) && qty > 0) {
          const valueEur = numKey >= 100 ? numKey / 100 : numKey;
          total += valueEur * qty;
          if (valueEur >= 5) {
            bills.push({ value: valueEur, quantity: qty });
          } else {
            coins.push({ value: valueEur, quantity: qty });
          }
        }
      }
    }

    coins.sort((a, b) => a.value - b.value);
    bills.sort((a, b) => a.value - b.value);

    // If we couldn't parse denominations but have totals
    if (coins.length === 0 && bills.length === 0) {
      const totalFromState = (state.total || state.totalAmount || state.amount || 0) as number;
      if (totalFromState > 0) {
        total = totalFromState >= 100 ? totalFromState / 100 : totalFromState;
      }
    }

    return { coins, bills, total };
  }

  const { coins, bills, total } = parseDenominations();
  const hasDenominations = coins.length > 0 || bills.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-3xl p-8 w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
          Cashlogy — Inventari
        </h2>

        {loading && (
          <div className="text-center py-8">
            <div className="animate-spin w-12 h-12 border-4 border-gray-200 border-t-emerald-500 rounded-full mx-auto mb-4" />
            <p className="text-gray-500">Consultant Cashlogy...</p>
          </div>
        )}

        {error && (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">&#10060;</span>
            </div>
            <p className="text-red-600 font-semibold mb-2">Error de connexio</p>
            <p className="text-sm text-gray-500 mb-4">{error}</p>
            <button
              onClick={fetchState}
              className="px-6 py-2 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-semibold transition-colors"
            >
              Reintentar
            </button>
          </div>
        )}

        {!loading && !error && state && (
          <>
            {/* Total */}
            <div className="bg-emerald-50 rounded-2xl px-6 py-4 mb-6 text-center">
              <span className="text-sm font-semibold text-emerald-600">TOTAL A CAIXA</span>
              <p className="text-4xl font-bold text-emerald-700">{total.toFixed(2)} &euro;</p>
            </div>

            {hasDenominations ? (
              <>
                {/* Bills */}
                {bills.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-bold text-gray-500 uppercase mb-2">Bitllets</h3>
                    <div className="space-y-1">
                      {bills.map((b) => (
                        <div key={b.value} className="flex justify-between items-center bg-green-50 rounded-xl px-4 py-2">
                          <span className="font-semibold text-gray-700">{b.value.toFixed(2)} &euro;</span>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-500">x{b.quantity}</span>
                            <span className="font-bold text-gray-800">{(b.value * b.quantity).toFixed(2)} &euro;</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Coins */}
                {coins.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-gray-500 uppercase mb-2">Monedes</h3>
                    <div className="space-y-1">
                      {coins.map((c) => (
                        <div key={c.value} className="flex justify-between items-center bg-yellow-50 rounded-xl px-4 py-2">
                          <span className="font-semibold text-gray-700">{c.value < 1 ? `${Math.round(c.value * 100)} ct` : `${c.value.toFixed(2)} \u20AC`}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-500">x{c.quantity}</span>
                            <span className="font-bold text-gray-800">{(c.value * c.quantity).toFixed(2)} &euro;</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Raw state fallback */
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-500 uppercase mb-2">Estat Cashlogy</h3>
                <pre className="bg-gray-50 rounded-xl p-4 text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(state, null, 2)}
                </pre>
              </div>
            )}

            <button
              onClick={fetchState}
              className="w-full py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold transition-colors mb-3"
            >
              Actualitzar
            </button>
          </>
        )}

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 font-semibold transition-colors"
        >
          Tancar
        </button>
      </div>
    </div>
  );
}
