"use client";

import { CartItem } from "@/types/pos";

interface CartProps {
  items: CartItem[];
  onUpdateQty: (productId: number, delta: number) => void;
  onRemove: (productId: number) => void;
  onCheckout: () => void;
}

export default function Cart({
  items,
  onUpdateQty,
  onRemove,
  onCheckout,
}: CartProps) {
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <h2 className="text-lg font-bold text-gray-800">Pedido actual</h2>
        <p className="text-sm text-gray-500">
          {items.length} {items.length === 1 ? "producto" : "productos"}
        </p>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p className="text-center">
              Toca un producto para
              <br />
              añadirlo al pedido
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.product_id}
                className="flex items-center gap-3 p-3 rounded-xl bg-gray-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">
                    {item.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {Number(item.price).toFixed(2)} &euro; c/u
                  </p>
                </div>

                {/* Quantity controls */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onUpdateQty(item.product_id, -1)}
                    className="w-10 h-10 rounded-lg bg-gray-200 hover:bg-gray-300 active:bg-gray-400 flex items-center justify-center text-lg font-bold transition-colors"
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-semibold text-gray-800">
                    {item.qty}
                  </span>
                  <button
                    onClick={() => onUpdateQty(item.product_id, 1)}
                    className="w-10 h-10 rounded-lg bg-gray-200 hover:bg-gray-300 active:bg-gray-400 flex items-center justify-center text-lg font-bold transition-colors"
                  >
                    +
                  </button>
                </div>

                {/* Subtotal + delete */}
                <div className="flex flex-col items-end gap-1">
                  <span className="font-bold text-gray-800">
                    {(item.price * item.qty).toFixed(2)} &euro;
                  </span>
                  <button
                    onClick={() => onRemove(item.product_id)}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Total + checkout button */}
      <div className="p-4 border-t border-gray-200 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-lg font-semibold text-gray-600">Total</span>
          <span className="text-2xl font-bold text-gray-900">
            {total.toFixed(2)} &euro;
          </span>
        </div>
        <button
          onClick={onCheckout}
          disabled={items.length === 0}
          className="w-full py-4 rounded-2xl bg-green-500 hover:bg-green-600 active:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xl font-bold transition-colors"
        >
          COBRAR
        </button>
      </div>
    </div>
  );
}
