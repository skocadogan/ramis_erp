// ============================================================
// Stock Man — Deficiency Report service
//
// Thin axios wrapper for the Eksik Raporu endpoints documented
// in `docs/wiki/Warehouse.md` (§DeficiencyReportViewSet). All
// return values are already unwrapped — the caller never has
// to look at `res.data.results`.
//
// Endpoints covered:
//   - GET    /warehouse/deficiency-reports/                       list (paginated)
//   - GET    /warehouse/deficiency-reports/{id}/                  detail
//   - POST   /warehouse/deficiency-reports/                       create
//   - DELETE /warehouse/deficiency-reports/{id}/                  soft delete
//   - POST   /warehouse/deficiency-reports/{id}/approve/          DRAFT/PENDING → APPROVED
//   - POST   /warehouse/deficiency-reports/{id}/cancel/           any → CANCELLED
//   - POST   /warehouse/deficiency-reports/{id}/create_purchase_order/
//   - POST   /warehouse/deficiency-reports/{id}/create_transfer/
//   - GET    /warehouse/deficiency-reports/{id}/stock_availability/
//   - POST   /warehouse/deficiency-reports/{id}/auto_fulfill/
//   - POST   /warehouse/deficiency-reports/{id}/preview_item_actions/
//   - POST   /warehouse/deficiency-reports/{id}/execute_item_actions/
//
// Note: the backend ViewSet excludes PUT/PATCH (http_method_names),
// so there is no `update` method here on purpose.
// ============================================================

import { axiosClient } from "@/api/client";
import { extractResults } from "@/types/api";
import type {
  DeficiencyReport,
  DeficiencyReportCreatePayload,
  DeficiencyActionType,
  DeficiencyAvailabilityRow,
  DeficiencyItemActionExecutePayload,
  Paginated,
  UUID,
} from "@/types";
import type { DeficiencyActionPlanSummary } from "@/utils/deficiencyItemActions";

/** Filter shape for `deficiencyReportService.list`. */
export type DeficiencyFilters = {
  warehouse_id?: UUID;
  branch_id?: UUID;
  kitchen_station_id?: UUID;
  status?: string;
  page?: number;
  page_size?: number;
};

export const deficiencyReportService = {
  /**
   * GET /warehouse/deficiency-reports/
   */
  list: async (filters: DeficiencyFilters = {}): Promise<Paginated<DeficiencyReport>> => {
    const res = await axiosClient.get("/warehouse/deficiency-reports/", { params: filters });
    return res.data;
  },

  /**
   * GET /warehouse/deficiency-reports/{id}/
   */
  get: async (id: UUID): Promise<DeficiencyReport> => {
    const res = await axiosClient.get<DeficiencyReport>(`/warehouse/deficiency-reports/${id}/`);
    return res.data;
  },

  /**
   * POST /warehouse/deficiency-reports/
   */
  create: async (payload: DeficiencyReportCreatePayload): Promise<DeficiencyReport> => {
    const res = await axiosClient.post<DeficiencyReport>("/warehouse/deficiency-reports/", payload);
    return res.data;
  },

  // No update — backend doesn't allow it (http_method_names excludes PUT/PATCH)

  /**
   * DELETE /warehouse/deficiency-reports/{id}/  (soft delete via is_active=false)
   */
  remove: async (id: UUID): Promise<void> => {
    await axiosClient.delete(`/warehouse/deficiency-reports/${id}/`);
  },

  // ─── Custom actions ─────────────────────────────────────

  /**
   * POST /warehouse/deficiency-reports/{id}/approve/
   * DRAFT/PENDING → APPROVED.
   */
  approve: async (id: UUID): Promise<DeficiencyReport> => {
    const res = await axiosClient.post<DeficiencyReport>(`/warehouse/deficiency-reports/${id}/approve/`);
    return res.data;
  },

  /**
   * POST /warehouse/deficiency-reports/{id}/cancel/
   * Any non-terminal state → CANCELLED.
   */
  cancel: async (id: UUID): Promise<DeficiencyReport> => {
    const res = await axiosClient.post<DeficiencyReport>(`/warehouse/deficiency-reports/${id}/cancel/`);
    return res.data;
  },

  /**
   * POST /warehouse/deficiency-reports/{id}/create_purchase_order/
   * Spawns a DRAFT PurchaseOrder for the items the user marked as
   * PURCHASE_ALL / PURCHASE_PARTIAL. Returns the new PO id.
   */
  createPurchaseOrder: async (
    id: UUID,
    params: { supplier_id: UUID; warehouse_id: UUID }
  ): Promise<{ id: UUID }> => {
    const res = await axiosClient.post(
      `/warehouse/deficiency-reports/${id}/create_purchase_order/`,
      params
    );
    const data = res.data as { id?: UUID; purchase_order_id?: UUID };
    return { id: data.id ?? data.purchase_order_id! };
  },

  /**
   * POST /warehouse/deficiency-reports/{id}/create_transfer/
   * Spawns a DRAFT WarehouseTransfer for the items the user marked
   * as FULFILL_STOCK. Returns the new transfer id.
   */
  createTransfer: async (
    id: UUID,
    params: { source_warehouse_id: UUID }
  ): Promise<{ id: UUID }> => {
    const res = await axiosClient.post(
      `/warehouse/deficiency-reports/${id}/create_transfer/`,
      params
    );
    const data = res.data as { id?: UUID; transfer_id?: UUID };
    return { id: data.id ?? data.transfer_id! };
  },

  /**
   * GET /warehouse/deficiency-reports/{id}/stock_availability/
   * Returns a flat array of warehouse stock snapshots (not paginated) —
   * so we run it through `extractResults` for caller ergonomics.
   */
  stockAvailability: async (id: UUID): Promise<DeficiencyAvailabilityRow[]> => {
    const res = await axiosClient.get(`/warehouse/deficiency-reports/${id}/stock_availability/`);
    return extractResults<DeficiencyAvailabilityRow>(res.data);
  },

  /**
   * POST /warehouse/deficiency-reports/{id}/auto_fulfill/
   * Best-effort fulfillment: try stock first, fall back to PO for the rest.
   */
  autoFulfill: async (id: UUID): Promise<DeficiencyReport> => {
    const res = await axiosClient.post<DeficiencyReport>(`/warehouse/deficiency-reports/${id}/auto_fulfill/`);
    return res.data;
  },

  /**
   * POST /warehouse/deficiency-reports/{id}/preview_item_actions/
   * Returns the resolved per-line plan (supplier, available stock split)
   * for the user to review before committing via `executeItemActions`.
   */
  previewItemActions: async (
    id: UUID,
    items: { item_id: UUID; action: DeficiencyActionType }[]
  ): Promise<DeficiencyActionPlanSummary> => {
    const res = await axiosClient.post<DeficiencyActionPlanSummary>(
      `/warehouse/deficiency-reports/${id}/preview_item_actions/`,
      { items }
    );
    return res.data;
  },

  /**
   * POST /warehouse/deficiency-reports/{id}/execute_item_actions/
   * Commits the planned actions — backend may emit transfers/POs and
   * move the report to PARTIALLY_COMMITTED / COMMITTED.
   */
  executeItemActions: async (id: UUID, payload: DeficiencyItemActionExecutePayload): Promise<DeficiencyReport> => {
    const res = await axiosClient.post<DeficiencyReport>(
      `/warehouse/deficiency-reports/${id}/execute_item_actions/`,
      payload
    );
    return res.data;
  },
};
