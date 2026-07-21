// ============================================================
// Smart Table — Order Placement Slice
// Sipariş oluşturma ve idempotency yönetimi.
// ============================================================

import type { StateCreator } from "zustand";
import type { CartItem, Order } from "@/types";
import { useAuthStore } from "@/store/auth-store";
import { useTableStore } from "@/store/table-store";
import {
  submitOrder,
  resolveTableUuid,
  isValidTableUuid,
} from "@/services/orderService";
import {
  buildOrderCreateIdempotencyKey,
  randomUUID,
} from "@/utils/idempotency";
import type { OrderFetchSlice } from "./orderFetchSlice";

export class OrderAlreadyInFlightError extends Error {
  constructor() {
    super("Sipariş zaten gönderiliyor");
    this.name = "OrderAlreadyInFlightError";
  }
}

export interface OrderPlacementSlice {
  isPlacingOrder: boolean;
  /** Aynı sepet/masa için timeout sonrası yeniden denemede korunur */
  pendingCreateOpId: string | null;
  pendingCreateFingerprint: string | null;

  placeOrder: (
    items: CartItem[],
    tableId: string,
    note?: string,
  ) => Promise<Order>;
}

function buildPlaceOrderFingerprint(
  items: CartItem[],
  tableId: string,
  note: string | undefined,
): string {
  const lines = items
    .map(
      (item) =>
        `${item.productId}:${item.unit.id}:${item.variant?.id ?? ""}:${item.quantity}:${item.modifiers
          .map((m) => m.modifierId)
          .sort()
          .join(",")}`,
    )
    .sort()
    .join("|");
  return `${tableId}::${note?.trim() ?? ""}::${lines}`;
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
  pendingCreateOpId: null,
  pendingCreateFingerprint: null,

  placeOrder: async (items, tableId, note) => {
    if (get().isPlacingOrder) {
      throw new OrderAlreadyInFlightError();
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
      if (!isValidTableUuid(resolvedId)) {
        throw new Error("Geçersiz masa kimliği (table_id UUID olmalı)");
      }

      const fingerprint = buildPlaceOrderFingerprint(items, resolvedId, note);
      let clientOpId = get().pendingCreateOpId;
      if (
        !clientOpId ||
        get().pendingCreateFingerprint !== fingerprint
      ) {
        clientOpId = randomUUID();
        set({
          pendingCreateOpId: clientOpId,
          pendingCreateFingerprint: fingerprint,
        });
      }

      const idempotencyKey = buildOrderCreateIdempotencyKey(clientOpId);
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

      set({
        pendingCreateOpId: null,
        pendingCreateFingerprint: null,
      });
      await get().fetchOrders(tName);
      return apiOrder;
    } finally {
      set({ isPlacingOrder: false });
    }
  },
});
