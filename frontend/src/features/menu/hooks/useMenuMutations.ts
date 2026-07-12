"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { menuApi } from "@/features/menu/services/menuApi"
import { queryKeys } from "@/lib/queryKeys"

// ---------------------------------------------------------------------------
// Invalidation helpers
// ---------------------------------------------------------------------------

function invalidateMenuCatalog(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.menuCategoriesBase })
  qc.invalidateQueries({ queryKey: queryKeys.menuProductsBase })
}

// ---------------------------------------------------------------------------
// Product mutations
// ---------------------------------------------------------------------------

/** Yeni ürün oluştur. FormData bekler. */
export function useCreateProduct() {
  const qc = useQueryClient()
  const t = useTranslations("menu_management")

  return useMutation({
    mutationFn: (formData: FormData) => menuApi.createProduct(formData),
    onSuccess: () => {
      invalidateMenuCatalog(qc)
    },
    onError: () => {
      toast.error(t("toasts.productCreateFailed"))
    },
  })
}

/** Ürün güncelle. FormData bekler. */
export function useUpdateProduct() {
  const qc = useQueryClient()
  const t = useTranslations("menu_management")

  return useMutation({
    mutationFn: ({ id, formData }: { id: string; formData: FormData }) =>
      menuApi.updateProduct(id, formData),
    onSuccess: () => {
      invalidateMenuCatalog(qc)
    },
    onError: () => {
      toast.error(t("toasts.productUpdateFailed"))
    },
  })
}

/** Ürün sil. */
export function useDeleteProduct() {
  const qc = useQueryClient()
  const t = useTranslations("menu_management")

  return useMutation({
    mutationFn: (id: string) => menuApi.deleteProduct(id),
    onSuccess: () => {
      invalidateMenuCatalog(qc)
    },
    onError: () => {
      toast.error(t("toasts.productDeleteFailed"))
    },
  })
}

/** Ürünün tek bir alanını yama (toggle'lar için). */
export function usePatchProduct() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      menuApi.patchProduct(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menuProductsBase })
    },
  })
}

/** Ürün kopyala. */
export function useCopyProduct() {
  const qc = useQueryClient()
  const t = useTranslations("menu_management")

  return useMutation({
    mutationFn: (id: string) => menuApi.copyProduct(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menuProductsBase })
    },
    onError: () => {
      toast.error(t("toasts.productCopyFailed"))
    },
  })
}

/** Ürün sıralamasını güncelle. */
export function useReorderProducts() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (order_ids: string[]) => menuApi.reorderProducts(order_ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menuProductsBase })
    },
  })
}

/** Ürünlere toplu iskonto uygula. */
export function useBulkDiscount() {
  const qc = useQueryClient()
  const t = useTranslations("menu_management")

  return useMutation({
    mutationFn: ({
      product_ids,
      discount_rate,
      branch_id,
    }: {
      product_ids: string[]
      discount_rate: number
      branch_id: string | null
    }) => menuApi.bulkDiscount(product_ids, discount_rate, branch_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menuProductsBase })
    },
    onError: () => {
      toast.error(t("toasts.discountError"))
    },
  })
}

/** Ürünlere toplu fiyat güncellemesi uygula. */
export function useBulkPriceUpdate() {
  const qc = useQueryClient()
  const t = useTranslations("menu_management")

  return useMutation({
    mutationFn: ({
      product_ids,
      branch_id,
      change_type,
      value,
    }: {
      product_ids: string[]
      branch_id: string | null
      change_type: string
      value: number
    }) => menuApi.bulkPriceUpdate(product_ids, branch_id, change_type, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menuProductsBase })
    },
    onError: () => {
      toast.error(t("toasts.bulkPriceError"))
    },
  })
}

/** Ürüne modifier group ataması yap. (Create sonrası kullanılır.) */
export function useSetProductModifierGroups() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({
      productId,
      groupIds,
    }: {
      productId: string
      groupIds: string[]
    }) => menuApi.setProductModifierGroups(productId, groupIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menuProductsBase })
    },
  })
}

// ---------------------------------------------------------------------------
// Category mutations
// ---------------------------------------------------------------------------

/** Yeni kategori oluştur. */
export function useCreateCategory() {
  const qc = useQueryClient()
  const t = useTranslations("menu_management")

  return useMutation({
    mutationFn: (data: unknown) => menuApi.createCategory(data),
    onSuccess: () => {
      invalidateMenuCatalog(qc)
    },
    onError: () => {
      toast.error(t("toasts.categoryCreateFailed"))
    },
  })
}

/** Kategori güncelle. */
export function useUpdateCategory() {
  const qc = useQueryClient()
  const t = useTranslations("menu_management")

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) =>
      menuApi.updateCategory(id, data),
    onSuccess: () => {
      invalidateMenuCatalog(qc)
    },
    onError: () => {
      toast.error(t("toasts.categoryUpdateFailed"))
    },
  })
}

/** Kategori sil. */
export function useDeleteCategory() {
  const qc = useQueryClient()
  const t = useTranslations("menu_management")

  return useMutation({
    mutationFn: (id: string) => menuApi.deleteCategory(id),
    onSuccess: () => {
      invalidateMenuCatalog(qc)
    },
    onError: () => {
      toast.error(t("toasts.categoryDeleteFailed"))
    },
  })
}

/** Kategori sıralamasını güncelle. */
export function useReorderCategories() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (order_ids: string[]) => menuApi.reorderCategories(order_ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menuCategoriesBase })
    },
  })
}

// ---------------------------------------------------------------------------
// Tag / Catalog mutations
// ---------------------------------------------------------------------------

/** Katalog tag aktivasyonu yap. */
export function useActivateCatalogTag() {
  const qc = useQueryClient()
  const t = useTranslations("menu_management")

  return useMutation({
    mutationFn: (payload: {
      branch_id: string
      tag_id?: string | null
      filter_untagged?: boolean
    }) => menuApi.activateCatalogTag(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menuCatalogSettingsBase })
      invalidateMenuCatalog(qc)
      toast.success(t("toasts.tagActivated"))
    },
    onError: () => {
      toast.error(t("toasts.tagActivateFailed"))
    },
  })
}

// ---------------------------------------------------------------------------
// Modifier Group mutations (yeni hook'lar)
// ---------------------------------------------------------------------------

export function useCreateModifierGroup() {
  const qc = useQueryClient()
  const t = useTranslations("menu_management.modifierGroups")

  return useMutation({
    mutationFn: (data: unknown) => menuApi.createModifierGroup(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menuProductsBase })
    },
    onError: () => {
      toast.error(t("toasts.groupSaveFailed"))
    },
  })
}

export function useUpdateModifierGroup() {
  const qc = useQueryClient()
  const t = useTranslations("menu_management.modifierGroups")

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) =>
      menuApi.updateModifierGroup(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menuProductsBase })
    },
    onError: () => {
      toast.error(t("toasts.groupSaveFailed"))
    },
  })
}

export function useDeleteModifierGroup() {
  const qc = useQueryClient()
  const t = useTranslations("menu_management.modifierGroups")

  return useMutation({
    mutationFn: (id: string) => menuApi.deleteModifierGroup(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menuProductsBase })
    },
    onError: () => {
      toast.error(t("toasts.groupDeleteFailed"))
    },
  })
}

export function useCreateModifier() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (data: unknown) => menuApi.createModifier(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menuProductsBase })
    },
  })
}

export function useDeleteModifier() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => menuApi.deleteModifier(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menuProductsBase })
    },
  })
}
