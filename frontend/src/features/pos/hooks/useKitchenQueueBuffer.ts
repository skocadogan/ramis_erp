"use client";

import { useEffect, useState } from "react";
import { checkPosStationStock } from "@/features/pos/lib/posStationStockCheck";
import {
  DEFAULT_KITCHEN_BUSY_BUFFER_THRESHOLD,
  type KitchenQueueBufferState,
} from "@/features/pos/lib/kitchenQueue";

type CartLine = { product: { id: string }; quantity: number };

const IDLE: KitchenQueueBufferState = {
  expectedBuffer: 0,
  busyThreshold: DEFAULT_KITCHEN_BUSY_BUFFER_THRESHOLD,
};

/**
 * Smart Firing v2 — sepet değiştikçe debounced mutfak kuyruk buffer tahmini.
 * POS CartSidebar ve masalar/garson akışlarında ortak kullanım.
 */
export function useKitchenQueueBuffer(
  cart: CartLine[],
  branchId: string | null | undefined,
  stockTrackingMode: "PRODUCT" | "INGREDIENT" = "PRODUCT",
  debounceMs = 800
): KitchenQueueBufferState {
  const [state, setState] = useState<KitchenQueueBufferState>(IDLE);

  useEffect(() => {
    if (!branchId || cart.length === 0) {
      setState(IDLE);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await checkPosStationStock(
          branchId,
          cart.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
          stockTrackingMode
        );
        const stats = res.smart_firing_stats;
        if (stats?.enabled) {
          setState({
            expectedBuffer: stats.max_buffer_minutes,
            busyThreshold:
              stats.busy_threshold_minutes ?? DEFAULT_KITCHEN_BUSY_BUFFER_THRESHOLD,
          });
        } else {
          setState({
            expectedBuffer: 0,
            busyThreshold:
              stats?.busy_threshold_minutes ?? DEFAULT_KITCHEN_BUSY_BUFFER_THRESHOLD,
          });
        }
      } catch {
        // Sessiz — gönder butonu normal mavi kalır
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [cart, branchId, stockTrackingMode, debounceMs]);

  return state;
}
