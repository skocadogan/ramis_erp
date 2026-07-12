import api from "@/lib/api"
import type {
  StockItem,
  FEFOReportListItem,
  FEFOReportItem,
  StockItemWarehouseLevel,
  StockMovement,
  Supplier,
  StockCategory,
  StockUnit,
  StockReceiptDraft,
  StockReceiptDraftFinalizeResponse,
  SupplierRejectedItem,
  SupplierGoodsReceivingSummary,
} from "@/features/inventory/types"
import type { PaginatedResponse } from "@/lib/types"
import type {
  ExpiryActionHistoryItem,
  ExpiryActionPreviewSummary,
  ExpiryActionType,
  ExpiryActionTypesResponse,
  ExpirySummary,
  ExpiryWarningsResponse,
} from "@/features/warehouse/types"

interface StockItemsParams {
  page?: number
  search?: string
  category_id?: string
  warehouse_id?: string
  branch_id?: string
  is_low_stock?: boolean
  stock_status?: string
  page_size?: number
}

interface StockMovementsParams {
  page?: number
  search?: string
  movement_type?: string
  movement_types?: string
  start_date?: string
  end_date?: string
  warehouse_id?: string
  branch_id?: string
  stock_item_id?: string
  reason_code?: string
  supplier_id?: string
  page_size?: number
}

export const inventoryApi = {
  // Stok Kalemleri
  getStockItems: (params: StockItemsParams = {}) =>
    api.get<PaginatedResponse<StockItem>>("/inventory/stock-items/", { params }).then(r => r.data),

  getStockItem: (id: string) =>
    api.get<StockItem>(`/inventory/stock-items/${id}/`).then(r => r.data),

  getStockItemWarehouseLevels: (id: string) =>
    api.get<StockItemWarehouseLevel[]>(`/inventory/stock-items/${id}/warehouse-levels/`).then((r) => r.data),

  createStockItem: (data: Partial<StockItem>) =>
    api.post<StockItem>("/inventory/stock-items/", data).then(r => r.data),

  updateStockItem: (id: string, data: Partial<StockItem>) =>
    api.put<StockItem>(`/inventory/stock-items/${id}/`, data).then(r => r.data),

  deleteStockItem: (id: string) =>
    api.delete(`/inventory/stock-items/${id}/`),

  bulkUpdateMinimums: (rows: { sku: string; minimum_quantity: string | number }[]) =>
    api.post("/inventory/stock-items/bulk-update-minimums/", { rows }).then(r => r.data),

  getStockSummary: (params: { category_id?: string; warehouse_id?: string } = {}) =>
    api.get("/inventory/stock-items/summary/", { params }).then(r => r.data),

  // Stok Hareketleri
  getStockMovements: (params: StockMovementsParams = {}) =>
    api.get<PaginatedResponse<StockMovement>>("/inventory/stock-movements/", { params }).then(r => r.data),

  getPriceIncreases: (params?: {
    branch_id?: string
    category_id?: string
    min_change_pct?: number
    lookback_days?: number
    page?: number
    page_size?: number
  }) => api.get("/inventory/stock-items/price-increases/", { params }).then(r => r.data),

  createStockMovement: (data: Record<string, unknown>) =>
    api.post<StockMovement>("/inventory/stock-movements/", data).then(r => r.data),

  deleteStockMovement: (id: string) =>
    api.delete(`/inventory/stock-movements/${id}/`),

  getReturnCancelReasonCodes: () =>
    api.get<Array<{ code: string; label: string }>>("/inventory/stock-movements/reason-codes/").then(r => r.data),

  exportReturnCancelExcel: (params: Record<string, unknown>) =>
    api.get("/inventory/stock-movements/export/excel/", { params, responseType: "blob" }).then(r => r.data),

  // Tedarikçiler
  getSuppliers: () =>
    api.get<PaginatedResponse<Supplier>>("/inventory/suppliers/").then(r => r.data.results || r.data),

  getSupplierPerformance: (id: string, days: number = 30) =>
    api.get(`/inventory/suppliers/${id}/performance/`, { params: { days } }).then(r => r.data),

  getSupplierRejectedItems: (id: string, params: { page?: number; page_size?: number; start_date?: string; end_date?: string; search?: string } = {}) =>
    api.get<PaginatedResponse<SupplierRejectedItem>>(`/inventory/suppliers/${id}/rejected_items/`, { params }).then(r => r.data),

  getSupplierGoodsReceivings: (id: string, params: { page?: number; page_size?: number; start_date?: string; end_date?: string; search?: string } = {}) =>
    api.get<PaginatedResponse<SupplierGoodsReceivingSummary>>(`/inventory/suppliers/${id}/goods_receivings/`, { params }).then(r => r.data),

  createSupplier: (data: Partial<Supplier>) =>
    api.post<Supplier>("/inventory/suppliers/", data).then(r => r.data),

  updateSupplier: (id: string, data: Partial<Supplier>) =>
    api.put<Supplier>(`/inventory/suppliers/${id}/`, data).then(r => r.data),

  deleteSupplier: (id: string) =>
    api.delete(`/inventory/suppliers/${id}/`),

  // Categories
  getCategories: () =>
    api.get<PaginatedResponse<StockCategory>>("/inventory/categories/").then(r => r.data.results || r.data),

  createCategory: (data: Partial<StockCategory>) =>
    api.post<StockCategory>("/inventory/categories/", data).then(r => r.data),

  updateCategory: (id: string, data: Partial<StockCategory>) =>
    api.put<StockCategory>(`/inventory/categories/${id}/`, data).then(r => r.data),

  deleteCategory: (id: string) =>
    api.delete(`/inventory/categories/${id}/`),

  // Stock Units
  getStockUnits: () =>
    api.get<PaginatedResponse<StockUnit>>("/inventory/stock-units/").then(r => r.data.results || r.data),

  createStockUnit: (data: Partial<StockUnit>) =>
    api.post<StockUnit>("/inventory/stock-units/", data).then(r => r.data),

  updateStockUnit: (id: string, data: Partial<StockUnit>) =>
    api.put<StockUnit>(`/inventory/stock-units/${id}/`, data).then(r => r.data),

  deleteStockUnit: (id: string) =>
    api.delete(`/inventory/stock-units/${id}/`),

  // Warehouses
  getWarehouses: (params?: { branch_id?: string }) =>
    api.get("/warehouse/warehouses/", { params }).then(r => r.data.results || r.data),

  // ──────────────────────────────────────────────────
  // Gün Sonu Kapanış Sayımı
  // ──────────────────────────────────────────────────
  getKitchenClosingItems: (warehouseId: string) =>
    api.get("/inventory/stock-items/kitchen-closing-items/", {
      params: { warehouse_id: warehouseId },
    }).then(r => r.data),

  submitKitchenClosing: (data: {
    warehouse_id: string
    items: { stock_item_id: string; counted_quantity: number }[]
  }) =>
    api.post("/inventory/stock-items/submit-kitchen-closing/", data).then(r => r.data),

  // ──────────────────────────────────────────────────
  // SKT Yaklaşan Partileri
  // ──────────────────────────────────────────────────
  getExpiringLots: (params: { warehouse_id?: string; days_ahead?: number } = {}) =>
    api.get("/inventory/stock-items/expiring_lots/", { params }).then(r => r.data),

  getExpiryWarnings: (params: { warehouse_id?: string; days_ahead?: number; page?: number; page_size?: number } = {}) =>
    api
      .get<ExpiryWarningsResponse>("/inventory/expiry-warnings/", {
        params: { page_size: 100, ...params },
      })
      .then((r) => r.data),

  getExpirySummary: (params: { warehouse_id?: string } = {}) =>
    api.get<ExpirySummary>("/inventory/expiry-warnings/summary/", { params }).then((r) => r.data),

  commitExpiryAction: (payload: { lot_id: string; action_type: ExpiryActionType; notes?: string }) =>
    api
      .post<ExpiryActionHistoryItem>("/inventory/expiry-warnings/actions/", payload)
      .then((r) => r.data),

  previewExpiryAction: (payload: {
    lot_id: string
    action_type: ExpiryActionType
    notes?: string
    target_warehouse_id?: string
    quantity?: number | string
  }) =>
    api
      .post<ExpiryActionPreviewSummary>("/inventory/expiry-warnings/actions/preview/", payload)
      .then((r) => r.data),

  executeExpiryAction: (payload: {
    lot_id: string
    action_type: ExpiryActionType
    notes?: string
    target_warehouse_id?: string
    quantity?: number | string
  }) =>
    api
      .post<ExpiryActionHistoryItem>("/inventory/expiry-warnings/actions/execute/", payload)
      .then((r) => r.data),

  getExpiryActionTypes: () =>
    api.get<ExpiryActionTypesResponse>("/inventory/expiry-warnings/action-types/").then((r) => r.data),

  autoReturnCancelExpiredLot: (payload: { lot_id: string; notes?: string }) =>
    api
      .post<StockMovement>("/inventory/expiry-warnings/auto-return-cancel/", payload)
      .then((r) => r.data),

  getExpiryActionHistory: (params: { warehouse_id?: string; lot_id?: string; limit?: number } = {}) =>
    api
      .get<ExpiryActionHistoryItem[]>("/inventory/expiry-warnings/actions/history/", { params })
      .then((r) => r.data),

  // Toplu stok girişi
  getStockReceiptDrafts: (params: { page?: number; page_size?: number } = {}) =>
    api
      .get<{ results: StockReceiptDraft[]; next: string | null }>("/inventory/stock-receipt-drafts/", { params })
      .then((r) => r.data),

  getStockReceiptDraft: (id: string) =>
    api.get<StockReceiptDraft>(`/inventory/stock-receipt-drafts/${id}/`).then((r) => r.data),

  createStockReceiptDraft: (data: {
    warehouse: string
    supplier?: string | null
    reference?: string
    notes?: string
    lines: Record<string, unknown>[]
  }) => api.post<StockReceiptDraft>("/inventory/stock-receipt-drafts/", data).then((r) => r.data),

  updateStockReceiptDraft: (
    id: string,
    data: Partial<{
      warehouse: string
      supplier: string | null
      reference: string
      notes: string
      lines: Record<string, unknown>[]
    }>,
  ) => api.patch<StockReceiptDraft>(`/inventory/stock-receipt-drafts/${id}/`, data).then((r) => r.data),

  deleteStockReceiptDraft: (id: string) => api.delete(`/inventory/stock-receipt-drafts/${id}/`),

  finalizeStockReceiptDraft: (id: string) =>
    api
      .post<StockReceiptDraftFinalizeResponse>(`/inventory/stock-receipt-drafts/${id}/finalize/`)
      .then((r) => r.data),

  // FEFO Envanter Raporu
  getFEFOInventoryReport: (params: { warehouse_id?: string; category_id?: string; page?: number; search?: string } = {}) =>
    api.get<PaginatedResponse<FEFOReportListItem>>("/inventory/stock-items/fefo-report/", { params }).then(r => r.data),

  getFEFOInventoryReportDetail: (
    stockItemId: string,
    params?: { warehouse_id?: string },
  ) =>
    api
      .get<FEFOReportItem>(`/inventory/stock-items/fefo-report/detail/`, {
        params: { stock_item_id: stockItemId, ...params },
      })
      .then((r) => r.data),
}
