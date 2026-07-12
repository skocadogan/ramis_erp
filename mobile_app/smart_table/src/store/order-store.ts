// ============================================================
// Smart Table — Order Store
//
// Zustand slice'larının birleşimi: sipariş getirme, sipariş verme,
// garson çağırma ve WebSocket senkronizasyonu.
// Dışarıya açılan API değişmemiştir.
// ============================================================

import { create } from "zustand";
import {
  createOrderFetchSlice,
  type OrderFetchSlice,
} from "./order/orderFetchSlice";
import {
  createOrderPlacementSlice,
  type OrderPlacementSlice,
} from "./order/orderPlacementSlice";
import {
  createOrderWaiterSlice,
  type OrderWaiterSlice,
} from "./order/orderWaiterSlice";
import { createOrderWsSlice, type OrderWsSlice } from "./order/orderWsSlice";
import type { WsOrderStatusPayload } from "./order/types";

export type { WsOrderStatusPayload };

export interface OrderState
  extends
    OrderFetchSlice,
    OrderPlacementSlice,
    OrderWaiterSlice,
    OrderWsSlice {}

export const useOrderStore = create<OrderState>((set, get, api) => ({
  ...createOrderFetchSlice(set, get, api),
  ...createOrderPlacementSlice(set, get, api),
  ...createOrderWaiterSlice(set, get, api),
  ...createOrderWsSlice(set, get, api),
}));
