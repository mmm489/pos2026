"use client";

import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { Order } from "@/types/pos";
import { onDemoEvent, broadcastOrderUpdated } from "@/lib/demo-channel";
import OrderCard from "@/components/kds/OrderCard";

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    // Audio not available
  }
}

export default function KdsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(new Date());
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [wideOrderIds, setWideOrderIds] = useState<Set<number>>(new Set());
  const prevCountRef = useRef(0);
  const ordersScrollerRef = useRef<HTMLDivElement>(null);
  const localReadyRef = useRef(new Map<string, boolean>());
  const lastReadyToggleRef = useRef(new Map<string, number>());

  const applyLocalReady = useCallback((order: Order): Order => {
    if (!order.items?.length || localReadyRef.current.size === 0) return order;
    return {
      ...order,
      items: order.items.map((item) => {
        const key = `${order.id}:${item.id}`;
        if (!localReadyRef.current.has(key)) return item;
        return { ...item, kds_ready: localReadyRef.current.get(key) };
      }),
    };
  }, []);

  // Try to load orders from API, otherwise start empty (demo mode)
  useEffect(() => {
    fetch("/api/pos/orders?status=pending,preparing")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        setOrders((data as Order[]).map(applyLocalReady));
        setLoading(false);
      })
      .catch(() => {
        // No DB — start empty, orders will come via BroadcastChannel
        setOrders([]);
        setLoading(false);
      });
  }, [applyLocalReady]);

  // Listen for demo events via BroadcastChannel
  useEffect(() => {
    const unsub = onDemoEvent((event) => {
      if (event.type === "new-order") {
        const order = event.order as Order;
        setOrders((prev) => {
          if (prev.some((o) => o.id === order.id)) return prev;
          return [...prev, order];
        });
      }
      if (event.type === "order-updated") {
        const { id, status } = event as { id: number; status: string; type: string };
        setOrders((prev) =>
          prev
            .map((o) => (o.id === id ? { ...o, status: status as Order["status"] } : o))
            .filter((o) => o.status !== "completed" && o.status !== "ready" && o.status !== "cancelled")
        );
      }
    });
    return unsub;
  }, []);

  // Poll API for new/updated orders every 3s (works across machines)
  useEffect(() => {
    const interval = setInterval(() => {
      fetch("/api/pos/orders?status=pending,preparing")
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((data: Order[]) => {
          setOrders((prev) => {
            // Merge: keep new orders, update existing, remove completed
            const merged = data.map((o) => {
              const nextOrder = applyLocalReady(o);
              const existing = prev.find((p) => p.id === o.id);
              return existing ? { ...existing, ...nextOrder } : nextOrder;
            });
            return merged;
          });
        })
        .catch(() => {});
    }, 1500);
    return () => clearInterval(interval);
  }, [applyLocalReady]);

  // Clock
  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Beep on new order
  useEffect(() => {
    if (orders.length > prevCountRef.current && prevCountRef.current >= 0 && prevCountRef.current !== orders.length) {
      playBeep();
    }
    prevCountRef.current = orders.length;
  }, [orders.length]);

  const handleStatusChange = useCallback(async (orderId: number, status: string) => {
    // Update locally immediately
    setOrders((prev) =>
      prev
        .map((o) => (o.id === orderId ? { ...o, status: status as Order["status"] } : o))
        .filter((o) => o.status !== "completed" && o.status !== "ready" && o.status !== "cancelled")
    );

    // Try API
    try {
      await fetch(`/api/pos/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch {
      // API not available — broadcast for demo mode
      broadcastOrderUpdated({ id: orderId, status });
    }
  }, []);

  const handleItemReadyChange = useCallback(async (orderId: number, itemId: number, ready: boolean) => {
    const localKey = `${orderId}:${itemId}`;
    const now = Date.now();
    const lastToggleAt = lastReadyToggleRef.current.get(localKey) || 0;
    if (now - lastToggleAt < 700) return;

    lastReadyToggleRef.current.set(localKey, now);
    localReadyRef.current.set(localKey, ready);

    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        return {
          ...order,
          items: order.items?.map((item) =>
            item.id === itemId ? { ...item, kds_ready: ready } : item
          ),
        };
      })
    );

    try {
      const res = await fetch(`/api/pos/orders/${orderId}/items/${itemId}/ready`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ready }),
      });
      if (!res.ok) throw new Error("Error updating item");
    } catch {
      // Keep the optimistic state in local/demo mode so the item does not
      // visibly uncheck itself when the API is unavailable.
    }
  }, []);

  const handleCloseKds = useCallback(() => {
    if (!window.confirm("Cerrar la pantalla de cocina?")) return;

    window.open("", "_self");
    window.close();
  }, []);

  const updateVisibleRange = useCallback(() => {
    const scroller = ordersScrollerRef.current;
    if (!scroller) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const cards = Array.from(
      scroller.querySelectorAll<HTMLElement>("[data-kds-order-index]")
    );
    const fullyVisible = cards.filter((card) => {
      const rect = card.getBoundingClientRect();
      return rect.left >= scrollerRect.left - 1 && rect.right <= scrollerRect.right + 1;
    });
    const partiallyVisible = cards.filter((card) => {
      const rect = card.getBoundingClientRect();
      return rect.right > scrollerRect.left + 1 && rect.left < scrollerRect.right - 1;
    });
    const visibleCards = fullyVisible.length > 0 ? fullyVisible : partiallyVisible;
    const indexes = visibleCards
      .map((card) => Number(card.dataset.kdsOrderIndex))
      .filter(Number.isFinite);

    setVisibleRange({
      start: indexes.length > 0 ? Math.min(...indexes) : 0,
      end: indexes.length > 0 ? Math.max(...indexes) : 0,
    });
    setCanScrollLeft(scroller.scrollLeft > 2);
    setCanScrollRight(
      scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 2
    );
  }, []);

  useEffect(() => {
    setWideOrderIds((current) => {
      const activeIds = new Set(orders.map((order) => order.id));
      const next = new Set(Array.from(current).filter((id) => activeIds.has(id)));
      return next.size === current.size ? current : next;
    });

    const frame = window.requestAnimationFrame(updateVisibleRange);
    return () => window.cancelAnimationFrame(frame);
  }, [orders, updateVisibleRange]);

  useEffect(() => {
    window.addEventListener("resize", updateVisibleRange);
    return () => window.removeEventListener("resize", updateVisibleRange);
  }, [updateVisibleRange]);

  const handleOrderOverflow = useCallback((orderId: number) => {
    setWideOrderIds((current) => {
      if (current.has(orderId)) return current;
      const next = new Set(current);
      next.add(orderId);
      return next;
    });
  }, []);

  const scrollOrders = useCallback(
    (direction: -1 | 1) => {
      const scroller = ordersScrollerRef.current;
      if (!scroller) return;

      const targetIndex = Math.max(
        0,
        Math.min(
          orders.length - 1,
          direction > 0 ? visibleRange.end + 1 : visibleRange.start - 1
        )
      );
      const target = scroller.querySelector<HTMLElement>(
        `[data-kds-order-index="${targetIndex}"]`
      );
      target?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    },
    [orders.length, visibleRange]
  );

  const rangeLabel = orders.length
    ? `${visibleRange.start + 1}-${Math.min(visibleRange.end + 1, orders.length)} de ${orders.length}`
    : "0 de 0";

  const scrollerStyle = {
    "--kds-card-width": "max(220px, calc((100vw - 110px) / 5))",
  } as CSSProperties;

  return (
    <div className="h-dvh overflow-hidden bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <h1 className="text-lg font-bold text-white">
          Hi Cream — Cocina
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold text-yellow-400">
            {orders.length} actiu{orders.length !== 1 ? "s" : ""}
          </span>
          {orders.length > 0 && (
            <span className="rounded bg-gray-700 px-2 py-1 text-sm font-black text-white">
              {rangeLabel}
            </span>
          )}
          <span className="text-base font-mono text-gray-300">
            {clock.toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <button
            type="button"
            onClick={handleCloseKds}
            className="flex h-9 w-9 items-center justify-center border border-gray-600 bg-gray-700 text-2xl leading-none text-white transition-colors hover:bg-red-600 active:bg-red-700"
            aria-label="Cerrar KDS"
            title="Cerrar KDS"
          >
            &times;
          </button>
        </div>
      </header>

      {/* Orders grid */}
      <main className="relative flex-1 min-h-0 p-2">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xl text-gray-500">Cargando pedidos...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-4xl text-gray-600 mb-2">&#10003;</p>
              <p className="text-2xl text-gray-500 font-semibold">
                Sin pedidos pendientes
              </p>
              <p className="text-gray-600 mt-2">
                Los pedidos del POS apareceran aqui
              </p>
            </div>
          </div>
        ) : (
          <div className="relative h-full">
            <div
              ref={ordersScrollerRef}
              onScroll={updateVisibleRange}
              className="kds-order-scroller flex h-full snap-x snap-mandatory gap-2 overflow-x-auto overflow-y-hidden touch-pan-x"
              style={scrollerStyle}
            >
              {orders.map((order, index) => {
                const wide = wideOrderIds.has(order.id);
                return (
                  <div
                    key={order.id}
                    data-kds-order-index={index}
                    data-kds-wide={wide ? "true" : "false"}
                    className="h-full flex-none snap-start"
                    style={{
                      width: wide
                        ? "calc(var(--kds-card-width) + var(--kds-card-width) + 0.5rem)"
                        : "var(--kds-card-width)",
                    }}
                  >
                    <OrderCard
                      order={order}
                      wide={wide}
                      onNeedsMoreSpace={handleOrderOverflow}
                      onStatusChange={handleStatusChange}
                      onItemReadyChange={handleItemReadyChange}
                    />
                  </div>
                );
              })}
            </div>

            {canScrollLeft && (
              <button
                type="button"
                onClick={() => scrollOrders(-1)}
                className="absolute left-1 top-1/2 z-20 flex h-20 w-11 -translate-y-1/2 items-center justify-center border border-white/40 bg-gray-900/85 text-4xl font-black text-white shadow-lg active:bg-gray-700"
                aria-label="Ver comandas anteriores"
              >
                &#8249;
              </button>
            )}
            {canScrollRight && (
              <button
                type="button"
                onClick={() => scrollOrders(1)}
                className="absolute right-1 top-1/2 z-20 flex h-20 w-11 -translate-y-1/2 items-center justify-center border border-white/40 bg-gray-900/85 text-4xl font-black text-white shadow-lg active:bg-gray-700"
                aria-label="Ver més comandas"
              >
                &#8250;
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
