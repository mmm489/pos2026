"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const prevCountRef = useRef(0);
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

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <h1 className="text-lg font-bold text-white">
          Hi Cream — Cocina
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-base font-semibold text-yellow-400">
            {orders.length} actiu{orders.length !== 1 ? "s" : ""}
          </span>
          <span className="text-base font-mono text-gray-300">
            {clock.toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </header>

      {/* Orders grid */}
      <main className="flex-1 p-3 min-h-0">
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
          <div
            className="grid gap-2 h-full"
            style={{
              gridTemplateColumns: `repeat(${
                orders.length <= 2 ? orders.length
                : orders.length <= 4 ? 2
                : orders.length <= 6 ? 3
                : 4
              }, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${
                orders.length <= 2 ? 1
                : 2
              }, minmax(0, 1fr))`,
            }}
          >
            {orders.slice(0, 8).map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onStatusChange={handleStatusChange}
                onItemReadyChange={handleItemReadyChange}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
