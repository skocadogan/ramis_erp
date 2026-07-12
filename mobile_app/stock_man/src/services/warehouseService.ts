// ============================================================
// Stock Man — Warehouse service
//
// Thin axios wrapper for the warehouse endpoints documented in
// `docs/wiki/Warehouse.md` and the API inventory in
// `docs/wiki/Stock_Man_App.md` (sections "warehouse" and
// "warehouse — stock-levels").
//
// Conventions:
//   - All return values are already unwrapped — the caller
//     never has to look at `res.data.results`.
//   - All endpoints take `branch_id` as an explicit param so
//     the React Query keys stay deterministic (the branch
//     store re-passes it on every call).
// ============================================================

import { axiosClient } from "@/api/client";
import { extractResults } from "@/types/api";
import type { Warehouse, WarehouseStockLevel, WarehouseSummary, Paginated, UUID } from "@/types";

export const warehouseService = {
  list: async (params?: { branch_id?: UUID; search?: string }): Promise<Warehouse[]> => {
    const res = await axiosClient.get("/warehouse/warehouses/", { params });
    return extractResults<Warehouse>(res.data);
  },

  get: async (id: UUID): Promise<Warehouse> => {
    const res = await axiosClient.get<Warehouse>(`/warehouse/warehouses/${id}/`);
    return res.data;
  },

  stockLevels: async (
    id: UUID,
    params?: { low_stock?: boolean; search?: string; page?: number; page_size?: number }
  ): Promise<Paginated<WarehouseStockLevel>> => {
    const res = await axiosClient.get(`/warehouse/warehouses/${id}/stock_levels/`, {
      params,
    });
    return res.data;
  },

  summary: async (params?: { branch_id?: UUID }): Promise<WarehouseSummary> => {
    const res = await axiosClient.get<WarehouseSummary>(
      "/warehouse/warehouses/summary/",
      { params }
    );
    return res.data;
  },
};
