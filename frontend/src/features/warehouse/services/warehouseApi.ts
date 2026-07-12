import api from "@/lib/api"
import type { ProcurementAlertsResponse } from "@/features/warehouse/types"

/** Depo ürünleri modalı sonsuz kaydırma — denge: istek sayısı / payload */
export const WAREHOUSE_INVENTORY_PAGE_SIZE = 100

/** Depo liste sekmeleri (PO, mal kabul, transfer vb.) infinite scroll sayfa boyutu */
export const WAREHOUSE_LIST_PAGE_SIZE = 50

type WarehouseListPagination = { page?: number; page_size?: number }

export type WarehouseStockLevelsPagePayload = {
  results: unknown[]
  /** Sunucudaki toplam kalem (pagination.count) */
  count: number
  page: number
  pageSize: number
}

// ──────────────────────────────────────────────────
// Warehouses
// ──────────────────────────────────────────────────
export const warehouseApi = {
  getWarehouses: (branchId?: string) => {
    const params = new URLSearchParams()
    if (branchId) params.set("branch_id", branchId)
    params.set("page_size", "200")
    return api.get(`/warehouse/warehouses/?${params}`)
  },

  getWarehouseStockLevels: (warehouseId: string, opts?: { low_stock?: boolean; page?: number; page_size?: number }) => {
    const params = new URLSearchParams()
    if (opts?.low_stock) params.set("low_stock", "true")
    params.set("page_size", opts?.page_size != null ? String(opts.page_size) : "200")
    if (opts?.page) params.set("page", String(opts.page))
    return api.get(`/warehouse/warehouses/${warehouseId}/stock_levels/?${params}`)
  },

  /** Tek sayfa — infinite scroll / ilk boyama için */
  fetchWarehouseStockLevelsPage: async (
    warehouseId: string,
    page: number,
    opts?: { low_stock?: boolean; page_size?: number; search?: string },
  ): Promise<WarehouseStockLevelsPagePayload> => {
    const pageSize = opts?.page_size ?? WAREHOUSE_INVENTORY_PAGE_SIZE
    const params = new URLSearchParams()
    if (opts?.low_stock) params.set("low_stock", "true")
    params.set("page_size", String(pageSize))
    params.set("page", String(page))
    const q = opts?.search?.trim()
    if (q) params.set("search", q)
    const { data } = await api.get(`/warehouse/warehouses/${warehouseId}/stock_levels/?${params}`)
    const raw = data.results ?? data
    const results = Array.isArray(raw) ? raw : []
    const count = typeof data.count === "number" ? data.count : results.length
    return { results, count, page, pageSize }
  },

  /** Sayfalama: tüm stok satırlarını ardışık sayfalarla yükler (max page_size 200). */
  fetchAllWarehouseStockLevels: async (warehouseId: string, opts?: { low_stock?: boolean }) => {
    const out: unknown[] = []
    let page = 1
    for (;;) {
      const { data } = await api.get(`/warehouse/warehouses/${warehouseId}/stock_levels/`, {
        params: {
          page_size: 200,
          page,
          ...(opts?.low_stock ? { low_stock: "true" } : {}),
        },
      })
      const results = data.results ?? data
      const arr = Array.isArray(results) ? results : []
      out.push(...arr)
      if (!data.next || arr.length === 0) break
      page += 1
    }
    return out
  },

  setWarehouseStockMinimum: (warehouseId: string, data: { stock_item_id: string; minimum_quantity: string | number }) =>
    api.post(`/warehouse/warehouses/${warehouseId}/set_minimum/`, data),

  getWarehouseSummary: (branchId?: string) => {
    const params = new URLSearchParams()
    if (branchId) params.set("branch_id", branchId)
    return api.get(`/warehouse/warehouses/summary/?${params}`)
  },

  createWarehouse: (data: Record<string, unknown>) =>
    api.post("/warehouse/warehouses/", data),

  updateWarehouse: (id: string, data: Record<string, unknown>) =>
    api.patch(`/warehouse/warehouses/${id}/`, data),

  deleteWarehouse: (id: string) =>
    api.delete(`/warehouse/warehouses/${id}/`),

  // ──────────────────────────────────────────────────
  // Purchase Orders
  // ──────────────────────────────────────────────────
  getPurchaseOrders: (filters?: {
    warehouse_id?: string
    supplier_id?: string
    status?: string
    overdue?: boolean
    branch_id?: string
    stock_item_id?: string
  } & WarehouseListPagination) => {
    const params = new URLSearchParams()
    if (filters?.warehouse_id) params.set("warehouse_id", filters.warehouse_id)
    if (filters?.supplier_id) params.set("supplier_id", filters.supplier_id)
    if (filters?.status) params.set("status", filters.status)
    if (filters?.overdue) params.set("overdue", "true")
    if (filters?.branch_id) params.set("branch_id", filters.branch_id)
    if (filters?.stock_item_id) params.set("stock_item_id", filters.stock_item_id)
    params.set("page_size", String(filters?.page_size ?? 200))
    if (filters?.page) params.set("page", String(filters.page))
    return api.get(`/warehouse/purchase-orders/?${params}`)
  },

  createPurchaseOrder: (data: Record<string, unknown>) =>
    api.post("/warehouse/purchase-orders/", data),

  updatePurchaseOrder: (id: string, data: Record<string, unknown>) =>
    api.patch(`/warehouse/purchase-orders/${id}/`, data),

  previewSuggestPurchaseOrders: (warehouse_id: string) =>
    api.post("/warehouse/purchase-orders/suggest-preview/", { warehouse_id }),

  suggestPurchaseOrders: (warehouse_id: string, preferred_suppliers?: Record<string, string>) =>
    api.post("/warehouse/purchase-orders/suggest/", { warehouse_id, preferred_suppliers }),

  // ──────────────────────────────────────────────────
  // Purchase Recommendations (EPIC-01)
  // ──────────────────────────────────────────────────
  getPurchaseRecommendations: (filters: {
    warehouse_id: string
    weeks?: 4 | 8
    horizon_days?: 3 | 7 | 14
    branch_id?: string
    category_id?: string
    search?: string
    only_positive?: boolean
    page?: number
    page_size?: number
  }) => {
    const params = new URLSearchParams()
    params.set("warehouse_id", filters.warehouse_id)
    params.set("weeks", String(filters.weeks ?? 4))
    if (filters.horizon_days) params.set("horizon_days", String(filters.horizon_days))
    if (filters.branch_id) params.set("branch_id", filters.branch_id)
    if (filters.category_id) params.set("category_id", filters.category_id)
    if (filters.search?.trim()) params.set("search", filters.search.trim())
    params.set("only_positive", filters.only_positive === false ? "false" : "true")
    params.set("page_size", String(filters.page_size ?? 50))
    if (filters.page) params.set("page", String(filters.page))
    return api.get(`/warehouse/purchase-recommendations/?${params}`)
  },

  commitPurchaseRecommendations: (payload: {
    warehouse_id: string
    items: Array<{
      stock_item_id: string
      quantity: string | number
      recommended_quantity?: string | number
    }>
    preferred_suppliers?: Record<string, string>
  }) => api.post("/warehouse/purchase-recommendations/commit/", payload),

  getProcurementAlerts: (filters?: {
    branch_id?: string
    warehouse_id?: string
    supplier_id?: string
    lookback_days?: number
  }) => {
    const params = new URLSearchParams()
    if (filters?.branch_id) params.set("branch_id", filters.branch_id)
    if (filters?.warehouse_id) params.set("warehouse_id", filters.warehouse_id)
    if (filters?.supplier_id) params.set("supplier_id", filters.supplier_id)
    if (filters?.lookback_days) params.set("lookback_days", String(filters.lookback_days))
    return api.get<ProcurementAlertsResponse>(`/warehouse/procurement-alerts/?${params}`)
  },

  recalculatePurchaseOrderStatus: (id: string) =>
    api.post(`/warehouse/purchase-orders/${id}/recalculate-status/`),

  submitPurchaseOrder: (id: string) =>
    api.post(`/warehouse/purchase-orders/${id}/submit/`),

  approvePurchaseOrder: (id: string) =>
    api.post(`/warehouse/purchase-orders/${id}/approve/`),

  markOrderedPurchaseOrder: (id: string) =>
    api.post(`/warehouse/purchase-orders/${id}/mark_ordered/`),

  cancelPurchaseOrder: (id: string) =>
    api.post(`/warehouse/purchase-orders/${id}/cancel/`),
 
  deletePurchaseOrder: (id: string) =>
    api.delete(`/warehouse/purchase-orders/${id}/`),

  // ──────────────────────────────────────────────────
  // Goods Receiving
  // ──────────────────────────────────────────────────
  getGoodsReceivings: (filters?: {
    warehouse_id?: string
    supplier_id?: string
    status?: string
    branch_id?: string
  } & WarehouseListPagination) => {
    const params = new URLSearchParams()
    if (filters?.warehouse_id) params.set("warehouse_id", filters.warehouse_id)
    if (filters?.supplier_id) params.set("supplier_id", filters.supplier_id)
    if (filters?.status) params.set("status", filters.status)
    if (filters?.branch_id) params.set("branch_id", filters.branch_id)
    params.set("page_size", String(filters?.page_size ?? 200))
    if (filters?.page) params.set("page", String(filters.page))
    return api.get(`/warehouse/goods-receiving/?${params}`)
  },

  createGoodsReceiving: (data: Record<string, unknown>) =>
    api.post("/warehouse/goods-receiving/", data),

  completeGoodsReceiving: (id: string) =>
    api.post(`/warehouse/goods-receiving/${id}/complete/`),

  deleteGoodsReceiving: (id: string) =>
    api.delete(`/warehouse/goods-receiving/${id}/`),

  // ──────────────────────────────────────────────────
  // Transfers
  // ──────────────────────────────────────────────────
  getTransfers: (filters?: {
    source_warehouse_id?: string
    target_warehouse_id?: string
    status?: string
    branch_id?: string
  } & WarehouseListPagination) => {
    const params = new URLSearchParams()
    if (filters?.source_warehouse_id) params.set("source_warehouse_id", filters.source_warehouse_id)
    if (filters?.target_warehouse_id) params.set("target_warehouse_id", filters.target_warehouse_id)
    if (filters?.status) params.set("status", filters.status)
    if (filters?.branch_id) params.set("branch_id", filters.branch_id)
    params.set("page_size", String(filters?.page_size ?? 200))
    if (filters?.page) params.set("page", String(filters.page))
    return api.get(`/warehouse/transfers/?${params}`)
  },

  createTransfer: (data: Record<string, unknown>) =>
    api.post("/warehouse/transfers/", data),

  updateTransfer: (id: string, data: Record<string, unknown>) =>
    api.put(`/warehouse/transfers/${id}/`, data),

  approveTransfer: (id: string) =>
    api.post(`/warehouse/transfers/${id}/approve/`),

  completeTransfer: (id: string) =>
    api.post(`/warehouse/transfers/${id}/complete/`),

  cancelTransfer: (id: string) =>
    api.post(`/warehouse/transfers/${id}/cancel/`),

  // ──────────────────────────────────────────────────
  // Stock Counting
  // ──────────────────────────────────────────────────
  getStockCountings: (filters?: {
    warehouse_id?: string
    status?: string
    branch_id?: string
  } & WarehouseListPagination) => {
    const params = new URLSearchParams()
    if (filters?.warehouse_id) params.set("warehouse_id", filters.warehouse_id)
    if (filters?.status) params.set("status", filters.status)
    if (filters?.branch_id) params.set("branch_id", filters.branch_id)
    params.set("page_size", String(filters?.page_size ?? 200))
    if (filters?.page) params.set("page", String(filters.page))
    return api.get(`/warehouse/stock-counting/?${params}`)
  },

  createStockCounting: (data: Record<string, unknown>) =>
    api.post("/warehouse/stock-counting/", data),

  startStockCounting: (id: string) =>
    api.post(`/warehouse/stock-counting/${id}/start/`),

  finishStockCounting: (id: string) =>
    api.post(`/warehouse/stock-counting/${id}/finish/`),

  approveStockCounting: (id: string) =>
    api.post(`/warehouse/stock-counting/${id}/approve/`),

  updateCountingItems: (id: string, items: Record<string, unknown>[]) =>
    api.post(`/warehouse/stock-counting/${id}/update_items/`, { items }),

  deleteStockCounting: (id: string) => api.delete(`/warehouse/stock-counting/${id}/`),

  // ──────────────────────────────────────────────────
  // Deficiency Reports
  // ──────────────────────────────────────────────────
  getDeficiencyReports: (filters?: {
    kitchen_station_id?: string
    status?: string
    branch_id?: string
  } & WarehouseListPagination) => {
    const params = new URLSearchParams()
    if (filters?.kitchen_station_id) params.set("kitchen_station_id", filters.kitchen_station_id)
    if (filters?.status) params.set("status", filters.status)
    if (filters?.branch_id) params.set("branch_id", filters.branch_id)
    params.set("page_size", String(filters?.page_size ?? 200))
    if (filters?.page) params.set("page", String(filters.page))
    return api.get(`/warehouse/deficiency-reports/?${params}`)
  },

  createDeficiencyReport: (data: Record<string, unknown>) =>
    api.post("/warehouse/deficiency-reports/", data),

  approveDeficiencyReport: (id: string) =>
    api.post(`/warehouse/deficiency-reports/${id}/approve/`),

  cancelDeficiencyReport: (id: string) =>
    api.post(`/warehouse/deficiency-reports/${id}/cancel/`),

  deleteDeficiencyReport: (id: string) => api.delete(`/warehouse/deficiency-reports/${id}/`),

  createPOFromDeficiency: (id: string, supplier_id: string, warehouse_id: string) =>
    api.post(`/warehouse/deficiency-reports/${id}/create_purchase_order/`, { supplier_id, warehouse_id }),

  createTransferFromDeficiency: (id: string, source_warehouse_id: string) =>
    api.post(`/warehouse/deficiency-reports/${id}/create_transfer/`, { source_warehouse_id }),

  getDeficiencyStockAvailability: (id: string) =>
    api.get(`/warehouse/deficiency-reports/${id}/stock_availability/`),

  autoFulfillDeficiency: (id: string) =>
    api.post(`/warehouse/deficiency-reports/${id}/auto_fulfill/`),

  previewDeficiencyItemActions: (
    id: string,
    items: Array<{ item_id: string; action: string }>,
  ) => api.post(`/warehouse/deficiency-reports/${id}/preview_item_actions/`, { items }),

  executeDeficiencyItemActions: (
    id: string,
    payload: {
      items: Array<{ item_id: string; action: string }>
      supplier_id?: string
      warehouse_id?: string
    },
  ) => api.post(`/warehouse/deficiency-reports/${id}/execute_item_actions/`, payload),
}
