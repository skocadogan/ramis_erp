"use client";

import { useState, useMemo, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import { useDebounce } from "@/hooks/useDebounce"
import { queryKeys } from "@/lib/queryKeys"

import { StockItem, StockCategory, StockUnit, StockMovement, Supplier, TabType } from '@/features/inventory/types'
import { PaginatedResponse } from '@/lib/types'

interface Warehouse {
  id: string
  name: string
  code: string
}

const INVENTORY_TAB_TYPES: TabType[] = [
  "items",
  "movements",
  "suppliers",
  "categories",
  "unit_definitions",
  "fefo_report",
]

function isInventoryTabType(value: string | null): value is TabType {
  return value !== null && INVENTORY_TAB_TYPES.includes(value as TabType)
}

/** Yetki: sayfa `AuthGuard module="inventory"` ile sarıldığında bu hook yalnızca izin verildikten sonra çalışır. */
export function useInventory(branchId?: string) {
  const queryClient = useQueryClient()
  const t = useTranslations("inventory")
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")

  // --- State ---
  const [activeTab, setActiveTab] = useState<TabType>(() =>
    isInventoryTabType(tabParam) ? tabParam : "items",
  )

  useEffect(() => {
    if (isInventoryTabType(tabParam)) {
      setActiveTab(tabParam)
    }
  }, [tabParam])
  const [searchTerm, setSearchTerm] = useState("")
  const debouncedSearchTerm = useDebounce(searchTerm, 500)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null)
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>("ALL")
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  const [showLowStockOnly, setShowLowStockOnly] = useState(false)
  const [stockStatus, setStockStatus] = useState<string>("")


  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    if (type === 'error') {
      toast.error(msg)
    } else {
      toast.success(msg)
    }
  }

  // --- Queries ---
  
  // Warehouses
  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: [...queryKeys.warehouses(), { branch_id: branchId }],
    queryFn: () => inventoryApi.getWarehouses({ branch_id: branchId }),
    enabled: true,
  })

  // Stock Items
  const {
    data: itemsPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: itemsLoading
  } = useInfiniteQuery<PaginatedResponse<StockItem>>({
    queryKey: queryKeys.stockItems({
      search: debouncedSearchTerm,
      category_id: selectedCategoryId,
      warehouse_id: selectedWarehouseId,
      branch_id: branchId,
      is_low_stock: showLowStockOnly,
      stock_status: stockStatus
    }),
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === "number" ? pageParam : 1
      return inventoryApi.getStockItems({
        page,
        ...(debouncedSearchTerm && { search: debouncedSearchTerm }),
        ...(selectedCategoryId && { category_id: selectedCategoryId }),
        ...(selectedWarehouseId && { warehouse_id: selectedWarehouseId }),
        ...(branchId && { branch_id: branchId }),
        ...(showLowStockOnly && { is_low_stock: true }),
        ...(stockStatus && { stock_status: stockStatus }),
      })
    },

    getNextPageParam: (lastPage) => {
      if (!lastPage.next) return undefined
      const url = new URL(lastPage.next)
      return parseInt(url.searchParams.get('page') || '1')
    },
    initialPageParam: 1,
    enabled: activeTab === "items",
  })

  const stockItems = useMemo(() => {
    return itemsPages?.pages.flatMap(page => page.results) || []
  }, [itemsPages])

  // Summary/Stats
  const { data: summaryData } = useQuery({
    queryKey: queryKeys.stockSummary({
      category_id: selectedCategoryId,
      warehouse_id: selectedWarehouseId,
    }),
    queryFn: async () => {
      return inventoryApi.getStockSummary({
        ...(selectedCategoryId && { category_id: selectedCategoryId }),
        ...(selectedWarehouseId && { warehouse_id: selectedWarehouseId }),
      })
    },
    enabled: true,
  })

  // Movements
  const {
    data: movementsPages,
    fetchNextPage: fetchNextMovements,
    hasNextPage: hasNextMovements,
    isFetchingNextPage: isFetchingNextMovements,
    isLoading: movementsLoading
  } = useInfiniteQuery<PaginatedResponse<StockMovement>>({
    queryKey: queryKeys.stockMovements({
      search: debouncedSearchTerm,
      movement_type: movementTypeFilter,
      start_date: startDate,
      end_date: endDate,
      warehouse_id: selectedWarehouseId,
      branch_id: branchId
    }),
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === "number" ? pageParam : 1
      return inventoryApi.getStockMovements({
        page,
        ...(debouncedSearchTerm && { search: debouncedSearchTerm }),
        ...(movementTypeFilter !== "ALL" && { movement_type: movementTypeFilter }),
        ...(startDate && { start_date: startDate }),
        ...(endDate && { end_date: endDate }),
        ...(selectedWarehouseId && { warehouse_id: selectedWarehouseId }),
        ...(branchId && { branch_id: branchId }),
      })
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.next) return undefined
      const url = new URL(lastPage.next)
      return parseInt(url.searchParams.get('page') || '1')
    },
    initialPageParam: 1,
    enabled: activeTab === "movements",
  })

  const stockMovements = useMemo(() => {
    return movementsPages?.pages.flatMap(page => page.results) || []
  }, [movementsPages])

  // Helpers for static data with React Query
  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery<Supplier[]>({
    queryKey: queryKeys.suppliersBase,
    queryFn: () => inventoryApi.getSuppliers() as Promise<Supplier[]>,
    enabled: true,
  })

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<StockCategory[]>({
    queryKey: queryKeys.categoriesBase,
    queryFn: () => inventoryApi.getCategories() as Promise<StockCategory[]>,
    enabled: true,
  })

  const { data: stockUnits = [], isLoading: unitsLoading } = useQuery<StockUnit[]>({
    queryKey: queryKeys.stockUnitsBase,
    queryFn: () => inventoryApi.getStockUnits() as Promise<StockUnit[]>,
    enabled: true,
  })

  const isLoading = itemsLoading || suppliersLoading || categoriesLoading || unitsLoading || movementsLoading

  return {
    // Tab & Loading
    activeTab,
    setActiveTab,
    isLoading,
    isLoadingItems: itemsLoading,
    isLoadingMovements: movementsLoading,
    isLoadingSuppliers: suppliersLoading,
    isLoadingCategories: categoriesLoading,
    isLoadingUnits: unitsLoading,
    
    // Data
    stockItems,
    summaryData,
    stockMovements,
    suppliers,
    categories,
    stockUnits,
    warehouses,
    
    // Filters
    searchTerm,
    setSearchTerm,
    selectedCategoryId,
    setSelectedCategoryId,
    selectedWarehouseId,
    setSelectedWarehouseId,
    movementTypeFilter,
    setMovementTypeFilter,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    showLowStockOnly,
    setShowLowStockOnly,
    stockStatus,
    setStockStatus,

    
    // UI
    showToast,
    
    // Pagination helpers
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    fetchNextMovements,
    hasNextMovements,
    isFetchingNextMovements,
    
    // Refresh
    refreshAll: async () => {
        const toastId = "inventory-refresh"
        toast.loading(t("toasts.refreshAllLoading"), { id: toastId })
        try {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: queryKeys.stockItemsBase }),
              queryClient.invalidateQueries({ queryKey: queryKeys.stockSummaryBase }),
              queryClient.invalidateQueries({ queryKey: queryKeys.stockMovementsBase }),
              queryClient.invalidateQueries({ queryKey: queryKeys.suppliersBase }),
              queryClient.invalidateQueries({ queryKey: queryKeys.categoriesBase }),
              queryClient.invalidateQueries({ queryKey: queryKeys.stockUnitsBase }),
            ])
            toast.success(t("toasts.refreshAllSuccess"), { id: toastId })
        } catch {
            toast.error(t("toasts.refreshAllError"), { id: toastId })
        }
    }
  }
}
