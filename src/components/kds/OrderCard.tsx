"use client";

import { useEffect, useState } from "react";
import { Order } from "@/types/pos";
import {
  getModifierDisplayName,
  getModifierParent,
  getVisibleItemNote,
  groupItemsWithModifiers,
} from "@/lib/item-grouping";

interface OrderCardProps {
  order: Order;
  onStatusChange: (orderId: number, status: string) => void;
  onItemReadyChange: (orderId: number, itemId: number, ready: boolean) => void;
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

function serviceLabel(serviceType?: string | null) {
  return serviceType === "takeaway" ? "Llevar" : "Aquí";
}

export default function OrderCard({
  order,
  onStatusChange,
  onItemReadyChange,
}: OrderCardProps) {
  const [elapsed, setElapsed] = useState(getElapsedSeconds(order.created_at));

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(getElapsedSeconds(order.created_at));
    }, 1000);
    return () => clearInterval(interval);
  }, [order.created_at]);

  const timerColor = getTimerColor(elapsed);
  const totalItems = order.items?.length || 0;
  const readyCount = order.items?.filter((item) => item.kds_ready).length || 0;
  const allReady = totalItems > 0 && readyCount === totalItems;
  const groupedItems = groupItemsWithModifiers(
    order.items || [],
    (item) => item.product_name || "",
    (item) => item.notes
  );

  const toggleItem = (itemId: number) => {
    const item = order.items?.find((candidate) => candidate.id === itemId);
    onItemReadyChange(order.id, itemId, !item?.kds_ready);
  };

  const toggleGroup = (items: NonNullable<Order["items"]>) => {
    const nextReady = !items.every((item) => item.kds_ready);
    items.forEach((item) => {
      onItemReadyChange(order.id, item.id, nextReady);
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col min-h-0">
      <div
        className={`${timerColor} px-2.5 py-1.5 flex items-center justify-between flex-shrink-0`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-2xl font-black text-white truncate">
            {order.order_number}
          </span>
          {order.table_number && (
            <span className="px-1.5 py-0 bg-white/30 rounded text-lg font-black text-white flex-shrink-0">
              T{order.table_number}
            </span>
          )}
          <span className="px-1.5 py-0 bg-white/30 rounded text-lg font-black text-white flex-shrink-0">
            {serviceLabel(order.service_type)}
          </span>
        </div>
        <span className="text-xl font-mono font-black text-white flex-shrink-0">
          {formatTimer(elapsed)}
        </span>
      </div>

      {totalItems > 0 && readyCount > 0 && (
        <div className="h-1 bg-gray-100 flex-shrink-0">
          <div
            className="h-full bg-green-400 transition-all duration-300"
            style={{ width: `${(readyCount / totalItems) * 100}%` }}
          />
        </div>
      )}

      <div className="flex-1 p-1.5 overflow-y-auto min-h-0">
        <ul className="space-y-1.5">
          {groupedItems.map(({ base, modifiers, isOrphanModifier }) => {
            const groupItems = [base, ...modifiers];
            const groupReady = groupItems.every((item) => item.kds_ready);
            const groupPartial =
              !groupReady && groupItems.some((item) => item.kds_ready);
            const modifierParent = getModifierParent(base.notes);
            const visibleBaseNote = !modifierParent ? getVisibleItemNote(base.notes) : null;

            return (
              <li
                key={base.id}
                className={`rounded-lg border transition-all select-none ${
                  groupReady
                    ? "bg-green-100 border-green-300"
                    : groupPartial
                    ? "bg-yellow-50 border-yellow-200"
                    : "bg-gray-50 border-transparent"
                }`}
              >
                <div
                  onClick={() => toggleGroup(groupItems)}
                  className="flex cursor-pointer items-center gap-2 px-2 py-1.5 active:scale-[0.98]"
                >
                  <ReadyBadge ready={groupReady} partial={groupPartial} qty={base.qty} />

                  <div className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-base font-bold leading-tight transition-colors ${
                        groupReady ? "text-green-700 line-through" : "text-gray-900"
                      }`}
                    >
                      {isOrphanModifier ? "+ " : ""}
                      {getModifierDisplayName(base.product_name || "", base.notes)}
                    </span>
                    {visibleBaseNote && (
                      <div className="mt-1 flex items-start gap-1.5 rounded-md border border-violet-300 bg-violet-100 px-2 py-1.5">
                        <span className="mt-0.5 flex-shrink-0 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-black uppercase leading-none text-white">
                          Nota
                        </span>
                        <p className="min-w-0 break-words text-base font-black leading-snug text-violet-950">
                          {visibleBaseNote}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {modifiers.length > 0 && (
                  <div className="ml-6 mr-2 mb-2 border-l-4 border-orange-300 pl-3">
                    <p className="mb-1 text-[10px] font-black uppercase text-orange-500">
                      Va amb aquest producte
                    </p>
                    <div className="space-y-1">
                      {modifiers.map((modifier) => {
                        const modifierReady = Boolean(modifier.kds_ready);
                        return (
                          <div
                            key={modifier.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleItem(modifier.id);
                            }}
                            className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-colors ${
                              modifierReady ? "bg-green-50" : "bg-white"
                            }`}
                          >
                            <ReadyBadge ready={modifierReady} qty={modifier.qty} small />
                            <span
                              className={`min-w-0 flex-1 truncate text-sm font-bold ${
                                modifierReady
                                  ? "text-green-700 line-through"
                                  : "text-gray-700"
                              }`}
                            >
                              + {getModifierDisplayName(modifier.product_name || "", modifier.notes)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="px-2 py-2 border-t border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              order.status === "pending"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-blue-100 text-blue-700"
            }`}
          >
            {order.status === "pending" ? "Pendent" : "Preparant"}
          </span>
          {totalItems > 0 && (
            <span className="text-sm font-bold text-gray-500">
              {readyCount}/{totalItems}
            </span>
          )}
        </div>

        {order.status === "pending" && (
          <button
            onClick={() => onStatusChange(order.id, "preparing")}
            className="w-full py-2 rounded-lg bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-lg font-black transition-colors"
          >
            PREPARANT
          </button>
        )}
        {order.status === "preparing" && (
          <button
            onClick={() => onStatusChange(order.id, "ready")}
            className={`w-full py-2 rounded-lg text-white text-lg font-black transition-colors ${
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

function ReadyBadge({
  ready,
  partial = false,
  qty,
  small = false,
}: {
  ready: boolean;
  partial?: boolean;
  qty: number;
  small?: boolean;
}) {
  return (
    <div
      className={`${small ? "w-6 h-6" : "w-8 h-8"} rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
        ready
          ? "bg-green-500 text-white"
          : partial
          ? "bg-yellow-400 text-white"
          : "bg-gray-200 text-gray-700"
      }`}
    >
      {ready ? (
        <span className={`${small ? "text-sm" : "text-base"} font-black`}>
          &#10003;
        </span>
      ) : partial ? (
        <span className={`${small ? "text-sm" : "text-base"} font-black`}>...</span>
      ) : (
        <span className={`${small ? "text-xs" : "text-base"} font-black`}>{qty}</span>
      )}
    </div>
  );
}
