"use client"

import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/lib/queryKeys"
import type { Product } from "@/types/pos"
import { fetchAllPosProducts } from "./fetchPosMenuCatalog"

interface UsePosProductsOptions {
  branchId?: string | null
  enabled?: boolean
  refetchInterval?: number | false
  gcTime?: number
}

export function usePosProducts({
  branchId,
  enabled = true,
  refetchInterval,
  gcTime,
}: UsePosProductsOptions = {}) {
  const normalizedId = branchId ?? undefined
  return useQuery<Product[]>({
    queryKey: queryKeys.posProducts(normalizedId),
    queryFn: () => fetchAllPosProducts(normalizedId!),
    enabled: !!normalizedId && enabled,
    staleTime: 5 * 60_000,
    ...(refetchInterval !== undefined ? { refetchInterval } : {}),
    ...(gcTime !== undefined ? { gcTime } : {}),
  })
}
