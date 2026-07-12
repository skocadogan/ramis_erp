"use client";

import { useInfiniteQuery } from "@tanstack/react-query"
import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import { FEFOReportListItem } from "@/features/inventory/types"
import { PaginatedResponse } from "@/lib/types"
import { useMemo } from "react"

interface UseFEFOReportProps {
  warehouseId: string | null
  categoryId: string | null
  searchTerm?: string
  enabled: boolean
}

export function useFEFOReport({ warehouseId, categoryId, searchTerm, enabled }: UseFEFOReportProps) {
  const {
    data: pages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch
  } = useInfiniteQuery<PaginatedResponse<FEFOReportListItem>>({
    queryKey: ['fefo-inventory-report', warehouseId, categoryId, searchTerm],
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === "number" ? pageParam : 1
      return inventoryApi.getFEFOInventoryReport({
        page,
        ...(warehouseId && { warehouse_id: warehouseId }),
        ...(categoryId && { category_id: categoryId }),
        ...(searchTerm && { search: searchTerm }),
      })
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.next) return undefined
      const url = new URL(lastPage.next)
      return parseInt(url.searchParams.get('page') || '1')
    },
    initialPageParam: 1,
    enabled: enabled,
  })

  const reportData = useMemo(() => {
    return pages?.pages.flatMap(page => page.results) || []
  }, [pages])

  return {
    reportData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch
  }
}
