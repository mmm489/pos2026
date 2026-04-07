// BroadcastChannel for demo mode — allows POS and KDS tabs to communicate
// without Pusher or database

import { Order } from "@/types/pos";

const CHANNEL_NAME = "pos-demo";

let channel: BroadcastChannel | null = null;

function getChannel() {
  if (!channel && typeof window !== "undefined") {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

export function broadcastNewOrder(order: Order) {
  getChannel()?.postMessage({ type: "new-order", order });
}

export function broadcastOrderUpdated(data: {
  id: number;
  status: string;
}) {
  getChannel()?.postMessage({ type: "order-updated", ...data });
}

export function onDemoEvent(
  callback: (event: { type: string; [key: string]: unknown }) => void
) {
  const ch = getChannel();
  if (!ch) return () => {};

  const handler = (e: MessageEvent) => callback(e.data);
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}
