"use client"

import { useQuery } from "@tanstack/react-query"
import api from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import type { Category } from "@/types/pos"

const MENU_CATALOG_PAGE_SIZE = 500

interface UsePosCategoriesOptions {
  branchId?: string | null
  enabled?: boolean
}

export function usePosCategories({ branchId, enabled = true }: UsePosCategoriesOptions = {}) {
  const normalizedId = branchId ?? undefined
  return useQuery<Category[]>({
    queryKey: queryKeys.posCategories(normalizedId),
    queryFn: async () => {
      const { data } = await api.get("/menu/categories/", {
        params: { branch_id: normalizedId, page_size: MENU_CATALOG_PAGE_SIZE },
      })
      return data.results || data
    },
    enabled: !!normalizedId && enabled,
    staleTime: 5 * 60_000,
  })
}
