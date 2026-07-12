// ============================================================
// Smart Table — Waiter Call Slice
// Garson çağırma ve yerel takip.
// ============================================================

import type { StateCreator } from "zustand";
import type { WaiterCall, WaiterCallType } from "@/types";
import { useAuthStore } from "@/store/auth-store";
import { useTableStore } from "@/store/table-store";
import { useUIStore } from "@/store/ui-store";
import {
  triggerWaiterCall,
  resolveTableUuid,
  isValidTableUuid,
} from "@/services/orderService";
import {
  getWaiterCallFeedback,
  type WaiterCallFeedback,
} from "@/utils/waiterCallFeedback";
import type { OrderFetchSlice } from "./orderFetchSlice";

const WAITER_CALL_TYPE_LABELS: Record<
  WaiterCallType,
  { tr: string; en: string }
> = {
  SERVICE: { tr: "Servis", en: "Service" },
  WATER: { tr: "Su", en: "Water" },
  BILL: { tr: "Hesap", en: "Bill" },
  HELP: { tr: "Yardım", en: "Help" },
  ORDER: { tr: "Sipariş", en: "Order" },
};

function buildWaiterCallMessage(
  type: WaiterCallType,
  note?: string,
): string | undefined {
  const language = useUIStore.getState().language;
  const label = WAITER_CALL_TYPE_LABELS[type][language === "tr" ? "tr" : "en"];
  const trimmedNote = note?.trim();
  if (trimmedNote) {
    return `${label}: ${trimmedNote}`;
  }
  return label;
}

function buildWaiterCallRequestKey(
  tableId: string,
  tableName: string,
  type: WaiterCallType,
  note?: string,
): string {
  const normalizedTable = tableId.trim() || tableName.trim();
  const normalizedNote = note?.trim() ?? "";
  return `${normalizedTable}|${type}|${normalizedNote}`;
}

let pendingWaiterCall: {
  key: string;
  promise: Promise<WaiterCallFeedback>;
} | null = null;

export interface OrderWaiterSlice {
  waiterCalls: WaiterCall[];
  isCallingWaiter: boolean;
  activeWaiterCallKey: string | null;

  callWaiter: (
    tableId: string,
    tableName: string,
    type: WaiterCall["type"],
    note?: string,
  ) => Promise<WaiterCallFeedback>;
  dismissWaiterCall: (callId: string) => void;
  clearWaiterCalls: () => void;
}

export const createOrderWaiterSlice: StateCreator<
  OrderWaiterSlice & OrderFetchSlice,
  [],
  [],
  OrderWaiterSlice
> = (set, get) => ({
  waiterCalls: [],
  isCallingWaiter: false,
  activeWaiterCallKey: null,

  callWaiter: async (tableId, tableName, type, note) => {
    const requestKey = buildWaiterCallRequestKey(
      tableId,
      tableName,
      type,
      note,
    );

    if (pendingWaiterCall?.key === requestKey) {
      return pendingWaiterCall.promise;
    }

    if (pendingWaiterCall) {
      const language = useUIStore.getState().language;
      throw new Error(
        language === "tr"
          ? "Önce mevcut garson çağrısının tamamlanmasını bekleyin."
          : "Please wait for the current waiter call to finish.",
      );
    }

    set({
      isCallingWaiter: true,
      activeWaiterCallKey: requestKey,
    });

    const promise = (async () => {
      const auth = useAuthStore.getState();
      const tableStore = useTableStore.getState();

      if (!auth.serverUrl) {
        throw new Error("Sunucu adresi ayarlanmamış");
      }

      const branchId = tableStore.selectedBranch?.id || auth.user?.branch_id;
      const tName = tableStore.selectedTable?.name || tableName;
      let resolvedId = (
        tableStore.selectedTable?.id ||
        get().resolvedTableId ||
        tableId ||
        ""
      ).trim();

      if (!isValidTableUuid(resolvedId) && branchId && tName) {
        const lookedUp = await resolveTableUuid(branchId, tName);
        if (lookedUp) {
          resolvedId = lookedUp;
          get().setResolvedTableId(lookedUp);
        }
      }

      if (!isValidTableUuid(resolvedId)) {
        throw new Error(
          "Geçerli masa seçilmedi. Profilden masayı yeniden seçin.",
        );
      }

      let result;
      try {
        result = await triggerWaiterCall(
          resolvedId,
          buildWaiterCallMessage(type, note),
        );
      } catch (err: unknown) {
        console.warn(
          "[OrderStore] Waiter call backend error:",
          err instanceof Error ? err.message : err,
        );
        throw err;
      }

      const language = useUIStore.getState().language;
      const feedback = getWaiterCallFeedback(result, language);

      if (feedback.shouldTrackCall) {
        const newCall: WaiterCall = {
          id: result.call_id || `wc-${Date.now()}`,
          tableId: resolvedId,
          tableName: tName,
          type,
          status: "PENDING",
          note,
          createdAt: new Date().toISOString(),
        };

        set({
          waiterCalls: [newCall, ...get().waiterCalls],
        });
      }

      return feedback;
    })();

    pendingWaiterCall = {
      key: requestKey,
      promise,
    };

    try {
      return await promise;
    } finally {
      if (pendingWaiterCall?.promise === promise) {
        pendingWaiterCall = null;
      }
      set({
        isCallingWaiter: false,
        activeWaiterCallKey: null,
      });
    }
  },

  dismissWaiterCall: (callId) => {
    set({
      waiterCalls: get().waiterCalls.map((c) =>
        c.id === callId
          ? {
              ...c,
              status: "COMPLETED" as const,
              acknowledgedAt: new Date().toISOString(),
            }
          : c,
      ),
    });
  },

  clearWaiterCalls: () => set({ waiterCalls: [] }),
});
