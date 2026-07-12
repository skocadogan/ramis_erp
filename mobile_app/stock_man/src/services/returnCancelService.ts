// ============================================================
// Stock Man — Return / Cancel (İptal ve İade) service
//
// Backend: StockMovementViewSet — RETURN/CANCEL hareketleri
// Wiki: [[Stock_Return_Cancel]]
// ============================================================

import { axiosClient } from "@/api/client";
import { normalizeIsoDate } from "@/lib/format/date";
import type { Paginated, StockMovement, UUID } from "@/types";

export type ReturnCancelMovementType = "ALL" | "RETURN" | "CANCEL";

export type ReturnCancelFilters = {
  warehouse_id?: UUID;
  start_date?: string;
  end_date?: string;
  movement_type?: ReturnCancelMovementType;
  reason_code?: string;
  supplier_id?: UUID;
  search?: string;
  page?: number;
  page_size?: number;
};

export type ReturnCancelReasonCode = {
  code: string;
  label: string;
};

export type ReturnCancelCreatePayload = {
  stock_item_id: UUID;
  warehouse_id: UUID;
  movement_type: "RETURN" | "CANCEL";
  quantity: number;
  unit?: string;
  unit_price?: number;
  reference: string;
  notes?: string;
  supplier_id?: UUID;
  purchase_order_id?: UUID;
};

function buildListParams(filters: ReturnCancelFilters): Record<string, string | number> {
  const params: Record<string, string | number> = {
    page: filters.page ?? 1,
    page_size: filters.page_size ?? 50,
    movement_types: "RETURN,CANCEL",
  };
  if (filters.warehouse_id) params.warehouse_id = filters.warehouse_id;
  const startDate = normalizeIsoDate(filters.start_date);
  const endDate = normalizeIsoDate(filters.end_date);
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  if (filters.movement_type && filters.movement_type !== "ALL") {
    params.movement_type = filters.movement_type;
  }
  if (filters.reason_code) params.reason_code = filters.reason_code;
  if (filters.supplier_id) params.supplier_id = filters.supplier_id;
  if (filters.search?.trim()) params.search = filters.search.trim();
  return params;
}

export const returnCancelService = {
  list: async (filters: ReturnCancelFilters = {}): Promise<Paginated<StockMovement>> => {
    const res = await axiosClient.get("/inventory/stock-movements/", {
      params: buildListParams(filters),
    });
    return res.data;
  },

  create: async (payload: ReturnCancelCreatePayload): Promise<StockMovement> => {
    const res = await axiosClient.post<StockMovement>(
      "/inventory/stock-movements/",
      payload
    );
    return res.data;
  },

  remove: async (id: UUID): Promise<void> => {
    await axiosClient.delete(`/inventory/stock-movements/${id}/`);
  },

  reasonCodes: async (): Promise<ReturnCancelReasonCode[]> => {
    const res = await axiosClient.get<ReturnCancelReasonCode[]>(
      "/inventory/stock-movements/reason-codes/"
    );
    return res.data;
  },
};
