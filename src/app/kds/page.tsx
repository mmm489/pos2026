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

  // Try to load orders from API, otherwise start empty (demo mode)
  useEffect(() => {
    fetch("/api/pos/orders?status=pending,preparing")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        setOrders(data);
        setLoading(false);
      })
      .catch(() => {
        // No DB — start empty, orders will come via BroadcastChannel
        setOrders([]);
        setLoading(false);
      });
  }, []);

  // Listen for demo events via BroadcastChannel
  useEffect(() => {
    const unsub = onDemoEvent((event) => {
      if (event.type === "new-order") {
        const order = event.order as Order;
        setOrders((prev) => {
          if (prev.some((o) => o.id === order.id)) return prev;
          return [order, ...prev];
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
              const existing = prev.find((p) => p.id === o.id);
              return existing ? { ...existing, ...o } : o;
            });
            return merged;
          });
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, []);

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

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-gray-800 border-b border-gray-700">
        <h1 className="text-2xl font-bold text-white">
          Hi Cream — Cocina
        </h1>
        <div className="flex items-center gap-6">
          <span className="text-lg font-semibold text-yellow-400">
            {orders.length} pedido{orders.length !== 1 ? "s" : ""} activo
            {orders.length !== 1 ? "s" : ""}
          </span>
          <span className="text-xl font-mono text-gray-300">
            {clock.toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </div>
      </header>

      {/* Orders grid */}
      <main className="flex-1 p-6">
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
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))" }}
          >
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
