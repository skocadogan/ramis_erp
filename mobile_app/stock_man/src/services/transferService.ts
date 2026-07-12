// ============================================================
// Stock Man — Warehouse Transfer service
//
// Thin axios wrapper for the Depo Transfer endpoints documented
// in `docs/wiki/Warehouse.md` (§2 WarehouseTransferViewSet).
// All return values are already unwrapped — the caller never has
// to look at `res.data.results`.
//
// Endpoints covered:
//   - GET    /warehouse/transfers/                  list (paginated)
//   - GET    /warehouse/transfers/{id}/             detail
//   - POST   /warehouse/transfers/                  create
//   - PATCH  /warehouse/transfers/{id}/             update
//   - DELETE /warehouse/transfers/{id}/             soft delete
//   - POST   /warehouse/transfers/{id}/approve/     DRAFT/PENDING → IN_TRANSIT
//   - POST   /warehouse/transfers/{id}/complete/    IN_TRANSIT → COMPLETED
//   - POST   /warehouse/transfers/{id}/cancel/      any → CANCELLED
// ============================================================

import { axiosClient } from "@/api/client";
import type { Paginated, WarehouseTransfer, UUID } from "@/types";

/** Filter shape for `transferService.list`. */
export type TransferFilters = {
  source_warehouse_id?: UUID;
  target_warehouse_id?: UUID;
  status?: string;
  start_date?: string;
  end_date?: string;
  search?: string;
  page?: number;
  page_size?: number;
};

export const transferService = {
  /**
   * GET /warehouse/transfers/
   */
  list: async (filters: TransferFilters = {}): Promise<Paginated<WarehouseTransfer>> => {
    const res = await axiosClient.get("/warehouse/transfers/", { params: filters });
    return res.data;
  },

  /**
   * GET /warehouse/transfers/{id}/
   */
  get: async (id: UUID): Promise<WarehouseTransfer> => {
    const res = await axiosClient.get<WarehouseTransfer>(`/warehouse/transfers/${id}/`);
    return res.data;
  },

  /**
   * POST /warehouse/transfers/
   */
  create: async (payload: import("@/types").WarehouseTransferCreatePayload): Promise<WarehouseTransfer> => {
    const res = await axiosClient.post<WarehouseTransfer>("/warehouse/transfers/", payload);
    return res.data;
  },

  /**
   * PATCH /warehouse/transfers/{id}/
   */
  update: async (
    id: UUID,
    payload: import("@/types").WarehouseTransferUpdatePayload
  ): Promise<WarehouseTransfer> => {
    const res = await axiosClient.patch<WarehouseTransfer>(`/warehouse/transfers/${id}/`, payload);
    return res.data;
  },

  /**
   * DELETE /warehouse/transfers/{id}/  (soft delete via is_active=false)
   */
  remove: async (id: UUID): Promise<void> => {
    await axiosClient.delete(`/warehouse/transfers/${id}/`);
  },

  // ─── Custom actions ──────────────────────────────────────

  /**
   * POST /warehouse/transfers/{id}/approve/
   * DRAFT/PENDING → IN_TRANSIT.
   */
  approve: async (id: UUID): Promise<WarehouseTransfer> => {
    const res = await axiosClient.post<WarehouseTransfer>(`/warehouse/transfers/${id}/approve/`);
    return res.data;
  },

  /**
   * POST /warehouse/transfers/{id}/complete/
   * IN_TRANSIT → COMPLETED. Backend moves stock between warehouses.
   */
  complete: async (id: UUID): Promise<WarehouseTransfer> => {
    const res = await axiosClient.post<WarehouseTransfer>(`/warehouse/transfers/${id}/complete/`);
    return res.data;
  },

  /**
   * POST /warehouse/transfers/{id}/cancel/
   * Any non-terminal state → CANCELLED.
   */
  cancel: async (id: UUID): Promise<WarehouseTransfer> => {
    const res = await axiosClient.post<WarehouseTransfer>(`/warehouse/transfers/${id}/cancel/`);
    return res.data;
  },
};
