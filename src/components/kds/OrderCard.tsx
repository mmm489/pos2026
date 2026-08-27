"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Order } from "@/types/pos";
import {
  getModifierDisplayName,
  getModifierParent,
  getVisibleItemNote,
  groupItemsWithModifiers,
} from "@/lib/item-grouping";

interface OrderCardProps {
  order: Order;
  wide?: boolean;
  onNeedsMoreSpace?: (orderId: number) => void;
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

function compactModifierLabel(name: string) {
  return name
    .replace(/^Sabor gelat\s*:/i, "Gelat:")
    .replace(/^Bola gelat\s*:/i, "Bola:");
}

type CardDensity = "normal" | "dense" | "ultra";

export default function OrderCard({
  order,
  wide = false,
  onNeedsMoreSpace,
  onStatusChange,
  onItemReadyChange,
}: OrderCardProps) {
  const [elapsed, setElapsed] = useState(getElapsedSeconds(order.created_at));
  const totalItems = order.items?.length || 0;
  const initialDensity: CardDensity = totalItems >= 14 ? "dense" : "normal";
  const [density, setDensity] = useState<CardDensity>(initialDensity);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(getElapsedSeconds(order.created_at));
    }, 1000);
    return () => clearInterval(interval);
  }, [order.created_at]);

  const timerColor = getTimerColor(elapsed);
  const readyCount = order.items?.filter((item) => item.kds_ready).length || 0;
  const allReady = totalItems > 0 && readyCount === totalItems;
  const groupedItems = useMemo(
    () =>
      groupItemsWithModifiers(
        order.items || [],
        (item) => item.product_name || "",
        (item) => item.notes
      ),
    [order.items]
  );

  useEffect(() => {
    setDensity(totalItems >= 14 ? "dense" : "normal");
  }, [order.id, totalItems]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const measure = () => {
      if (content.scrollHeight <= content.clientHeight + 2) return;
      if (density === "normal") {
        setDensity("dense");
        return;
      }
      if (density === "dense") {
        setDensity("ultra");
        return;
      }
      if (!wide) onNeedsMoreSpace?.(order.id);
    };

    const frame = window.requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [density, groupedItems, onNeedsMoreSpace, order.id, wide]);

  const isDense = density !== "normal";
  const isUltra = density === "ultra";

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
    <div className="h-full bg-white rounded-lg shadow-md overflow-hidden flex flex-col min-h-0">
      <div
        className={`${timerColor} px-2 py-1 flex items-center justify-between flex-shrink-0`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xl font-black leading-none text-white truncate">
            {order.order_number}
          </span>
          {order.table_number && (
            <span className="px-1.5 py-0.5 bg-white/30 rounded text-sm font-black leading-none text-white flex-shrink-0">
              T{order.table_number}
            </span>
          )}
          <span className="px-1.5 py-0.5 bg-white/30 rounded text-sm font-black leading-none text-white flex-shrink-0">
            {serviceLabel(order.service_type)}
          </span>
        </div>
        <span className="text-lg font-mono font-black leading-none text-white flex-shrink-0">
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

      <div ref={contentRef} className="flex-1 p-1 overflow-hidden min-h-0">
        <ul className={wide ? "columns-2 gap-1" : "space-y-1"}>
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
                className={`break-inside-avoid rounded-md border transition-all select-none ${wide ? "mb-1" : ""} ${
                  groupReady
                    ? "bg-green-100 border-green-300"
                    : groupPartial
                    ? "bg-yellow-50 border-yellow-200"
                    : "bg-gray-50 border-transparent"
                }`}
              >
                <div
                  onClick={() => toggleGroup(groupItems)}
                  className={`flex cursor-pointer items-center active:scale-[0.98] ${
                    isUltra ? "gap-1 px-1 py-0.5" : "gap-1.5 px-1.5 py-1"
                  }`}
                >
                  <ReadyBadge
                    ready={groupReady}
                    partial={groupPartial}
                    qty={base.qty}
                    density={density}
                  />

                  <div className="min-w-0 flex-1">
                    <span
                      className={`block truncate font-black leading-tight transition-colors ${
                        isUltra ? "text-xs" : "text-sm"
                      } ${
                        groupReady ? "text-green-700 line-through" : "text-gray-900"
                      }`}
                    >
                      {isOrphanModifier ? "+ " : ""}
                      {getModifierDisplayName(base.product_name || "", base.notes)}
                    </span>
                    {visibleBaseNote && (
                      <div className={`mt-0.5 flex items-start gap-1 rounded border border-violet-300 bg-violet-100 ${isUltra ? "px-1 py-0.5" : "px-1.5 py-1"}`}>
                        <span className="mt-px flex-shrink-0 rounded bg-violet-600 px-1 py-0.5 text-[9px] font-black uppercase leading-none text-white">
                          Nota
                        </span>
                        <p className={`min-w-0 break-words font-black leading-tight text-violet-950 ${isUltra ? "text-xs" : "text-sm"}`}>
                          {visibleBaseNote}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {modifiers.length > 0 && (
                  <div className={`${isUltra ? "ml-5 pl-1" : "ml-7 pl-1.5"} mr-1 mb-1 border-l-2 border-orange-300`}>
                    <p className="mb-0.5 text-[8px] font-black uppercase leading-none text-orange-600">
                      Complements
                    </p>
                    <div className="flex flex-wrap gap-0.5">
                      {modifiers.map((modifier) => {
                        const modifierReady = Boolean(modifier.kds_ready);
                        return (
                          <div
                            key={modifier.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleItem(modifier.id);
                            }}
                            className={`flex cursor-pointer items-center gap-0.5 rounded border px-0.5 transition-colors ${
                              isUltra ? "min-h-5 py-0" : "min-h-6 py-0.5"
                            } ${
                              modifierReady
                                ? "border-green-200 bg-green-50"
                                : "border-gray-200 bg-white"
                            }`}
                          >
                            <ReadyBadge
                              ready={modifierReady}
                              qty={modifier.qty}
                              small
                              density={density}
                            />
                            <span
                              className={`whitespace-nowrap font-bold leading-none ${
                                isUltra ? "text-[10px]" : isDense ? "text-[11px]" : "text-xs"
                              } ${
                                modifierReady
                                  ? "text-green-700 line-through"
                                  : "text-gray-700"
                              }`}
                            >
                              {compactModifierLabel(
                                getModifierDisplayName(
                                  modifier.product_name || "",
                                  modifier.notes
                                )
                              )}
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

      <div className="px-1.5 py-1.5 border-t border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span
            className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold leading-none ${
              order.status === "pending"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-blue-100 text-blue-700"
            }`}
          >
            {order.status === "pending" ? "Pendent" : "Preparant"}
          </span>
          {totalItems > 0 && (
            <span className="text-xs font-bold text-gray-500">
              {readyCount}/{totalItems}
            </span>
          )}
        </div>

        {order.status === "pending" && (
          <button
            onClick={() => onStatusChange(order.id, "preparing")}
            className="w-full py-1.5 rounded-md bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-base font-black transition-colors"
          >
            PREPARANT
          </button>
        )}
        {order.status === "preparing" && (
          <button
            onClick={() => onStatusChange(order.id, "ready")}
            className={`w-full py-1.5 rounded-md text-white text-base font-black transition-colors ${
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
  density = "normal",
}: {
  ready: boolean;
  partial?: boolean;
  qty: number;
  small?: boolean;
  density?: CardDensity;
}) {
  const isUltra = density === "ultra";
  const dimensions = small
    ? isUltra
      ? "w-4 h-4"
      : "w-5 h-5"
    : isUltra
    ? "w-5 h-5"
    : "w-7 h-7";

  return (
    <div
      className={`${dimensions} rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
        ready
          ? "bg-green-500 text-white"
          : partial
          ? "bg-yellow-400 text-white"
          : qty > 1
          ? "bg-orange-500 text-white ring-2 ring-orange-200"
          : "bg-gray-200 text-gray-700"
      }`}
    >
      {ready ? (
        <span className={`${small || isUltra ? "text-[10px]" : "text-sm"} font-black`}>
          &#10003;
        </span>
      ) : partial ? (
        <span className={`${small || isUltra ? "text-[10px]" : "text-sm"} font-black`}>...</span>
      ) : (
        <span className={`${small || isUltra ? "text-[9px]" : "text-sm"} font-black`}>{qty}</span>
      )}
    </div>
  );
}
