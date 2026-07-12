// ============================================================
// Smart Table — Order Placement Slice
// Sipariş oluşturma ve idempotency yönetimi.
// ============================================================

import type { StateCreator } from "zustand";
import type { CartItem, Order } from "@/types";
import { useAuthStore } from "@/store/auth-store";
import { useTableStore } from "@/store/table-store";
import { submitOrder, resolveTableUuid } from "@/services/orderService";
import {
  buildOrderCreateIdempotencyKey,
  randomUUID,
} from "@/utils/idempotency";
import type { OrderFetchSlice } from "./orderFetchSlice";

export interface OrderPlacementSlice {
  isPlacingOrder: boolean;

  placeOrder: (
    items: CartItem[],
    tableId: string,
    note?: string,
  ) => Promise<Order>;
}

async function resolveActiveTableUuid(
  branchId: string,
  tableName: string | undefined,
  resolvedTableId: string | null,
  onResolved: (tableUuid: string) => void,
): Promise<string | null> {
  const tableStore = useTableStore.getState();

  let tableUuid = tableStore.selectedTable?.id || resolvedTableId;
  const tName = tableStore.selectedTable?.name || tableName;

  if (!tableUuid && tName) {
    tableUuid = await resolveTableUuid(branchId, tName);
    if (tableUuid) {
      onResolved(tableUuid);
    }
  }

  return tableUuid;
}

export const createOrderPlacementSlice: StateCreator<
  OrderPlacementSlice & OrderFetchSlice,
  [],
  [],
  OrderPlacementSlice
> = (set, get) => ({
  isPlacingOrder: false,

  placeOrder: async (items, tableId, note) => {
    if (get().isPlacingOrder) {
      throw new Error("Sipariş zaten gönderiliyor");
    }

    set({ isPlacingOrder: true });

    try {
      const auth = useAuthStore.getState();
      const tableStore = useTableStore.getState();
      const branchId = tableStore.selectedBranch?.id || auth.user?.branch_id;

      if (!auth.isAuthenticated || !branchId) {
        throw new Error("Sipariş vermek için giriş yapmalısınız");
      }

      const tName = tableStore.selectedTable?.name;
      const tableUuid = await resolveActiveTableUuid(
        branchId,
        tName,
        get().resolvedTableId,
        (id) => get().setResolvedTableId(id),
      );
      const resolvedId = tableUuid || tableId;

      if (!resolvedId) {
        throw new Error("Masa seçilmedi");
      }

      const idempotencyKey = buildOrderCreateIdempotencyKey(randomUUID());
      const apiOrder = await submitOrder(
        branchId,
        resolvedId,
        items,
        note,
        idempotencyKey,
      );
      if (!apiOrder) {
        throw new Error("Sipariş gönderilemedi");
      }

      await get().fetchOrders(tName);
      return apiOrder;
    } finally {
      set({ isPlacingOrder: false });
    }
  },
});
