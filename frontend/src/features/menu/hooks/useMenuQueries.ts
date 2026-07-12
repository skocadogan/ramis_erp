"use client"

import { useQuery } from "@tanstack/react-query"
import { menuApi } from "@/features/menu/services/menuApi"
import { adminApi } from "@/features/admin/services/adminApi"
import type { Category, MenuCatalogSettings, MenuTag, Product } from "@/features/menu/types"
import type { Branch } from "@/types/user.types"
import { queryKeys } from "@/lib/queryKeys"
import { unwrapList } from "@/lib/api-utils"
import { resolveMediaUrl } from "@/lib/mediaUrl"

function normalizeMenuProduct(product: Product): Product {
  return {
    ...product,
    image: resolveMediaUrl(product.image),
  }
}

/**
 * Tüm menu kategorilerini getirir.
 * `applyTagFilter: false` → backend tag filtresi uygulamaz (yönetim paneli için).
 */
export function useMenuCategories(applyTagFilter = false) {
  return useQuery({
    queryKey: queryKeys.menuCategories({ apply_tag_filter: applyTagFilter }),
    queryFn: async () => {
      const res = await menuApi.getCategories({ apply_tag_filter: applyTagFilter })
      const list = unwrapList<Category>(res)
      return list
    },
    staleTime: 5 * 60_000,
  })
}

/**
 * Tüm menu ürünlerini getirir.
 * `applyTagFilter: false` → backend tag filtresi uygulamaz.
 */
export function useMenuProducts(applyTagFilter = false) {
  return useQuery({
    queryKey: queryKeys.menuProducts({ apply_tag_filter: applyTagFilter }),
    queryFn: async () => {
      const res = await menuApi.getProducts({ apply_tag_filter: applyTagFilter })
      const list = unwrapList<Product>(res)
      return list.map(normalizeMenuProduct)
    },
    staleTime: 5 * 60_000,
  })
}

/**
 * Mutfak istasyonlarını getirir.
 */
export function useMenuStations() {
  return useQuery({
    queryKey: queryKeys.menuStationsBase,
    queryFn: () => adminApi.getStations(),
    staleTime: 5 * 60_000,
  })
}

/**
 * Tüm şubeleri getirir.
 */
export function useMenuBranches() {
  return useQuery({
    queryKey: queryKeys.menuBranchesBase,
    queryFn: () => adminApi.getBranches() as Promise<Branch[]>,
    staleTime: 10 * 60_000,
  })
}

/**
 * Belirli bir şubenin menü etiketlerini getirir.
 * `branchId` null/undefined ise query disabled olur.
 */
export function useMenuTags(branchId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.menuTags(branchId ?? undefined),
    queryFn: async () => {
      if (!branchId) return [] as MenuTag[]
      const res = await menuApi.getMenuTags(branchId)
      const list = unwrapList<MenuTag>(res)
      return list
    },
    staleTime: 5 * 60_000,
    enabled: !!branchId,
  })
}

/**
 * Belirli bir şubenin katalog ayarlarını getirir.
 * `branchId` null/undefined ise query disabled olur.
 */
export function useMenuCatalogSettings(branchId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.menuCatalogSettings(branchId ?? undefined),
    queryFn: async () => {
      if (!branchId) return null
      const res = await menuApi.getCatalogSettings(branchId)
      return res.data as MenuCatalogSettings
    },
    staleTime: 5 * 60_000,
    enabled: !!branchId,
  })
}

/**
 * Menu yönetim sayfasının ihtiyaç duyduğu tüm query'leri tek bir çağrıda toplar.
 * Bileşenlerde kolaylık sağlamak için — her bir query'yi ayrı ayrı da kullanabilirsiniz.
 */
export function useMenuQueries(branchId: string | null | undefined) {
  const categories = useMenuCategories(false)
  const products = useMenuProducts(false)
  const stations = useMenuStations()
  const branches = useMenuBranches()
  const menuTags = useMenuTags(branchId)
  const catalogSettings = useMenuCatalogSettings(branchId)

  const isLoading =
    categories.isLoading ||
    products.isLoading ||
    stations.isLoading ||
    branches.isLoading

  return {
    categories: categories.data ?? [],
    products: products.data ?? [],
    stations: stations.data ?? [],
    branches: branches.data ?? [],
    menuTags: menuTags.data ?? [],
    catalogSettings: catalogSettings.data ?? null,
    isLoading,
    // Ham query referansları (gerektiğinde manuel erişim)
    _queries: { categories, products, stations, branches, menuTags, catalogSettings },
  }
}
