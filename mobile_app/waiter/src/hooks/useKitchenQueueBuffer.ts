import { useEffect, useMemo, useState } from "react";
import { checkPosStationStock, type StockTrackingMode } from "../api/posStockCheck";

/** API yanıtı gelmezse kullanılan varsayılan yoğunluk eşiği (dk). */
export const DEFAULT_KITCHEN_BUSY_BUFFER_THRESHOLD = 15;

/** @deprecated API `busy_threshold_minutes` kullanın; geriye dönük alias. */
const KITCHEN_BUSY_BUFFER_THRESHOLD = DEFAULT_KITCHEN_BUSY_BUFFER_THRESHOLD;

void KITCHEN_BUSY_BUFFER_THRESHOLD;

export type KitchenQueueBufferState = {
  expectedBuffer: number;
  busyThreshold: number;
};

type CartLine = { product: { id: string | number }; quantity: number };

const IDLE: KitchenQueueBufferState = {
  expectedBuffer: 0,
  busyThreshold: DEFAULT_KITCHEN_BUSY_BUFFER_THRESHOLD,
};

export function useKitchenQueueBuffer(
  cart: CartLine[],
  branchId: string | null | undefined,
  stockTrackingMode: StockTrackingMode = "PRODUCT",
  debounceMs = 800
): KitchenQueueBufferState {
  const [state, setState] = useState<KitchenQueueBufferState>(IDLE);
  const cartSignature = useMemo(
    () =>
      cart
        .map((i) => `${i.product.id}:${i.quantity}`)
        .sort()
        .join("|"),
    [cart]
  );
  const cartPayload = useMemo(
    () =>
      cartSignature
        ? cartSignature.split("|").map((line) => {
            const [productId, quantity] = line.split(":");
            return { product_id: productId, quantity: Number(quantity) || 0 };
          })
        : [],
    [cartSignature]
  );

  useEffect(() => {
    if (!branchId || cartPayload.length === 0) {
      setState(IDLE);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await checkPosStationStock(branchId, cartPayload, stockTrackingMode);
        const stats = res.smart_firing_stats;
        if (stats?.enabled) {
          setState({
            expectedBuffer: stats.max_buffer_minutes,
            busyThreshold: stats.busy_threshold_minutes ?? DEFAULT_KITCHEN_BUSY_BUFFER_THRESHOLD,
          });
        } else {
          setState({
            expectedBuffer: 0,
            busyThreshold: stats?.busy_threshold_minutes ?? DEFAULT_KITCHEN_BUSY_BUFFER_THRESHOLD,
          });
        }
      } catch {
        // Sessiz — varsayılan yeşil buton
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [cartPayload, branchId, stockTrackingMode, debounceMs]);

  return state;
}
