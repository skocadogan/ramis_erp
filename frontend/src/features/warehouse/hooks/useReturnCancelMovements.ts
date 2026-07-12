"use client"

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { useMemo } from "react"
import { useDebounce } from "@/hooks/useDebounce"
import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import type { StockMovement } from "@/features/inventory/types"

const PAGE_SIZE = 50

export type ReturnCancelFilters = {
  branchId?: string
  startDate: string
  endDate: string
  movementType: "ALL" | "RETURN" | "CANCEL"
  reasonCode: string
  supplierId: string
  search: string
}

export function useReturnCancelMovements(filters: ReturnCancelFilters) {
  const debouncedSearch = useDebounce(filters.search, 500)

  const query = useInfiniteQuery({
    queryKey: [
      "returnCancelMovements",
      filters.branchId,
      filters.startDate,
      filters.endDate,
      filters.movementType,
      filters.reasonCode,
      filters.supplierId,
      debouncedSearch,
    ],
    queryFn: async ({ pageParam = 1 }) => {
      const params: Record<string, string | number> = {
        page: pageParam,
        page_size: PAGE_SIZE,
        movement_types: "RETURN,CANCEL",
        start_date: filters.startDate,
        end_date: filters.endDate,
      }
      if (filters.branchId) params.warehouse_id = filters.branchId
      if (filters.movementType !== "ALL") params.movement_type = filters.movementType
      if (filters.reasonCode) params.reason_code = filters.reasonCode
      if (filters.supplierId) params.supplier_id = filters.supplierId
      if (debouncedSearch) params.search = debouncedSearch
      return inventoryApi.getStockMovements(params)
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.next) return undefined
      const url = new URL(lastPage.next)
      return Number(url.searchParams.get("page"))
    },
    initialPageParam: 1,
    refetchOnMount: "always",
  })

  const movements = useMemo(
    () => query.data?.pages.flatMap((p) => p.results) ?? [],
    [query.data?.pages],
  )

  return { ...query, movements }
}

export function useReturnCancelReasonCodes() {
  return useQuery({
    queryKey: ["returnCancelReasonCodes"],
    queryFn: () => inventoryApi.getReturnCancelReasonCodes(),
  })
}

export function useDeleteReturnCancelMovement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => inventoryApi.deleteStockMovement(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["returnCancelMovements"] })
    },
  })
}

export function useCreateReturnCancelMovement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => inventoryApi.createStockMovement(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["returnCancelMovements"] })
    },
  })
}

export function summarizeReturnCancelRows(rows: StockMovement[]) {
  const totalQty = rows.reduce((acc, row) => acc + (row.quantity || 0), 0)
  const totalAmount = rows.reduce(
    (acc, row) => acc + (row.quantity || 0) * (row.unit_price || 0),
    0,
  )
  return { totalQty, totalAmount }
}

export function defaultReturnCancelDateRange() {
  const today = new Date()
  return {
    startDate: format(today, "yyyy-MM-dd"),
    endDate: format(today, "yyyy-MM-dd"),
  }
}
