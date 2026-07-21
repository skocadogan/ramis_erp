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
  /** IdleTimer: yalnızca payment clear sonrası welcome'a dön */
  lastClearReason: "payment" | "other" | null;

  fetchOrders: (
    tableName?: string,
    options?: FetchOrdersOptions,
  ) => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  cancelOrder: (orderId: string) => void;
  clearOrders: (reason?: "payment" | "other") => void;
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
  lastClearReason: null,

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
          set({
            activeOrders: [],
            isLoading: false,
            lastClearReason: "other",
          });
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
          lastClearReason: "other",
        });
        return;
      }

      const apiOrders = await fetchOrdersForTable(tableUuid);
      if (seq !== ordersFetchSeq) return;

      const nextOrders = normalizeActiveOrders(apiOrders);
      set({
        activeOrders: nextOrders,
        isLoading: false,
        lastClearReason: nextOrders.length > 0 ? null : get().lastClearReason,
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
      const next = get().activeOrders.filter((o) => o.id !== orderId);
      set({
        activeOrders: next,
        lastClearReason: next.length === 0 ? "payment" : get().lastClearReason,
      });
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
    const next = get().activeOrders.filter((o) => o.id !== orderId);
    set({
      activeOrders: next,
      lastClearReason: next.length === 0 ? "other" : get().lastClearReason,
    });
  },

  clearOrders: (reason = "other") => {
    set({ activeOrders: [], lastClearReason: reason });
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
