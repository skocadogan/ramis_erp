// ============================================================
// Stock Man — Goods Receiving service
//
// Thin axios wrapper for the Mal Kabul endpoints documented in
// `docs/wiki/Warehouse.md` (§2 GoodsReceivingViewSet). All
// return values are already unwrapped — the caller never has to
// look at `res.data.results`.
//
// Endpoints covered:
//   - GET    /warehouse/goods-receiving/                    list (paginated)
//   - GET    /warehouse/goods-receiving/{id}/               detail
//   - POST   /warehouse/goods-receiving/                    create
//   - PATCH  /warehouse/goods-receiving/{id}/               update
//   - DELETE /warehouse/goods-receiving/{id}/               soft delete
//   - POST   /warehouse/goods-receiving/{id}/complete/      finalize acceptance
// ============================================================

import { axiosClient } from "@/api/client";
import type { GoodsReceiving, Paginated, UUID } from "@/types";

/** Filter shape for `goodsReceivingService.list`. */
export type GoodsReceivingFilters = {
  warehouse_id?: UUID;
  supplier_id?: UUID;
  purchase_order_id?: UUID;
  status?: string;
  start_date?: string;
  end_date?: string;
  search?: string;
  page?: number;
  page_size?: number;
};

/** Line item posted inside a GoodsReceiving create payload. */
export type GoodsReceivingCreateItem = {
  stock_item_id: UUID;
  expected_quantity: number;
  received_quantity: number;
  rejected_quantity?: number;
  unit: string;
  unit_price: number;
  expiry_date?: string;
  batch_number?: string;
  notes?: string;
};

/** Body shape for `POST /warehouse/goods-receiving/`. */
export type GoodsReceivingCreatePayload = {
  purchase_order_id?: UUID;
  supplier_id: UUID;
  warehouse_id: UUID;
  received_date: string;
  invoice_number?: string;
  waybill_number?: string;
  notes?: string;
  items: GoodsReceivingCreateItem[];
};

export const goodsReceivingService = {
  /**
   * GET /warehouse/goods-receiving/
   */
  list: async (filters: GoodsReceivingFilters = {}): Promise<Paginated<GoodsReceiving>> => {
    const res = await axiosClient.get("/warehouse/goods-receiving/", { params: filters });
    return res.data;
  },

  /**
   * GET /warehouse/goods-receiving/{id}/
   */
  get: async (id: UUID): Promise<GoodsReceiving> => {
    const res = await axiosClient.get<GoodsReceiving>(`/warehouse/goods-receiving/${id}/`);
    return res.data;
  },

  /**
   * POST /warehouse/goods-receiving/
   */
  create: async (payload: GoodsReceivingCreatePayload): Promise<GoodsReceiving> => {
    const res = await axiosClient.post<GoodsReceiving>("/warehouse/goods-receiving/", payload);
    return res.data;
  },

  /**
   * PATCH /warehouse/goods-receiving/{id}/
   */
  update: async (
    id: UUID,
    payload: Partial<GoodsReceivingCreatePayload>
  ): Promise<GoodsReceiving> => {
    const res = await axiosClient.patch<GoodsReceiving>(
      `/warehouse/goods-receiving/${id}/`,
      payload
    );
    return res.data;
  },

  /**
   * DELETE /warehouse/goods-receiving/{id}/  (soft delete via is_active=false)
   */
  remove: async (id: UUID): Promise<void> => {
    await axiosClient.delete(`/warehouse/goods-receiving/${id}/`);
  },

  // ─── Custom actions ──────────────────────────────────────

  /**
   * POST /warehouse/goods-receiving/{id}/complete/
   * Finalises acceptance — backend stamps StockLot rows + stock levels.
   */
  complete: async (id: UUID): Promise<GoodsReceiving> => {
    const res = await axiosClient.post<GoodsReceiving>(
      `/warehouse/goods-receiving/${id}/complete/`
    );
    return res.data;
  },
};
