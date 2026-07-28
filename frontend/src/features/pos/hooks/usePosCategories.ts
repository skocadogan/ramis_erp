"use client"

import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/lib/queryKeys"
import type { Category } from "@/types/pos"
import { fetchAllPosCategories } from "./fetchPosMenuCatalog"

interface UsePosCategoriesOptions {
  branchId?: string | null
  enabled?: boolean
  refetchInterval?: number | false
  gcTime?: number
}

export function usePosCategories({
  branchId,
  enabled = true,
  refetchInterval,
  gcTime,
}: UsePosCategoriesOptions = {}) {
  const normalizedId = branchId ?? undefined
  return useQuery<Category[]>({
    queryKey: queryKeys.posCategories(normalizedId),
    queryFn: () => fetchAllPosCategories(normalizedId!),
    enabled: !!normalizedId && enabled,
    staleTime: 5 * 60_000,
    ...(refetchInterval !== undefined ? { refetchInterval } : {}),
    ...(gcTime !== undefined ? { gcTime } : {}),
  })
}
