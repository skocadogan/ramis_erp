// ============================================================
// Stock Man — Expiry (SKT) service
//
// Endpoints covered (docs/wiki/Inventory.md → SKT Early Warning,
// docs/wiki/Stock_Man_App.md → "inventory — expiry"):
//   - GET  /inventory/expiry-warnings/                    paginated
//   - GET  /inventory/expiry-warnings/summary/            counters
//   - GET  /inventory/expiry-warnings/action-types/       enum
//   - POST /inventory/expiry-warnings/actions/            record
//   - POST /inventory/expiry-warnings/auto-return-cancel/ expired lot RETURN/CANCEL
//   - GET  /inventory/expiry-warnings/actions/history/    audit log
// ============================================================

import { axiosClient } from "@/api/client";
import { extractResults } from "@/types/api";
import type {
  ExpiryWarning,
  ExpirySummary,
  ExpiryAction,
  ExpiryActionType,
  StockMovement,
  UUID,
} from "@/types";

export const expiryService = {
  list: async (params?: {
    warehouse_id?: UUID;
    days_ahead?: 3 | 7;
    lot_id?: UUID;
  }): Promise<ExpiryWarning[]> => {
    const res = await axiosClient.get("/inventory/expiry-warnings/", { params });
    return extractResults<ExpiryWarning>(res.data);
  },

  summary: async (params?: { warehouse_id?: UUID }): Promise<ExpirySummary> => {
    const res = await axiosClient.get<ExpirySummary>("/inventory/expiry-warnings/summary/", {
      params,
    });
    return res.data;
  },

  actionTypes: async (): Promise<{ value: ExpiryActionType; label: string }[]> => {
    const res = await axiosClient.get<
      | { value: ExpiryActionType; label: string }[]
      | { automation_enabled?: boolean; types: { value: ExpiryActionType; label: string }[] }
    >("/inventory/expiry-warnings/action-types/");
    const data = res.data;
    if (Array.isArray(data)) {
      return data;
    }
    return data.types ?? [];
  },

  recordAction: async (data: {
    lot_id: UUID;
    action_type: ExpiryActionType;
    notes?: string;
  }): Promise<ExpiryAction> => {
    const res = await axiosClient.post<ExpiryAction>(
      "/inventory/expiry-warnings/actions/",
      data
    );
    return res.data;
  },

  actionHistory: async (params?: {
    lot_id?: UUID;
    warehouse_id?: UUID;
    limit?: number;
  }): Promise<ExpiryAction[]> => {
    const res = await axiosClient.get("/inventory/expiry-warnings/actions/history/", {
      params,
    });
    return extractResults<ExpiryAction>(res.data);
  },

  autoReturnCancel: async (data: {
    lot_id: UUID;
    notes?: string;
  }): Promise<StockMovement> => {
    const res = await axiosClient.post<StockMovement>(
      "/inventory/expiry-warnings/auto-return-cancel/",
      data
    );
    return res.data;
  },
};
