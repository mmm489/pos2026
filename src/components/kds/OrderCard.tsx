"use client";

import { useEffect, useState } from "react";
import { Order } from "@/types/pos";

interface OrderCardProps {
  order: Order;
  onStatusChange: (orderId: number, status: string) => void;
}

function getElapsedSeconds(createdAt: string) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
}

function formatTimer(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getTimerColor(seconds: number) {
  if (seconds < 120) return "bg-green-500";
  if (seconds < 240) return "bg-yellow-500";
  return "bg-red-500";
}

export default function OrderCard({ order, onStatusChange }: OrderCardProps) {
  const [elapsed, setElapsed] = useState(getElapsedSeconds(order.created_at));
  const [readyItems, setReadyItems] = useState<Set<number>>(new Set());

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(getElapsedSeconds(order.created_at));
    }, 1000);
    return () => clearInterval(interval);
  }, [order.created_at]);

  const timerColor = getTimerColor(elapsed);
  const totalItems = order.items?.length || 0;
  const readyCount = readyItems.size;
  const allReady = totalItems > 0 && readyCount === totalItems;

  const toggleItem = (itemId: number) => {
    setReadyItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col">
      {/* Timer header */}
      <div
        className={`${timerColor} px-4 py-3 flex items-center justify-between`}
      >
        <div className="flex items-center gap-2">
          <span className="text-4xl font-black text-white">
            {order.order_number}
          </span>
          {order.table_number && (
            <span className="px-2.5 py-0.5 bg-white/30 rounded-lg text-2xl font-black text-white">
              T{order.table_number}
            </span>
          )}
        </div>
        <span className="text-3xl font-mono font-black text-white">
          {formatTimer(elapsed)}
        </span>
      </div>

      {/* Progress bar */}
      {totalItems > 0 && readyCount > 0 && (
        <div className="h-2 bg-gray-100">
          <div
            className="h-full bg-green-400 transition-all duration-300"
            style={{ width: `${(readyCount / totalItems) * 100}%` }}
          />
        </div>
      )}

      {/* Items — tap to mark ready */}
      <div className="flex-1 p-2">
        <ul className="space-y-1.5">
          {order.items?.map((item) => {
            const isReady = readyItems.has(item.id);
            return (
              <li
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all active:scale-[0.98] select-none ${
                  isReady
                    ? "bg-green-100 border border-green-300"
                    : "bg-gray-50 border border-transparent hover:bg-gray-100"
                }`}
              >
                {/* Check icon — big enough to tap with floured fingers */}
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    isReady
                      ? "bg-green-500 text-white"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {isReady ? (
                    <span className="text-xl font-black">&#10003;</span>
                  ) : (
                    <span className="text-lg font-black">{item.qty}</span>
                  )}
                </div>

                {/* Product name */}
                <div className="flex-1 min-w-0">
                  <span
                    className={`text-xl font-bold transition-colors leading-tight block ${
                      isReady ? "text-green-700 line-through" : "text-gray-900"
                    }`}
                  >
                    {item.qty > 1 && !isReady && (
                      <span className="text-gray-500">{item.qty}x </span>
                    )}
                    {item.product_name}
                  </span>
                  {item.notes && (
                    <p className="text-lg font-semibold text-orange-600 leading-tight mt-0.5">
                      ⚠ {item.notes}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Status + action */}
      <div className="p-3 border-t border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span
            className={`px-3 py-1 rounded-full text-base font-bold ${
              order.status === "pending"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-blue-100 text-blue-700"
            }`}
          >
            {order.status === "pending" ? "Pendent" : "Preparant"}
          </span>
          {totalItems > 0 && (
            <span className="text-lg font-bold text-gray-500">
              {readyCount}/{totalItems}
            </span>
          )}
        </div>

        {order.status === "pending" && (
          <button
            onClick={() => onStatusChange(order.id, "preparing")}
            className="w-full py-4 rounded-xl bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-2xl font-black transition-colors"
          >
            PREPARANT
          </button>
        )}
        {order.status === "preparing" && (
          <button
            onClick={() => onStatusChange(order.id, "ready")}
            className={`w-full py-4 rounded-xl text-white text-2xl font-black transition-colors ${
              allReady
                ? "bg-green-500 hover:bg-green-600 active:bg-green-700 animate-pulse"
                : "bg-green-500 hover:bg-green-600 active:bg-green-700"
            }`}
          >
            {allReady ? "TOT LLEST!" : "LLEST"}
          </button>
        )}
      </div>
    </div>
  );
}
