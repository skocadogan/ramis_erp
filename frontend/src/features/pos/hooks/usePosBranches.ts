"use client"

import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/lib/queryKeys"
import api from "@/lib/api"
import type { Branch } from "@/types/pos"

/**
 * POS şube listesini React Query önbelleğinden okur.
 * Sadece ilk mount'ta fetch eder — sonrasında WS/optimistic update ile güncellenir.
 */
export function usePosBranches() {
  return useQuery<Branch[]>({
    queryKey: queryKeys.posBranchesBase,
    queryFn: async () => {
      const { data } = await api.get("/branches/")
      return data.results || data
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  })
}
