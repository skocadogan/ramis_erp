// ============================================================
// Smart Table — Order Fetch Slice
// Aktif siparişleri getirme, iptal etme ve durum güncelleme.
// ============================================================

import type { StateCreator } from "zustand";
import type { Order, OrderStatus } from "@/types";
import { useAuthStore } from "@/store/auth-store";
import { useTableStore } from "@/store/table-store";
import {
  cancelOrderItem,
  fetchOrdersForTable,
  resolveTableUuid,
} from "@/services/orderService";
import { isTerminalOrderStatus, normalizeActiveOrders } from "./orderUtils";
import type { FetchOrdersOptions } from "./types";

let ordersFetchSeq = 0;

export interface OrderFetchSlice {
  activeOrders: Order[];
  isLoading: boolean;
  error: string | null;
  resolvedTableId: string | null;

  fetchOrders: (
    tableName?: string,
    options?: FetchOrdersOptions,
  ) => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  cancelOrder: (orderId: string) => void;
  clearOrders: () => void;
  cancelItem: (itemId: string) => Promise<void>;
  setResolvedTableId: (id: string | null) => void;
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

export const createOrderFetchSlice: StateCreator<OrderFetchSlice> = (
  set,
  get,
) => ({
  activeOrders: [],
  isLoading: false,
  error: null,
  resolvedTableId: null,

  setResolvedTableId: (id) => set({ resolvedTableId: id }),

  fetchOrders: async (tableName, options) => {
    const background = options?.background ?? false;
    const seq = ++ordersFetchSeq;

    if (!background) {
      set({ isLoading: true, error: null });
    } else {
      set({ error: null });
    }

    try {
      const auth = useAuthStore.getState();
      const tableStore = useTableStore.getState();
      const branchId = tableStore.selectedBranch?.id || auth.user?.branch_id;

      if (!auth.isAuthenticated || !branchId) {
        if (seq !== ordersFetchSeq) return;
        if (!background) {
          set({ activeOrders: [], isLoading: false });
        }
        return;
      }

      const tableUuid = await resolveActiveTableUuid(
        branchId,
        tableName,
        get().resolvedTableId,
        (id) => set({ resolvedTableId: id }),
      );
      if (!tableUuid) {
        if (seq !== ordersFetchSeq) return;
        if (background) {
          set({ isLoading: false });
          return;
        }
        set({
          activeOrders: [],
          error: "Masa seçilmedi veya masa bulunamadı",
          isLoading: false,
        });
        return;
      }

      const apiOrders = await fetchOrdersForTable(tableUuid);
      if (seq !== ordersFetchSeq) return;

      set({
        activeOrders: normalizeActiveOrders(apiOrders),
        isLoading: false,
      });
    } catch (err: unknown) {
      if (seq !== ordersFetchSeq) return;
      const message =
        err instanceof Error ? err.message : "API bağlantı hatası";
      console.warn("[OrderStore] fetchOrders error:", message);
      set({
        error: message,
        isLoading: false,
      });
    }
  },

  updateOrderStatus: (orderId, status) => {
    if (isTerminalOrderStatus(status)) {
      set({ activeOrders: get().activeOrders.filter((o) => o.id !== orderId) });
      return;
    }
    set({
      activeOrders: get().activeOrders.map((o) =>
        o.id === orderId
          ? { ...o, status, updatedAt: new Date().toISOString() }
          : o,
      ),
    });
  },

  cancelOrder: (orderId) => {
    set({ activeOrders: get().activeOrders.filter((o) => o.id !== orderId) });
  },

  clearOrders: () => {
    set({ activeOrders: [] });
  },

  cancelItem: async (itemId) => {
    set({ isLoading: true });
    try {
      await cancelOrderItem(itemId);
      const tableStore = useTableStore.getState();
      const tName = tableStore.selectedTable?.name;
      await get().fetchOrders(tName);
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : "Ürün iptal edilemedi",
      });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },
});
