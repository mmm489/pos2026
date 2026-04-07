"use client";

import { useEffect, useState, useCallback } from "react";
import { Order } from "@/types/pos";
import {
  getPusherClient,
  CHANNEL_ORDERS,
  EVENT_NEW_ORDER,
  EVENT_ORDER_UPDATED,
} from "@/lib/pusher";

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch active orders on mount
  useEffect(() => {
    fetch("/api/pos/orders?status=pending,preparing")
      .then((r) => r.json())
      .then((data) => {
        setOrders(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Subscribe to real-time events
  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(CHANNEL_ORDERS);

    channel.bind(EVENT_NEW_ORDER, (newOrder: Order) => {
      setOrders((prev) => {
        // Avoid duplicates
        if (prev.some((o) => o.id === newOrder.id)) return prev;
        return [newOrder, ...prev];
      });
    });

    channel.bind(
      EVENT_ORDER_UPDATED,
      (data: { id: number; status: string; updated_at: string }) => {
        setOrders((prev) =>
          prev
            .map((o) =>
              o.id === data.id
                ? { ...o, status: data.status as Order["status"] }
                : o
            )
            .filter((o) => o.status !== "completed" && o.status !== "ready")
        );
      }
    );

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(CHANNEL_ORDERS);
    };
  }, []);

  const updateOrderStatus = useCallback(
    async (orderId: number, status: string) => {
      const res = await fetch(`/api/pos/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Error updating status");
      return res.json();
    },
    []
  );

  return { orders, loading, updateOrderStatus };
}
