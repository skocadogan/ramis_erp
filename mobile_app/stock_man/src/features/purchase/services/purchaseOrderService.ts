// ============================================================
// Stock Man — Purchase Order service
//
// Thin axios wrapper for the PO endpoints documented in
// `docs/wiki/Warehouse.md` (§3 PurchaseOrderViewSet,
// §6 EPIC-01 — Purchase recommendations). All return values
// are already unwrapped — the caller never has to look at
// `res.data.results`.
//
// Endpoints covered:
//   - GET    /warehouse/purchase-orders/                   list (paginated)
//   - GET    /warehouse/purchase-orders/{id}/              detail
//   - POST   /warehouse/purchase-orders/                   create
//   - PATCH  /warehouse/purchase-orders/{id}/              update
//   - DELETE /warehouse/purchase-orders/{id}/              soft delete
//   - POST   /warehouse/purchase-orders/{id}/submit/       DRAFT → PENDING
//   - POST   /warehouse/purchase-orders/{id}/approve/      PENDING → APPROVED
//   - POST   /warehouse/purchase-orders/{id}/mark_ordered/ APPROVED → ORDERED
//   - POST   /warehouse/purchase-orders/{id}/cancel/       any → CANCELLED
//   - POST   /warehouse/purchase-orders/{id}/recalculate-status/
//   - POST   /warehouse/purchase-orders/suggest-preview/   preview only
//   - POST   /warehouse/purchase-orders/suggest/           creates DRAFT POs
//   - POST   /warehouse/purchase-orders/commit/            commit suggestions
// ============================================================

import { axiosClient } from "@/api/client";
import type {
  PurchaseOrder,
  PurchaseOrderCreatePayload,
  PurchaseOrderUpdatePayload,
  PurchaseOrderSuggestion,
  PurchaseOrderSuggestionRequest,
  PurchaseOrderSuggestionCommitPayload,
  Paginated,
  UUID,
} from "@/types";

export type PurchaseOrderFilters = {
  warehouse_id?: UUID;
  supplier_id?: UUID;
  stock_item_id?: UUID;
  status?: string;
  start_date?: string;
  end_date?: string;
  search?: string;
  page?: number;
  page_size?: number;
};

export const purchaseOrderService = {
  /**
   * GET /warehouse/purchase-orders/
   */
  list: async (filters: PurchaseOrderFilters = {}): Promise<Paginated<PurchaseOrder>> => {
    const res = await axiosClient.get("/warehouse/purchase-orders/", { params: filters });
    return res.data;
  },

  /**
   * GET /warehouse/purchase-orders/{id}/
   */
  get: async (id: UUID): Promise<PurchaseOrder> => {
    const res = await axiosClient.get<PurchaseOrder>(`/warehouse/purchase-orders/${id}/`);
    return res.data;
  },

  /**
   * POST /warehouse/purchase-orders/
   */
  create: async (payload: PurchaseOrderCreatePayload): Promise<PurchaseOrder> => {
    const res = await axiosClient.post<PurchaseOrder>("/warehouse/purchase-orders/", payload);
    return res.data;
  },

  /**
   * PATCH /warehouse/purchase-orders/{id}/
   */
  update: async (id: UUID, payload: PurchaseOrderUpdatePayload): Promise<PurchaseOrder> => {
    const res = await axiosClient.patch<PurchaseOrder>(
      `/warehouse/purchase-orders/${id}/`,
      payload
    );
    return res.data;
  },

  /**
   * DELETE /warehouse/purchase-orders/{id}/  (soft delete via is_active=false)
   */
  remove: async (id: UUID): Promise<void> => {
    await axiosClient.delete(`/warehouse/purchase-orders/${id}/`);
  },

  // ─── Custom actions ─────────────────────────────────────

  /**
   * POST /warehouse/purchase-orders/{id}/submit/
   */
  submit: async (id: UUID): Promise<PurchaseOrder> => {
    const res = await axiosClient.post<PurchaseOrder>(
      `/warehouse/purchase-orders/${id}/submit/`
    );
    return res.data;
  },

  /**
   * POST /warehouse/purchase-orders/{id}/approve/
   */
  approve: async (id: UUID): Promise<PurchaseOrder> => {
    const res = await axiosClient.post<PurchaseOrder>(
      `/warehouse/purchase-orders/${id}/approve/`
    );
    return res.data;
  },

  /**
   * POST /warehouse/purchase-orders/{id}/mark_ordered/
   */
  markOrdered: async (id: UUID): Promise<PurchaseOrder> => {
    const res = await axiosClient.post<PurchaseOrder>(
      `/warehouse/purchase-orders/${id}/mark_ordered/`
    );
    return res.data;
  },

  /**
   * POST /warehouse/purchase-orders/{id}/cancel/
   */
  cancel: async (id: UUID): Promise<PurchaseOrder> => {
    const res = await axiosClient.post<PurchaseOrder>(
      `/warehouse/purchase-orders/${id}/cancel/`
    );
    return res.data;
  },

  /**
   * POST /warehouse/purchase-orders/{id}/recalculate-status/
   */
  recalculateStatus: async (id: UUID): Promise<PurchaseOrder> => {
    const res = await axiosClient.post<PurchaseOrder>(
      `/warehouse/purchase-orders/${id}/recalculate-status/`
    );
    return res.data;
  },

  // ─── Suggestions (EPIC-01) ──────────────────────────────

  /**
   * GET /warehouse/purchase-recommendations/
   * Web ile aynı endpoint — weeks, only_positive, branch_id destekler.
   */
  suggestPreview: async (
    req: PurchaseOrderSuggestionRequest
  ): Promise<PurchaseOrderSuggestion[]> => {
    const params: Record<string, string | number | boolean> = {
      warehouse_id: req.warehouse_id,
    };
    if (req.weeks !== undefined) params.weeks = req.weeks;
    if (req.only_positive !== undefined) params.only_positive = req.only_positive;
    if (req.branch_id) params.branch_id = req.branch_id;
    if (req.category_id) params.category_id = req.category_id;
    if (req.search) params.search = req.search;

    const res = await axiosClient.get(
      "/warehouse/purchase-recommendations/",
      { params }
    );
    // Backend paginated response döndürür: {results: [...], count: N, ...}
    const data = res.data;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    return [];
  },

  /**
   * POST /warehouse/purchase-orders/suggest/  (creates a DRAFT PO from suggestions)
   */
  suggest: async (req: PurchaseOrderSuggestionRequest): Promise<PurchaseOrder> => {
    const res = await axiosClient.post<PurchaseOrder>(
      "/warehouse/purchase-orders/suggest/",
      req
    );
    return res.data;
  },

  /**
   * POST /warehouse/purchase-recommendations/commit/
   * Web ile aynı endpoint — PurchaseRecommendationViewSet üzerinde tanımlı.
   */
  commitSuggestions: async (
    payload: PurchaseOrderSuggestionCommitPayload
  ): Promise<PurchaseOrder[]> => {
    const res = await axiosClient.post<{ orders: PurchaseOrder[]; created_count: number; skipped_items: unknown[] }>(
      "/warehouse/purchase-recommendations/commit/",
      payload
    );
    return res.data?.orders ?? [];
  },
};
