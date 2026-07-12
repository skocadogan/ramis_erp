import { useMemo } from "react"
import { useQuery, useMutation, useQueryClient, useInfiniteQuery, type UseInfiniteQueryOptions, type UseQueryOptions } from "@tanstack/react-query"
import api from "@/lib/api"
import { warehouseApi, WAREHOUSE_LIST_PAGE_SIZE } from "@/features/warehouse/services/warehouseApi"
import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import { queryKeys } from "@/lib/queryKeys"
import { pageFromDrfNext } from "@/lib/pagination"
import type { PaginatedResponse } from "@/lib/types"
import type {
  Warehouse,
  PurchaseOrder,
  GoodsReceiving,
  WarehouseTransfer,
  StockCounting,
  DeficiencyReport,
  WarehouseSummary,
  KitchenClosingItem,
  KitchenClosingResult,
  PurchaseRecommendationsResponse,
  ExpiryWarningsResponse,
  ExpirySummary,
  ExpiryActionHistoryItem,
} from "@/features/warehouse/types"

function normalizeWarehouseListPage<T>(data: PaginatedResponse<T> | T[]): PaginatedResponse<T> {
  if (Array.isArray(data)) {
    return { results: data, count: data.length, next: null, previous: null }
  }
  const results = data.results ?? []
  return {
    results,
    count: data.count ?? results.length,
    next: data.next ?? null,
    previous: data.previous ?? null,
  }
}

function useWarehouseListInfinite<T>(
  queryKey: readonly unknown[],
  fetchPage: (page: number) => Promise<PaginatedResponse<T> | T[]>,
  options?: { enabled?: boolean },
) {
  const query = useInfiniteQuery<PaginatedResponse<T>>({
    queryKey,
    queryFn: async ({ pageParam = 1 }) => normalizeWarehouseListPage(await fetchPage(pageParam as number)),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => pageFromDrfNext(lastPage.next),
    enabled: options?.enabled ?? true,
    refetchOnMount: "always",
  })
  const rows = useMemo(
    () => query.data?.pages.flatMap((p) => p.results) ?? [],
    [query.data?.pages],
  )
  const totalCount = query.data?.pages[0]?.count ?? 0
  return { ...query, rows, totalCount }
}

// ──────────────────────────────────────────────────
// Warehouses
// ──────────────────────────────────────────────────
export function useWarehouses(branchId?: string) {
  return useQuery<Warehouse[]>({
    queryKey: queryKeys.warehouses(branchId),
    queryFn: async () => {
      const { data } = await warehouseApi.getWarehouses(branchId)
      return data.results ?? data
    },
  })
}

export function useWarehouseSummary(branchId?: string) {
  return useQuery<WarehouseSummary>({
    queryKey: queryKeys.warehouseSummary(branchId),
    queryFn: async () => {
      const { data } = await warehouseApi.getWarehouseSummary(branchId)
      return data
    },
  })
}

export function useProcurementAlerts(filters?: {
  branch_id?: string
  warehouse_id?: string
  supplier_id?: string
  lookback_days?: number
}) {
  return useQuery({
    queryKey: ["procurement-alerts", filters ?? {}],
    queryFn: async () => {
      const { data } = await warehouseApi.getProcurementAlerts(filters)
      return data
    },
  })
}

// ──────────────────────────────────────────────────
// Purchase Orders
// ──────────────────────────────────────────────────
export function usePurchaseOrders(
  filters?: {
  warehouse_id?: string
  supplier_id?: string
  status?: string
  branch_id?: string
  stock_item_id?: string
  overdue?: boolean
  },
  options?: { enabled?: boolean },
) {
  return useQuery<PurchaseOrder[]>({
    queryKey: queryKeys.purchaseOrders(filters as unknown as Record<string, unknown>),
    queryFn: async () => {
      const { data } = await warehouseApi.getPurchaseOrders(filters)
      return data.results ?? data
    },
    enabled: options?.enabled ?? true,
    refetchOnMount: "always",
  })
}

export function usePurchaseOrdersInfinite(
  filters?: {
    warehouse_id?: string
    supplier_id?: string
    status?: string
    overdue?: boolean
    branch_id?: string
    stock_item_id?: string
  },
  options?: { enabled?: boolean },
) {
  return useWarehouseListInfinite<PurchaseOrder>(
    [...queryKeys.purchaseOrders(filters as unknown as Record<string, unknown>), "infinite"],
    async (page) => {
      const { data } = await warehouseApi.getPurchaseOrders({
        ...filters,
        page,
        page_size: WAREHOUSE_LIST_PAGE_SIZE,
      })
      return data as PaginatedResponse<PurchaseOrder>
    },
    options,
  )
}

// ──────────────────────────────────────────────────
// Goods Receiving
// ──────────────────────────────────────────────────
export function useGoodsReceivingsInfinite(filters?: {
  warehouse_id?: string
  supplier_id?: string
  status?: string
  branch_id?: string
}) {
  return useWarehouseListInfinite<GoodsReceiving>(
    [...queryKeys.goodsReceivings(filters as unknown as Record<string, unknown>), "infinite"],
    async (page) => {
      const { data } = await warehouseApi.getGoodsReceivings({
        ...filters,
        page,
        page_size: WAREHOUSE_LIST_PAGE_SIZE,
      })
      return data as PaginatedResponse<GoodsReceiving>
    },
  )
}

// ──────────────────────────────────────────────────
// Transfers
// ──────────────────────────────────────────────────
export function useTransfersInfinite(filters?: {
  source_warehouse_id?: string
  target_warehouse_id?: string
  status?: string
  branch_id?: string
}) {
  return useWarehouseListInfinite<WarehouseTransfer>(
    [...queryKeys.transfers(filters as unknown as Record<string, unknown>), "infinite"],
    async (page) => {
      const { data } = await warehouseApi.getTransfers({
        ...filters,
        page,
        page_size: WAREHOUSE_LIST_PAGE_SIZE,
      })
      return data as PaginatedResponse<WarehouseTransfer>
    },
  )
}

// ──────────────────────────────────────────────────
// Stock Counting
// ──────────────────────────────────────────────────
export function useStockCountingsInfinite(filters?: {
  warehouse_id?: string
  status?: string
  branch_id?: string
}) {
  return useWarehouseListInfinite<StockCounting>(
    [...queryKeys.stockCountings(filters as unknown as Record<string, unknown>), "infinite"],
    async (page) => {
      const { data } = await warehouseApi.getStockCountings({
        ...filters,
        page,
        page_size: WAREHOUSE_LIST_PAGE_SIZE,
      })
      return data as PaginatedResponse<StockCounting>
    },
  )
}

// ──────────────────────────────────────────────────
// Suppliers (from inventory module, reused)
// ──────────────────────────────────────────────────
interface Supplier {
  id: string
  name: string
}

export function useSuppliers() {
  return useQuery<Supplier[]>({
    queryKey: queryKeys.suppliersBase,
    queryFn: async () => {
      const { data } = await api.get("/inventory/suppliers/?page_size=200")
      return data.results ?? data
    },
  })
}

// ──────────────────────────────────────────────────
// Stock Items (from inventory module, reused)
// ──────────────────────────────────────────────────
interface StockItemSimple {
  id: string
  name: string
  sku: string
  unit: string
  current_quantity: string
  last_purchase_price: string | null
}

export function useStockItems(branchId?: string) {
  return useQuery<StockItemSimple[]>({
    queryKey: queryKeys.stockItemsSimple(branchId),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (branchId) params.set("branch_id", branchId)
      params.set("page_size", "500")
      const { data } = await api.get(`/inventory/stock-items/?${params}`)
      return data.results ?? data
    },
  })
}

// ──────────────────────────────────────────────────
// Branches (reused)
// ──────────────────────────────────────────────────
interface Branch {
  id: string
  name: string
}

export function useBranches() {
  return useQuery<Branch[]>({
    queryKey: queryKeys.branchesBase,
    queryFn: async () => {
      const { data } = await api.get("/branches/?page_size=100")
      return data.results ?? data
    },
  })
}

// ──────────────────────────────────────────────────
// Deficiency Reports
// ──────────────────────────────────────────────────
export function useDeficiencyReports(
  filters?: {
    kitchen_station_id?: string
    status?: string
    branch_id?: string
  },
  options?: Partial<
    Pick<
      UseQueryOptions<DeficiencyReport[]>,
      "enabled" | "staleTime" | "gcTime" | "refetchOnWindowFocus" | "refetchInterval" | "refetchOnMount"
    >
  >
) {
  return useQuery<DeficiencyReport[]>({
    queryKey: queryKeys.deficiencyReports(filters as unknown as Record<string, unknown>),
    queryFn: async () => {
      const { data } = await warehouseApi.getDeficiencyReports(filters)
      return data.results ?? data
    },
    refetchOnMount: "always",
    ...options,
  })
}

export function useDeficiencyReportsInfinite(
  filters?: {
    kitchen_station_id?: string
    status?: string
    branch_id?: string
  },
  options?: { enabled?: boolean },
) {
  return useWarehouseListInfinite<DeficiencyReport>(
    [...queryKeys.deficiencyReports(filters as unknown as Record<string, unknown>), "infinite"],
    async (page) => {
      const { data } = await warehouseApi.getDeficiencyReports({
        ...filters,
        page,
        page_size: WAREHOUSE_LIST_PAGE_SIZE,
      })
      return data as PaginatedResponse<DeficiencyReport>
    },
    options,
  )
}

// ──────────────────────────────────────────────────
// Kitchen Closing (Gün Sonu Kapanış Sayımı)
// ──────────────────────────────────────────────────
export function useKitchenClosingItems(warehouseId: string | undefined) {
  return useQuery<KitchenClosingItem[]>({
    queryKey: queryKeys.kitchenClosingItems(warehouseId),
    queryFn: () => inventoryApi.getKitchenClosingItems(warehouseId!),
    enabled: !!warehouseId,
    refetchOnMount: "always",
  })
}

export function useSubmitKitchenClosing() {
  const qc = useQueryClient()
  return useMutation<
    KitchenClosingResult,
    Error,
    { warehouse_id: string; items: { stock_item_id: string; counted_quantity: number }[] }
  >({
    mutationFn: (data) => inventoryApi.submitKitchenClosing(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.kitchenClosingItemsBase })
      qc.invalidateQueries({ queryKey: queryKeys.stockItemsBase })
    },
  })
}

// ──────────────────────────────────────────────────
// Expiring Lots / SKT (EPIC-04)
// ──────────────────────────────────────────────────
function getNextExpiryPage(next: string | null): number | undefined {
  if (!next) return undefined
  try {
    const url = new URL(next, typeof window !== "undefined" ? window.location.origin : "http://localhost")
    const page = url.searchParams.get("page")
    return page ? parseInt(page, 10) : undefined
  } catch {
    const match = next.match(/[?&]page=(\d+)/)
    return match ? parseInt(match[1], 10) : undefined
  }
}

export type ExpiryWarningFilters = {
  warehouse_id?: string
  days_ahead?: 3 | 7
}

export function useExpiryWarnings(
  filters: ExpiryWarningFilters,
  options?: Pick<UseInfiniteQueryOptions<ExpiryWarningsResponse>, "enabled">,
) {
  const queryKey = queryKeys.expiryWarnings(filters as unknown as Record<string, unknown>)

  const query = useInfiniteQuery<ExpiryWarningsResponse>({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === "number" ? pageParam : 1
      return inventoryApi.getExpiryWarnings({ ...filters, page })
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => getNextExpiryPage(lastPage.next),
    enabled: options?.enabled,
    refetchOnMount: "always",
  })

  const rows = useMemo(
    () => query.data?.pages.flatMap((p) => p.results) ?? [],
    [query.data?.pages],
  )

  const totalCount = query.data?.pages[0]?.count ?? 0

  return {
    ...query,
    rows,
    totalCount,
  }
}

export function useExpirySummary(params: { warehouse_id?: string } = {}, enabled = true) {
  return useQuery<ExpirySummary>({
    queryKey: queryKeys.expirySummary(params as unknown as Record<string, unknown>),
    queryFn: () => inventoryApi.getExpirySummary(params),
    enabled,
  })
}

export function useExpiryActionHistory(params: { warehouse_id?: string; lot_id?: string; limit?: number }) {
  return useQuery<ExpiryActionHistoryItem[]>({
    queryKey: queryKeys.expiryActionsHistory(params as unknown as Record<string, unknown>),
    queryFn: () => inventoryApi.getExpiryActionHistory(params),
  })
}

export function useExpiryActionTypes() {
  return useQuery({
    queryKey: ["expiry-action-types"] as const,
    queryFn: () => inventoryApi.getExpiryActionTypes(),
    staleTime: 60_000,
  })
}

// ──────────────────────────────────────────────────
// Purchase Recommendations (EPIC-01)
// ──────────────────────────────────────────────────
function getNextRecommendationPage(next: string | null): number | undefined {
  if (!next) return undefined
  try {
    const url = new URL(next, typeof window !== "undefined" ? window.location.origin : "http://localhost")
    const page = url.searchParams.get("page")
    return page ? parseInt(page, 10) : undefined
  } catch {
    const match = next.match(/[?&]page=(\d+)/)
    return match ? parseInt(match[1], 10) : undefined
  }
}

export type PurchaseRecommendationFilters = {
  warehouse_id?: string
  weeks?: 4 | 8
  horizon_days?: 3 | 7 | 14
  branch_id?: string
  category_id?: string
  search?: string
  only_positive?: boolean
}

export function usePurchaseRecommendations(
  filters: PurchaseRecommendationFilters,
  options?: Pick<UseInfiniteQueryOptions<PurchaseRecommendationsResponse>, "enabled">,
) {
  const queryKey = queryKeys.purchaseRecommendations(filters as unknown as Record<string, unknown>)

  const query = useInfiniteQuery<PurchaseRecommendationsResponse>({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === "number" ? pageParam : 1
      const { data } = await warehouseApi.getPurchaseRecommendations({
        warehouse_id: filters.warehouse_id!,
        weeks: filters.weeks,
        horizon_days: filters.horizon_days,
        branch_id: filters.branch_id,
        category_id: filters.category_id,
        search: filters.search,
        only_positive: filters.only_positive,
        page,
      })
      return data
    },
    getNextPageParam: (lastPage) => getNextRecommendationPage(lastPage.next),
    initialPageParam: 1,
    enabled: (options?.enabled ?? true) && !!filters.warehouse_id,
    refetchOnMount: "always",
  })

  const rows = useMemo(
    () => query.data?.pages.flatMap((page) => page.results) ?? [],
    [query.data?.pages],
  )

  const meta = query.data?.pages[0]

  return {
    ...query,
    rows,
    meta,
  }
}
