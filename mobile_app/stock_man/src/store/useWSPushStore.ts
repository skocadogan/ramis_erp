// ============================================================
// Stock Man — WS push store (P5)
//
// Lightweight Zustand store for events received from
// `/ws/warehouse/notifications/`.
// ============================================================

import { create } from "zustand";

type DeficiencyCreatedEvent = {
  type: "deficiency_created";
  data: {
    id: string;
    report_number: string;
    station_name: string;
    branch_name: string;
    created_at: string;
    status: string;
  };
};

type DeficiencyStatusChangedEvent = {
  type: "deficiency_status_changed";
  data: {
    id: string;
    report_number: string;
    status: string;
    station_id: string;
    branch_id: string;
  };
};

type StockLowAlertEvent = {
  type: "stock_low_alert";
  data: {
    warehouse_id: string;
    warehouse_name: string;
    stock_item_id: string;
    stock_item_name: string;
    current_quantity: number;
    minimum_quantity: number;
  };
};

type TransferStatusChangedEvent = {
  type: "transfer.status_changed";
  data: {
    deficiency_report_id: string;
    transfer_id: string;
    transfer_number: string;
    status: string;
    station_id: string;
    branch_id: string;
  };
};

export type WarehouseWsEvent =
  | DeficiencyCreatedEvent
  | DeficiencyStatusChangedEvent
  | StockLowAlertEvent
  | TransferStatusChangedEvent;

type LowAlertEntry = StockLowAlertEvent["data"] & { at: number };

type DeficiencyAlertEntry = DeficiencyCreatedEvent["data"] & { at: number };

type State = {
  recent: WarehouseWsEvent[];
  lowAlerts: LowAlertEntry[];
  deficiencyAlerts: DeficiencyAlertEntry[];
  push: (e: WarehouseWsEvent) => void;
  clearRecent: () => void;
  clearLowAlerts: () => void;
  removeLowAlert: (stockItemId: string) => void;
  removeDeficiencyAlert: (reportId: string) => void;
  clearDeficiencyAlerts: () => void;
};

const RECENT_CAP = 50;
const LOW_ALERTS_CAP = 50;
const DEFICIENCY_ALERTS_CAP = 20;

export const useWSPushStore = create<State>((set) => ({
  recent: [],
  lowAlerts: [],
  deficiencyAlerts: [],

  push: (e) => {
    set((s) => {
      const nextRecent = [e, ...s.recent].slice(0, RECENT_CAP);
      let nextLowAlerts = s.lowAlerts;
      let nextDeficiencyAlerts = s.deficiencyAlerts;

      if (e.type === "stock_low_alert") {
        const filtered = s.lowAlerts.filter(
          (existing) => existing.stock_item_id !== e.data.stock_item_id
        );
        nextLowAlerts = [{ ...e.data, at: Date.now() }, ...filtered].slice(0, LOW_ALERTS_CAP);
      }

      if (e.type === "deficiency_created") {
        const filtered = s.deficiencyAlerts.filter((existing) => existing.id !== e.data.id);
        nextDeficiencyAlerts = [{ ...e.data, at: Date.now() }, ...filtered].slice(
          0,
          DEFICIENCY_ALERTS_CAP
        );
      }

      return {
        recent: nextRecent,
        lowAlerts: nextLowAlerts,
        deficiencyAlerts: nextDeficiencyAlerts,
      };
    });
  },

  clearRecent: () => set({ recent: [] }),

  clearLowAlerts: () => set({ lowAlerts: [] }),

  removeLowAlert: (stockItemId) =>
    set((s) => ({ lowAlerts: s.lowAlerts.filter((x) => x.stock_item_id !== stockItemId) })),

  removeDeficiencyAlert: (reportId) =>
    set((s) => ({
      deficiencyAlerts: s.deficiencyAlerts.filter((x) => x.id !== reportId),
    })),

  clearDeficiencyAlerts: () => set({ deficiencyAlerts: [] }),
}));
