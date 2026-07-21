"use client"

import { useQuery, type UseQueryOptions } from "@tanstack/react-query"
import { queryKeys } from "@/lib/queryKeys"
import api from "@/lib/api"
import type { Table, Zone } from "@/types/pos"
import { mergePosTablesWithTakeawayVirtual } from "@/features/pos/lib/mergePosTablesWithTakeawayVirtual"

export type PosTablesVariant = "pos" | "waiter"

/**
 * POS masa listesini React Query önbelleğinden okur.
 *
 * **Sadece ilk mount'ta fetch eder** — sonrasında `TableSync` (WS)
 * ve `usePosMutations` (optimistic update) `setQueryData` ile günceller.
 * `staleTime: Infinity` ile otomatik refetch tamamen kapalıdır;
 * bu sayede POS ekranında titreme olmaz.
 */
export function usePosTables<TData = Table[]>(
  branchId?: string,
  variant: PosTablesVariant = "pos",
  options?: Pick<UseQueryOptions<Table[], Error, TData>, "select" | "enabled">,
) {
  const scopeParams =
    variant === "waiter" && branchId
      ? { branch_id: branchId, scope: "waiter" as const }
      : { branch_id: branchId }

  return useQuery<Table[], Error, TData>({
    queryKey: queryKeys.posTables(branchId, variant),
    queryFn: async () => {
      const [tablesRes, virtRes, zonesRes] = await Promise.all([
        api.get("/tables/", { params: scopeParams }),
        api.get("/tables/takeaway_virtual/", { params: scopeParams }),
        api.get("/zones/", { params: { branch_id: branchId } }),
      ])

      const tables: Table[] = tablesRes.data.results || tablesRes.data || []
      const virt: Table[] = Array.isArray(virtRes.data) ? virtRes.data : []
      const rawZones: Zone[] = zonesRes.data.results || zonesRes.data || []
      const zones = Array.isArray(rawZones) ? rawZones.filter((z: Zone) => z.is_active) : []

      return mergePosTablesWithTakeawayVirtual(tables, virt, zones)
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    enabled: options?.enabled,
    select: options?.select,
  })
}

/**
 * POS zone listesini React Query önbelleğinden okur.
 *
 * `usePosTables` gibi sadece ilk mount'ta fetch eder.
 * `enabled` kontrolü orijinal usePosDataSync.zonesQuery ile aynıdır.
 */
export function usePosZones(options: { branchId?: string; enabled?: boolean } = {}) {
  const { branchId, enabled = true } = options
  return useQuery<Zone[]>({
    queryKey: queryKeys.posZones(branchId),
    queryFn: async () => {
      const { data } = await api.get("/zones/", {
        params: { branch_id: branchId },
      })
      const results = data.results || data
      return Array.isArray(results) ? results.filter((z: Zone) => z.is_active) : []
    },
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  })
}
