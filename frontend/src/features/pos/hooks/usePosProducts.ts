"use client"

import { useQuery } from "@tanstack/react-query"
import api from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import { resolveMediaUrl } from "@/lib/mediaUrl"
import type { Product } from "@/types/pos"

const MENU_CATALOG_PAGE_SIZE = 500

interface UsePosProductsOptions {
  branchId?: string | null
  enabled?: boolean
}

export function usePosProducts({ branchId, enabled = true }: UsePosProductsOptions = {}) {
  const normalizedId = branchId ?? undefined
  return useQuery<Product[]>({
    queryKey: queryKeys.posProducts(normalizedId),
    queryFn: async () => {
      const { data } = await api.get("/menu/products/", {
        params: {
          branch_id: normalizedId,
          is_active: true,
          show_on_pos: true,
          page_size: MENU_CATALOG_PAGE_SIZE,
        },
      })
      const raw = data.results || data
      return Array.isArray(raw)
        ? raw.map((product: Product) => ({
            ...product,
            image: resolveMediaUrl(product.image),
          }))
        : raw
    },
    enabled: !!normalizedId && enabled,
    staleTime: 5 * 60_000,
  })
}
