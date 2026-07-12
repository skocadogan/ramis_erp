// ============================================================
// Stock Man — Stock Counting service
//
// Thin axios wrapper for the Sayım endpoints documented in
// `docs/wiki/Warehouse.md` (§StockCountingViewSet). All return
// values are already unwrapped — the caller never has to look
// at `res.data.results`.
//
// Endpoints covered:
//   - GET    /warehouse/stock-counting/                list (paginated)
//   - GET    /warehouse/stock-counting/{id}/           detail
//   - POST   /warehouse/stock-counting/                create
//   - PATCH  /warehouse/stock-counting/{id}/           update
//   - DELETE /warehouse/stock-counting/{id}/           soft delete
//   - POST   /warehouse/stock-counting/{id}/start/     DRAFT → IN_PROGRESS
//   - POST   /warehouse/stock-counting/{id}/finish/    IN_PROGRESS → COMPLETED
//   - POST   /warehouse/stock-counting/{id}/approve/   COMPLETED → APPROVED
//   - POST   /warehouse/stock-counting/{id}/update_items/  bulk per-line count edit
// ============================================================

import { axiosClient } from "@/api/client";
import type { StockCounting, StockCountingCreatePayload, StockCountingItemUpdate, Paginated, UUID } from "@/types";

/** Filter shape for `stockCountingService.list`. */
export type StockCountingFilters = {
  warehouse_id?: UUID;
  status?: string;
  page?: number;
  page_size?: number;
};

export const stockCountingService = {
  /**
   * GET /warehouse/stock-counting/
   */
  list: async (filters: StockCountingFilters = {}): Promise<Paginated<StockCounting>> => {
    const res = await axiosClient.get("/warehouse/stock-counting/", { params: filters });
    return res.data;
  },

  /**
   * GET /warehouse/stock-counting/{id}/
   */
  get: async (id: UUID): Promise<StockCounting> => {
    const res = await axiosClient.get<StockCounting>(`/warehouse/stock-counting/${id}/`);
    return res.data;
  },

  /**
   * POST /warehouse/stock-counting/
   */
  create: async (payload: StockCountingCreatePayload): Promise<StockCounting> => {
    const res = await axiosClient.post<StockCounting>("/warehouse/stock-counting/", payload);
    return res.data;
  },

  /**
   * PATCH /warehouse/stock-counting/{id}/
   */
  update: async (id: UUID, payload: Partial<StockCountingCreatePayload>): Promise<StockCounting> => {
    const res = await axiosClient.patch<StockCounting>(`/warehouse/stock-counting/${id}/`, payload);
    return res.data;
  },

  /**
   * DELETE /warehouse/stock-counting/{id}/  (soft delete via is_active=false)
   */
  remove: async (id: UUID): Promise<void> => {
    await axiosClient.delete(`/warehouse/stock-counting/${id}/`);
  },

  // ─── Custom actions ─────────────────────────────────────

  /**
   * POST /warehouse/stock-counting/{id}/start/
   * DRAFT → IN_PROGRESS.
   */
  start: async (id: UUID): Promise<StockCounting> => {
    const res = await axiosClient.post<StockCounting>(`/warehouse/stock-counting/${id}/start/`);
    return res.data;
  },

  /**
   * POST /warehouse/stock-counting/{id}/finish/
   * IN_PROGRESS → COMPLETED.
   */
  finish: async (id: UUID): Promise<StockCounting> => {
    const res = await axiosClient.post<StockCounting>(`/warehouse/stock-counting/${id}/finish/`);
    return res.data;
  },

  /**
   * POST /warehouse/stock-counting/{id}/approve/
   * COMPLETED → APPROVED. Backend writes the resulting stock movements.
   */
  approve: async (id: UUID): Promise<StockCounting> => {
    const res = await axiosClient.post<StockCounting>(`/warehouse/stock-counting/${id}/approve/`);
    return res.data;
  },

  /**
   * POST /warehouse/stock-counting/{id}/update_items/
   * Bulk per-line count update — preferred over PATCH for the line items.
   */
  updateItems: async (id: UUID, items: StockCountingItemUpdate[]): Promise<StockCounting> => {
    const res = await axiosClient.post<StockCounting>(`/warehouse/stock-counting/${id}/update_items/`, { items });
    return res.data;
  },
};
