import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

/** table_id → son WS yaması (tek React güncellemesinde birleştirmek için) */
export type TableWsPatchMap = Record<string, Record<string, unknown>>;

export type WaiterCallNotification = {
  id: string;
  message: string;
  tableId?: string;
  tableName?: string;
  source?: string;
  reservationId?: string;
  customerName?: string;
  timestamp: number;
  reminderPulse?: number;
};

/**
 * Garson uygulaması — POS/mutfak WebSocket olayları (tek bağlantı, layout'ta).
 * Masa listesi: tableListVersion + lastTableListPayload | tableListPatches
 * Masa detayı: tableEpoch[masaId] (KDS: yalnız epoch artar, liste sürümü artmaz)
 * Hazır rozet: readyItemsCount
 */
interface WaiterPosPushState {
  tableEpoch: Record<string, number>;
  tableListVersion: number;
  lastTableListPayload: Record<string, unknown> | null;
  /** Birden fazla masa aynı frame içinde güncellenince tek turda birleştirilir */
  tableListPatches: TableWsPatchMap | null;

  readyItemsCount: number;
  deliveredCount: number;
  wsConnected: boolean;
  waiterCalls: WaiterCallNotification[];
  readyRefreshHandler: (() => void) | null;
  menuRefreshHandler: (() => void) | null;

  touchTableListFromWs: (data: Record<string, unknown>) => void;
  /** KDS / order_status vb.: sadece masa detayı yenilensin; masa grid'i tetiklenmesin */
  touchTableEpochOnly: (tableId: string) => void;
  /** Aynı anda birçok table_update için tek set() */
  applyTableWsPatchBatch: (patches: TableWsPatchMap) => void;

  setReadyItemsCount: (n: number) => void;
  incrementDeliveredCount: () => Promise<void>;
  setDeliveredCount: (n: number) => void;
  setWsConnected: (b: boolean) => void;
  setReadyRefreshHandler: (fn: (() => void) | null) => void;
  setMenuRefreshHandler: (fn: (() => void) | null) => void;
  refreshReadyItems: () => void;
  refreshMenu: () => void;
  addWaiterCall: (data: Record<string, unknown>) => void;
  dismissWaiterCall: (id: string) => void;
  clearWaiterCalls: () => void;
  applyWaiterCallDismissed: (opts: { dismissAll?: boolean; callIds?: string[] }) => void;
  pulseWaiterCalls: () => void;
  resetForLogout: () => void;
}

export const useWaiterPosPushStore = create<WaiterPosPushState>((set, get) => ({
  tableEpoch: {},
  tableListVersion: 0,
  lastTableListPayload: null,
  tableListPatches: null,

  readyItemsCount: 0,
  deliveredCount: 0,
  wsConnected: false,
  waiterCalls: [],
  readyRefreshHandler: null,
  menuRefreshHandler: null,

  touchTableListFromWs: (data) => {
    const id = data?.id;
    const sid = id != null && id !== "" ? String(id) : null;
    set((s) => {
      const next: Partial<WaiterPosPushState> = {
        tableListVersion: s.tableListVersion + 1,
        lastTableListPayload: data,
        tableListPatches: null,
      };
      if (sid) {
        next.tableEpoch = {
          ...s.tableEpoch,
          [sid]: (s.tableEpoch[sid] ?? 0) + 1,
        };
      }
      return next;
    });
  },

  touchTableEpochOnly: (tableId) => {
    const sid = tableId != null && String(tableId) !== "" ? String(tableId) : null;
    if (!sid) return;
    set((s) => ({
      tableEpoch: {
        ...s.tableEpoch,
        [sid]: (s.tableEpoch[sid] ?? 0) + 1,
      },
    }));
  },

  applyTableWsPatchBatch: (patches) => {
    const keys = Object.keys(patches);
    if (keys.length === 0) return;
    set((s) => {
      const nextEpoch = { ...s.tableEpoch };
      for (const tid of keys) {
        nextEpoch[tid] = (nextEpoch[tid] ?? 0) + 1;
      }
      return {
        tableEpoch: nextEpoch,
        tableListVersion: s.tableListVersion + 1,
        tableListPatches: patches,
        lastTableListPayload: null,
      };
    });
  },

  setReadyItemsCount: (n) => set({ readyItemsCount: n }),
  incrementDeliveredCount: async () => {
    const nextCount = get().deliveredCount + 1;
    set({ deliveredCount: nextCount });
    try {
      await SecureStore.setItemAsync("delivered_count", String(nextCount));
    } catch (err) {
      console.warn("Failed to save delivered_count:", err);
    }
  },
  setDeliveredCount: (n: number) => set({ deliveredCount: n }),
  setWsConnected: (b) => set({ wsConnected: b }),
  setReadyRefreshHandler: (fn) => set({ readyRefreshHandler: fn }),
  setMenuRefreshHandler: (fn) => set({ menuRefreshHandler: fn }),
  refreshReadyItems: () => {
    get().readyRefreshHandler?.();
  },
  refreshMenu: () => {
    if (menuRefreshTimeout) {
      clearTimeout(menuRefreshTimeout);
    }
    menuRefreshTimeout = setTimeout(() => {
      menuRefreshTimeout = null;
      get().menuRefreshHandler?.();
    }, 400);
  },

  addWaiterCall: (data) => {
    const id = data.call_id != null ? String(data.call_id) : `${Date.now()}`;
    set((s) => {
      if (s.waiterCalls.some((call) => call.id === id)) return s;
      return {
        waiterCalls: [
          {
            id,
            message: String(data.message || ""),
            tableId: data.table_id != null ? String(data.table_id) : undefined,
            tableName: data.table_name != null ? String(data.table_name) : undefined,
            source: data.source != null ? String(data.source) : undefined,
            reservationId: data.reservation_id != null ? String(data.reservation_id) : undefined,
            customerName: data.customer_name != null ? String(data.customer_name) : undefined,
            timestamp: Date.now(),
          },
          ...s.waiterCalls,
        ].slice(0, 20),
      };
    });
  },
  dismissWaiterCall: (id) =>
    set((s) => ({
      waiterCalls: s.waiterCalls.filter((call) => call.id !== id),
    })),
  clearWaiterCalls: () => set({ waiterCalls: [] }),
  applyWaiterCallDismissed: ({ dismissAll, callIds }) =>
    set((s) => {
      if (dismissAll) {
        return { waiterCalls: [] };
      }
      if (!callIds?.length) return s;
      const drop = new Set(callIds);
      return {
        waiterCalls: s.waiterCalls.filter((call) => !drop.has(call.id)),
      };
    }),
  pulseWaiterCalls: () =>
    set((s) => {
      if (s.waiterCalls.length === 0) return s;
      return {
        waiterCalls: s.waiterCalls.map((call) => ({
          ...call,
          reminderPulse: (call.reminderPulse ?? 0) + 1,
        })),
      };
    }),

  resetForLogout: () =>
    set({
      tableEpoch: {},
      tableListVersion: 0,
      lastTableListPayload: null,
      tableListPatches: null,
      readyItemsCount: 0,
      deliveredCount: 0,
      wsConnected: false,
      waiterCalls: [],
    }),
}));

// Asenkron olarak kaydedilen teslim/okunan sipariş sayısını SecureStore'dan yükle
SecureStore.getItemAsync("delivered_count")
  .then((val) => {
    if (val) {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed)) {
        useWaiterPosPushStore.setState({ deliveredCount: parsed });
      }
    }
  })
  .catch((err) => {
    console.warn("Failed to load delivered_count at startup:", err);
  });

let menuRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
