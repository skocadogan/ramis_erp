"use client"
import { useState, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { useQueryClient } from "@tanstack/react-query"

import { Loader2 } from "lucide-react"
import { AppShell } from "@/components/shell/AppShell"
import {
  useMenuCategories,
  useMenuProducts,
  useMenuStations,
  useMenuBranches,
  useMenuTags,
  useMenuCatalogSettings,
} from "@/features/menu/hooks/useMenuQueries"
import {
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  usePatchProduct,
  useCopyProduct,
  useReorderProducts,
  useBulkDiscount,
  useSetProductModifierGroups,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useActivateCatalogTag,
} from "@/features/menu/hooks/useMenuMutations"
import { useModifierGroups } from "@/features/menu/hooks/useModifierGroups"
import { useMenuTagsManagement } from "@/features/menu/hooks/useMenuTagsManagement"
import { useBulkPrice } from "@/features/menu/hooks/useBulkPrice"
import { useDiscount } from "@/features/menu/hooks/useDiscount"
import type { Category, Product, ProductForm, CategoryForm } from "@/features/menu/types"
import { getDescendantIds } from "@/features/menu/lib/categoryTree"
import {
  categoryVisibleInPanel,
  effectiveMenuActive,
  isTagFilterActive,
  filterTagIdsForBranch,
  mergeTagIdsForBranch,
  NO_TAG_FILTER_VALUE,
  productMatchesActiveTag,
  UNTAGGED_FILTER_VALUE,
} from "@/features/menu/lib/menuTagFilter"
import { queryKeys } from "@/lib/queryKeys"
import CategoryPanel from "@/features/menu/components/CategoryPanel"
import ProductTable from "@/features/menu/components/ProductTable"
import ModifierGroupsPanel from "@/features/menu/components/ModifierGroupsPanel"
import MenuTagsPanel from "@/features/menu/components/MenuTagsPanel"
import { ModifierGroupFormModal } from "@/features/menu/components/ModifierGroupFormModal"
import { MenuTagFormModal } from "@/features/menu/components/MenuTagFormModal"
import ProductFormModal from "@/features/menu/components/ProductFormModal"
import CategoryFormModal from "@/features/menu/components/CategoryFormModal"
import BulkPriceModal from "@/features/menu/components/BulkPriceModal"
import DiscountModal from "@/features/menu/components/DiscountModal"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { useModulePermissions } from "@/hooks/useModulePermissions"
import { useAuthStore } from "@/store/useAuthStore"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// ---------------------------------------------------------------------------
// Form sabitleri
// ---------------------------------------------------------------------------

const EMPTY_PRODUCT_FORM: ProductForm = {
  category: "",
  name: "",
  base_price: "",
  gross_price: "",
  tax_rate: "10",
  description: "",
  is_active: true,
  show_on_pos: true,
  is_show_on_menu: true,
  is_featured: false,
  is_combined: false,
  image: null,
  order: 0,
  calories: null,
  units: [],
  combined_items: [],
  branches: [],
  modifier_group_ids: [],
  tag_ids: [],
}

const EMPTY_CATEGORY_FORM: CategoryForm = {
  name: "", description: "", parent: null, order: 0, color: "#3b82f6", is_active: true, station: null,
  tag_ids: [],
}

// ---------------------------------------------------------------------------
// Bileşen
// ---------------------------------------------------------------------------

function MenuManagementPageContent() {
  const t = useTranslations("menu_management")
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<'regular' | 'combined' | 'modifiers' | 'menuTags'>('regular')
  const user = useAuthStore((s) => s.user)

  // -----------------------------------------------------------------------
  // UI State (formlar, diyaloglar, seçimler) — hook'lardan ÖNCE tanımlanmalı
  // -----------------------------------------------------------------------
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(() => {
    if (user?.branch_id) return user.branch_id
    if (user?.available_branches && user.available_branches.length > 0) return user.available_branches[0].id
    return null
  })
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showAllProducts, setShowAllProducts] = useState(false)

  // Kategori / ürün form state'leri
  const [showProductForm, setShowProductForm] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [productForm, setProductForm] = useState<ProductForm>(EMPTY_PRODUCT_FORM)
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(EMPTY_CATEGORY_FORM)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Silme state'leri
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Tag aktivasyon state'leri
  const [pendingTagActivation, setPendingTagActivation] = useState<string | null>(null)
  const [isActivatingTag, setIsActivatingTag] = useState(false)

  // -----------------------------------------------------------------------
  // Query hooks (bağımsız hook'lar — paralel çalışır)
  // selectedBranchId null ise tags/settings query'leri disabled olur (enabled: !!branchId)
  // -----------------------------------------------------------------------
  const categoriesQuery = useMenuCategories(false)
  const productsQuery = useMenuProducts(false)
  const stationsQuery = useMenuStations()
  const branchesQuery = useMenuBranches()
  const menuTagsQuery = useMenuTags(selectedBranchId)
  const catalogSettingsQuery = useMenuCatalogSettings(selectedBranchId)

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data])
  const stations = useMemo(() => stationsQuery.data ?? [], [stationsQuery.data])
  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data])
  const activeMenuTags = useMemo(() => menuTagsQuery.data ?? [], [menuTagsQuery.data])
  const activeCatalogSettings = useMemo(() => catalogSettingsQuery.data ?? null, [catalogSettingsQuery.data])

  const isLoading =
    categoriesQuery.isLoading ||
    productsQuery.isLoading ||
    stationsQuery.isLoading ||
    branchesQuery.isLoading

  // -----------------------------------------------------------------------
  // Yetkilendirme
  // -----------------------------------------------------------------------
  const { canManage } = useModulePermissions()
  const canManageCategory = canManage("menu.manage_category")
  const canManageProduct = canManage("menu.manage_product")
  const canManageModifierGroup = canManage("menu.manage_modifier_group")
  const canManageMenuTags = canManage("menu.manage_product")

  // -----------------------------------------------------------------------
  // Mutation hooks
  // -----------------------------------------------------------------------
  const createProductMut = useCreateProduct()
  const updateProductMut = useUpdateProduct()
  const deleteProductMut = useDeleteProduct()
  const patchProductMut = usePatchProduct()
  const copyProductMut = useCopyProduct()
  const reorderProductsMut = useReorderProducts()
  const bulkDiscountMut = useBulkDiscount()
  const setProductModifierGroupsMut = useSetProductModifierGroups()
  const createCategoryMut = useCreateCategory()
  const updateCategoryMut = useUpdateCategory()
  const deleteCategoryMut = useDeleteCategory()
  const activateCatalogTagMut = useActivateCatalogTag()

  // -----------------------------------------------------------------------
  // Eski hook'lar (adaptör olarak — sonra kaldırılacak)
  // -----------------------------------------------------------------------
  const refreshMenuData = useCallback(() => {
    qc.invalidateQueries({ queryKey: queryKeys.menuCategoriesBase })
    qc.invalidateQueries({ queryKey: queryKeys.menuProductsBase })
    qc.invalidateQueries({ queryKey: queryKeys.menuTagsBase })
    qc.invalidateQueries({ queryKey: queryKeys.menuCatalogSettingsBase })
  }, [qc])

  const modifiers = useModifierGroups(refreshMenuData)
  const menuTagsMgmt = useMenuTagsManagement(
    selectedBranchId,
    refreshMenuData,
  )

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------
  const tagFilterActive = isTagFilterActive(activeCatalogSettings, activeMenuTags, selectedBranchId)

  const tagScopedProducts = useMemo(() => {
    if (!tagFilterActive || showAllProducts) return products
    return products.filter((p) =>
      productMatchesActiveTag(p, activeCatalogSettings, categories, activeMenuTags, selectedBranchId),
    )
  }, [products, tagFilterActive, showAllProducts, activeCatalogSettings, categories, activeMenuTags, selectedBranchId])

  const filteredProducts = useMemo(() => {
    return tagScopedProducts.filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase())
      const matchCategory =
        !selectedCategory ||
        p.category === selectedCategory ||
        getDescendantIds(categories, selectedCategory).includes(p.category)
      return matchSearch && matchCategory
    })
  }, [tagScopedProducts, searchTerm, selectedCategory, categories])

  const panelCategories = useMemo(() => {
    return categories.filter((cat) =>
      categoryVisibleInPanel(cat, products, activeCatalogSettings, categories, activeMenuTags, showAllProducts, selectedBranchId),
    )
  }, [categories, products, activeCatalogSettings, activeMenuTags, showAllProducts, selectedBranchId])

  const panelProducts = showAllProducts || !tagFilterActive ? products : tagScopedProducts

  // -----------------------------------------------------------------------
  // Mutation handlers (product)
  // -----------------------------------------------------------------------

  const handleCreateProduct = useCallback(async () => {
    setIsSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('category', productForm.category)
      formData.append('name', productForm.name)
      formData.append('base_price', productForm.base_price)
      formData.append('gross_price', productForm.gross_price)
      formData.append('tax_rate', productForm.tax_rate)
      formData.append('description', productForm.description)
      formData.append('is_active', String(productForm.is_active))
      formData.append('show_on_pos', String(productForm.show_on_pos))
      formData.append('is_show_on_menu', String(productForm.is_show_on_menu))
      formData.append('is_featured', String(productForm.is_featured))
      formData.append('is_combined', String(productForm.is_combined))
      formData.append('order', String(productForm.order))
      formData.append('calories', productForm.calories != null ? String(productForm.calories) : '')
      if (productForm.image instanceof File) {
        formData.append('image', productForm.image)
      }
      formData.append('units', JSON.stringify(productForm.units))
      formData.append('combined_items', JSON.stringify(productForm.combined_items))
      formData.append('branches', JSON.stringify(productForm.branches))
      formData.append('tag_ids', JSON.stringify(productForm.tag_ids))

      const createRes = await createProductMut.mutateAsync(formData)
      const createdId = createRes?.data?.id as string | undefined
      if (createdId && productForm.modifier_group_ids.length > 0) {
        await setProductModifierGroupsMut.mutateAsync({
          productId: createdId,
          groupIds: productForm.modifier_group_ids,
        })
      }
      setShowProductForm(false)
      setProductForm(EMPTY_PRODUCT_FORM)
    } catch {
      // toast zaten mutation hook'unda
    } finally {
      setIsSubmitting(false)
    }
  }, [productForm, createProductMut, setProductModifierGroupsMut])

  const handleUpdateProduct = useCallback(async () => {
    if (!editingProduct) return
    setIsSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('category', productForm.category)
      formData.append('name', productForm.name)
      formData.append('base_price', productForm.base_price)
      formData.append('gross_price', productForm.gross_price)
      formData.append('tax_rate', productForm.tax_rate)
      formData.append('description', productForm.description)
      formData.append('is_active', String(productForm.is_active))
      formData.append('show_on_pos', String(productForm.show_on_pos))
      formData.append('is_show_on_menu', String(productForm.is_show_on_menu))
      formData.append('is_featured', String(productForm.is_featured))
      formData.append('is_combined', String(productForm.is_combined))
      formData.append('order', String(productForm.order))
      formData.append('calories', productForm.calories != null ? String(productForm.calories) : '')

      if (productForm.image instanceof File) {
        formData.append('image', productForm.image)
      } else if (productForm.image === null && editingProduct.image) {
        formData.append('image', '')
      }
      formData.append('units', JSON.stringify(productForm.units))
      formData.append('combined_items', JSON.stringify(productForm.combined_items))
      formData.append('branches', JSON.stringify(productForm.branches))
      const mergedProductTagIds = mergeTagIdsForBranch(
        editingProduct.tags ?? [],
        activeMenuTags,
        productForm.tag_ids,
      )
      formData.append('tag_ids', JSON.stringify(mergedProductTagIds))

      await updateProductMut.mutateAsync({ id: editingProduct.id, formData })
      await setProductModifierGroupsMut.mutateAsync({
        productId: editingProduct.id,
        groupIds: productForm.modifier_group_ids,
      })
      setEditingProduct(null)
      setProductForm(EMPTY_PRODUCT_FORM)
    } catch {
      // toast zaten mutation hook'unda
    } finally {
      setIsSubmitting(false)
    }
  }, [editingProduct, productForm, updateProductMut, setProductModifierGroupsMut, activeMenuTags])

  const handleDeleteProduct = useCallback((product: Product) => {
    setProductToDelete(product)
  }, [])

  const confirmDeleteProduct = useCallback(async () => {
    if (!productToDelete) return
    setIsDeleting(true)
    try {
      await deleteProductMut.mutateAsync(productToDelete.id)
      setProductToDelete(null)
    } catch {
      // toast zaten mutation hook'unda
    } finally {
      setIsDeleting(false)
    }
  }, [productToDelete, deleteProductMut])

  const handleToggleProductActive = useCallback((product: Product) => {
    patchProductMut.mutate({ id: product.id, data: { is_active: !product.is_active } })
  }, [patchProductMut])

  const handleToggleProductPos = useCallback((product: Product) => {
    patchProductMut.mutate({ id: product.id, data: { show_on_pos: !product.show_on_pos } })
  }, [patchProductMut])

  const handleToggleProductFeatured = useCallback((product: Product) => {
    patchProductMut.mutate({ id: product.id, data: { is_featured: !product.is_featured } })
  }, [patchProductMut])

  const handleToggleProductPopular = useCallback((product: Product) => {
    patchProductMut.mutate({ id: product.id, data: { is_popular: !product.is_popular } })
  }, [patchProductMut])

  const handleToggleProductChefRecommendation = useCallback((product: Product) => {
    patchProductMut.mutate({ id: product.id, data: { is_chef_recommendation: !product.is_chef_recommendation } })
  }, [patchProductMut])

  const handleCopyProduct = useCallback((product: Product) => {
    copyProductMut.mutate(product.id)
  }, [copyProductMut])

  const handleRemoveProductDiscount = useCallback((product: Product) => {
    bulkDiscountMut.mutate({ product_ids: [product.id], discount_rate: 0, branch_id: null })
  }, [bulkDiscountMut])

  const handleReorderProduct = useCallback((order_ids: string[]) => {
    reorderProductsMut.mutate(order_ids)
  }, [reorderProductsMut])

  // -----------------------------------------------------------------------
  // Mutation handlers (category)
  // -----------------------------------------------------------------------

  const handleCreateCategory = useCallback(async () => {
    setIsSubmitting(true)
    try {
      await createCategoryMut.mutateAsync(categoryForm)
      setShowCategoryForm(false)
      setCategoryForm(EMPTY_CATEGORY_FORM)
    } catch {
      // toast zaten mutation hook'unda
    } finally {
      setIsSubmitting(false)
    }
  }, [categoryForm, createCategoryMut])

  const handleUpdateCategory = useCallback(async () => {
    if (!editingCategory) return
    setIsSubmitting(true)
    try {
      const mergedTagIds = mergeTagIdsForBranch(
        editingCategory.tags ?? [],
        activeMenuTags,
        categoryForm.tag_ids,
      )
      await updateCategoryMut.mutateAsync({ id: editingCategory.id, data: { ...categoryForm, tag_ids: mergedTagIds } })
      setEditingCategory(null)
      setCategoryForm(EMPTY_CATEGORY_FORM)
    } catch {
      // toast zaten mutation hook'unda
    } finally {
      setIsSubmitting(false)
    }
  }, [editingCategory, categoryForm, updateCategoryMut, activeMenuTags])

  const handleDeleteCategory = useCallback((category: Category) => {
    setCategoryToDelete(category)
  }, [])

  const confirmDeleteCategory = useCallback(async () => {
    if (!categoryToDelete) return
    setIsDeleting(true)
    try {
      await deleteCategoryMut.mutateAsync(categoryToDelete.id)
      if (selectedCategory === categoryToDelete.id) setSelectedCategory(null)
      setCategoryToDelete(null)
    } catch {
      // toast zaten mutation hook'unda
    } finally {
      setIsDeleting(false)
    }
  }, [categoryToDelete, deleteCategoryMut, selectedCategory])

  // -----------------------------------------------------------------------
  // Tag activation handlers
  // -----------------------------------------------------------------------

  const requestTagActivation = useCallback((value: string) => {
    const current = activeCatalogSettings?.filter_untagged
      ? UNTAGGED_FILTER_VALUE
      : activeCatalogSettings?.active_tag_id ?? NO_TAG_FILTER_VALUE
    if (value === current) return
    setPendingTagActivation(value)
  }, [activeCatalogSettings])

  const confirmTagActivation = useCallback(async () => {
    if (pendingTagActivation === null || !selectedBranchId) return
    setIsActivatingTag(true)
    try {
      const payload: { branch_id: string; tag_id?: string | null; filter_untagged?: boolean } = {
        branch_id: selectedBranchId,
      }
      if (pendingTagActivation === UNTAGGED_FILTER_VALUE) {
        payload.filter_untagged = true
      } else if (pendingTagActivation !== NO_TAG_FILTER_VALUE) {
        payload.tag_id = pendingTagActivation
      }
      await activateCatalogTagMut.mutateAsync(payload)
      setPendingTagActivation(null)
    } catch {
      // toast zaten mutation hook'unda
    } finally {
      setIsActivatingTag(false)
    }
  }, [pendingTagActivation, selectedBranchId, activateCatalogTagMut])

  const cancelTagActivation = useCallback(() => setPendingTagActivation(null), [])

  // -----------------------------------------------------------------------
  // Edit handlers
  // -----------------------------------------------------------------------

  const openEditProduct = useCallback((product: Product) => {
    setEditingProduct(product)
    const norm2 = (v: unknown): string => {
      const s = String(v ?? "").trim().replace(",", ".")
      if (!s) return ""
      const n = parseFloat(s)
      if (!Number.isFinite(n)) return s
      return n.toFixed(2)
    }
    const bpNorm = norm2(product.base_price)
    const hasGross = product.gross_price != null && String(product.gross_price).trim() !== ""
    const grossNorm = hasGross ? norm2(product.gross_price) : bpNorm
    const taxNorm =
      product.tax_rate != null && String(product.tax_rate).trim() !== ""
        ? norm2(product.tax_rate)
        : "0.00"
    setProductForm({
      category: product.category != null ? String(product.category) : "",
      name: product.name,
      base_price: bpNorm,
      gross_price: grossNorm,
      tax_rate: taxNorm,
      description: product.description ?? "",
      is_active: product.is_active,
      show_on_pos: product.show_on_pos !== false,
      is_show_on_menu: product.is_show_on_menu !== false,
      is_featured: product.is_featured === true,
      is_combined: product.is_combined === true,
      image: product.image,
      order: product.order,
      calories: product.calories ?? null,
      units: product.units || [],
      combined_items: product.combined_items || [],
      branches: product.branches || [],
      modifier_group_ids: (product.modifier_groups ?? []).map((g) => g.id),
      tag_ids: filterTagIdsForBranch(
        (product.tags ?? []).map((t) => t.id),
        activeMenuTags,
      ),
    })
  }, [activeMenuTags])

  const openEditCategory = useCallback((category: Category) => {
    setEditingCategory(category)
    setCategoryForm({
      name: category.name,
      description: category.description ?? "",
      parent: category.parent ?? null,
      order: category.order,
      color: category.color || "#3b82f6",
      is_active: category.is_active,
      station: category.station ?? null,
      tag_ids: filterTagIdsForBranch(
        (category.tags ?? []).map((t) => t.id),
        activeMenuTags,
      ),
    })
  }, [activeMenuTags])

  const openAddSubcategory = useCallback((parent: Category) => {
    setCategoryForm({ ...EMPTY_CATEGORY_FORM, parent: parent.id })
    setShowCategoryForm(true)
  }, [])

  const openCreateProduct = useCallback(() => {
    let defaultBranches: string[] = []
    if (user?.branch_id) {
      defaultBranches = [user.branch_id]
    } else if (user?.available_branches && user.available_branches.length > 0) {
      defaultBranches = user.available_branches.map(b => b.id)
    } else if (branches && branches.length > 0) {
      defaultBranches = branches.map(b => b.id)
    }

    setProductForm({
      ...EMPTY_PRODUCT_FORM,
      category: selectedCategory ?? "",
      branches: defaultBranches,
    })
    setShowProductForm(true)
  }, [user, branches, selectedCategory])

  // -----------------------------------------------------------------------
  // Bulk price & discount hooks (eski API'ye adapte)
  // -----------------------------------------------------------------------
  const bulk = useBulkPrice(tagScopedProducts, refreshMenuData)
  const discount = useDiscount(tagScopedProducts, refreshMenuData)

  // effectiveMenuActive callback
  const getEffectiveMenuActive = useCallback(
    (product: Product) =>
      effectiveMenuActive(product, activeCatalogSettings, categories, activeMenuTags, selectedBranchId),
    [activeCatalogSettings, categories, activeMenuTags, selectedBranchId],
  )

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------
  if (isLoading) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="text-sm text-muted-foreground">{t("page.loading")}</span>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col bg-slate-50 overflow-hidden dark:bg-slate-950">
        <div className="flex items-center gap-1 border-b border-border bg-white px-4 dark:bg-slate-900 dark:border-slate-700 shrink-0">
          <button
            onClick={() => setActiveTab('regular')}
            className={`px-4 py-3 text-sm font-ui-medium border-b-2 transition-colors ${
              activeTab === 'regular'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-muted-foreground hover:text-slate-700 dark:text-muted-foreground dark:hover:text-slate-200'
            }`}
          >
            {t("page.tabs.regular")}
          </button>
          <button
            onClick={() => setActiveTab('combined')}
            className={`px-4 py-3 text-sm font-ui-medium border-b-2 transition-colors ${
              activeTab === 'combined'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-muted-foreground hover:text-slate-700 dark:text-muted-foreground dark:hover:text-slate-200'
            }`}
          >
            {t("page.tabs.combined")}
          </button>
          <button
            onClick={() => setActiveTab('modifiers')}
            className={`px-4 py-3 text-sm font-ui-medium border-b-2 transition-colors ${
              activeTab === 'modifiers'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-muted-foreground hover:text-slate-700 dark:text-muted-foreground dark:hover:text-slate-200'
            }`}
          >
            {t("page.tabs.modifiers")}
          </button>
          <button
            onClick={() => setActiveTab('menuTags')}
            className={`px-4 py-3 text-sm font-ui-medium border-b-2 transition-colors ${
              activeTab === 'menuTags'
                ? 'border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-400'
                : 'border-transparent text-muted-foreground hover:text-slate-700 dark:text-muted-foreground dark:hover:text-slate-200'
            }`}
          >
            {t("page.tabs.menuTags")}
          </button>
        </div>

        <main className="flex flex-1 overflow-hidden p-4 gap-4">
          {activeTab === 'modifiers' ? (
            <ModifierGroupsPanel
              groups={modifiers.groups}
              selectedGroupId={modifiers.selectedGroupId}
              canManage={canManageModifierGroup}
              isSubmitting={modifiers.isSubmitting}
              modifierForm={modifiers.modifierForm}
              onSelectGroup={modifiers.setSelectedGroupId}
              onAddGroup={modifiers.openCreateGroup}
              onEditGroup={modifiers.openEditGroup}
              onDeleteGroup={modifiers.handleDeleteGroup}
              onModifierFormChange={(patch) => modifiers.setModifierForm({ ...modifiers.modifierForm, ...patch })}
              onAddModifier={modifiers.handleAddModifier}
              onDeleteModifier={modifiers.handleDeleteModifier}
            />
          ) : activeTab === 'menuTags' ? (
            <MenuTagsPanel
              tags={menuTagsMgmt.tags}
              branches={branches}
              branchId={selectedBranchId}
              selectedTagId={menuTagsMgmt.selectedTagId}
              isLoading={menuTagsMgmt.isLoading}
              canManage={canManageMenuTags}
              isSubmitting={menuTagsMgmt.isSubmitting}
              onBranchChange={setSelectedBranchId}
              onSelectTag={menuTagsMgmt.setSelectedTagId}
              onAddTag={menuTagsMgmt.openCreateTag}
              onEditTag={menuTagsMgmt.openEditTag}
              onDeleteTag={menuTagsMgmt.handleDeleteTag}
            />
          ) : (
          <>
          <CategoryPanel
            categories={categories}
            products={panelProducts}
            visibleCategoryIds={new Set(panelCategories.map((c) => c.id))}
            tagBranchId={selectedBranchId}
            selectedCategory={selectedCategory}
            canManage={canManageCategory}
            onSelect={setSelectedCategory}
            onAdd={() => setShowCategoryForm(true)}
            onEdit={openEditCategory}
            onDelete={handleDeleteCategory}
            onAddSubcategory={openAddSubcategory}
          />
          <ProductTable
            products={filteredProducts}
            searchTerm={searchTerm}
            canManage={canManageProduct}
            onSearchChange={setSearchTerm}
            onAdd={openCreateProduct}
            onEdit={openEditProduct}
            onDelete={handleDeleteProduct}
            onToggleActive={handleToggleProductActive}
            onTogglePos={handleToggleProductPos}
            onToggleFeatured={handleToggleProductFeatured}
            onTogglePopular={handleToggleProductPopular}
            onToggleChefRecommendation={handleToggleProductChefRecommendation}
            onBulkPrice={() => bulk.setShowBulkPriceModal(true)}
            onDiscount={() => discount.setShowDiscountModal(true)}
            onReorder={handleReorderProduct}
            onCopy={handleCopyProduct}
            onRemoveDiscount={handleRemoveProductDiscount}
            isCombinedTab={activeTab === 'combined'}
            menuTags={activeMenuTags}
            catalogSettings={activeCatalogSettings}
            onTagFilterSelect={requestTagActivation}
            showAllProducts={showAllProducts}
            onShowAllChange={setShowAllProducts}
            tagFilterActive={tagFilterActive}
            getEffectiveMenuActive={getEffectiveMenuActive}
            branches={branches}
            selectedBranchId={selectedBranchId}
            onBranchChange={setSelectedBranchId}
          />
          </>
          )}
        </main>
      </div>

      {canManageProduct && showProductForm && (
        <ProductFormModal
          mode="create"
          form={productForm}
          categories={categories}
          allProducts={products}
          isSubmitting={isSubmitting}
          onChange={setProductForm}
          onSubmit={handleCreateProduct}
          onClose={() => setShowProductForm(false)}
          branches={branches}
          modifierGroups={modifiers.groups}
          menuTags={activeMenuTags}
        />
      )}

      {canManageProduct && editingProduct && (
        <ProductFormModal
          mode="edit"
          form={productForm}
          categories={categories}
          allProducts={products}
          editingProductId={editingProduct.id}
          recipeCostPerServing={editingProduct.recipe_cost_per_serving ?? null}
          isSubmitting={isSubmitting}
          onChange={setProductForm}
          onSubmit={handleUpdateProduct}
          onClose={() => setEditingProduct(null)}
          branches={branches}
          modifierGroups={modifiers.groups}
          menuTags={activeMenuTags}
        />
      )}

      {canManageModifierGroup && modifiers.showGroupForm && (
        <ModifierGroupFormModal
          mode={modifiers.editingGroup ? "edit" : "create"}
          form={modifiers.groupForm}
          isSubmitting={modifiers.isSubmitting}
          onChange={modifiers.setGroupForm}
          onSubmit={modifiers.handleSaveGroup}
          onClose={() => modifiers.setShowGroupForm(false)}
        />
      )}

      {canManageCategory && showCategoryForm && (
        <CategoryFormModal
          mode="create"
          form={categoryForm}
          isSubmitting={isSubmitting}
          onChange={setCategoryForm}
          onSubmit={handleCreateCategory}
          onClose={() => setShowCategoryForm(false)}
          stations={stations}
          categories={categories}
          menuTags={activeMenuTags}
        />
      )}

      {canManageCategory && editingCategory && (
        <CategoryFormModal
          mode="edit"
          form={categoryForm}
          isSubmitting={isSubmitting}
          onChange={setCategoryForm}
          onSubmit={handleUpdateCategory}
          onClose={() => setEditingCategory(null)}
          stations={stations}
          categories={categories}
          menuTags={activeMenuTags}
        />
      )}

      {canManageMenuTags && menuTagsMgmt.showTagForm && (
        <MenuTagFormModal
          mode={menuTagsMgmt.editingTag ? "edit" : "create"}
          form={menuTagsMgmt.tagForm}
          isSubmitting={menuTagsMgmt.isSubmitting}
          onChange={menuTagsMgmt.setTagForm}
          onSubmit={menuTagsMgmt.handleSubmitTag}
          onClose={menuTagsMgmt.closeTagForm}
        />
      )}

      {canManageProduct && bulk.showBulkPriceModal && (
        <BulkPriceModal
          categories={categories}
          branches={branches}
          bulkFilteredProducts={bulk.bulkFilteredProducts}
          bulkSelectedCategories={bulk.bulkSelectedCategories}
          bulkSelectedProducts={bulk.bulkSelectedProducts}
          bulkRate={bulk.bulkRate}
          bulkBranchId={bulk.bulkBranchId}
          isBulkSubmitting={bulk.isBulkSubmitting}
          onToggleCategory={bulk.toggleBulkCategory}
          onToggleProduct={bulk.toggleBulkProduct}
          onToggleAll={bulk.toggleAllBulkProducts}
          onRateChange={bulk.setBulkRate}
          onBranchChange={bulk.setBulkBranchId}
          onSubmit={bulk.handleBulkPriceUpdate}
          onClose={bulk.closeModal}
        />
      )}

      {canManageProduct && discount.showDiscountModal && (
        <DiscountModal
          categories={categories}
          branches={branches}
          discountFilteredProducts={discount.discountFilteredProducts}
          discountSelectedCategories={discount.discountSelectedCategories}
          discountSelectedProducts={discount.discountSelectedProducts}
          discountRate={discount.discountRate}
          discountBranchId={discount.discountBranchId}
          isDiscountSubmitting={discount.isDiscountSubmitting}
          onToggleCategory={discount.toggleDiscountCategory}
          onToggleProduct={discount.toggleDiscountProduct}
          onToggleAll={discount.toggleAllDiscountProducts}
          onRateChange={discount.setDiscountRate}
          onBranchChange={discount.setDiscountBranchId}
          onSubmit={discount.handleDiscountSubmit}
          onClear={discount.handleDiscountClear}
          onClose={discount.closeModal}
        />
      )}

      {/* Etiket aktivasyon onayı */}
      <AlertDialog open={pendingTagActivation !== null} onOpenChange={(open) => { if (!open) cancelTagActivation() }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tagFilter.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("tagFilter.confirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActivatingTag}>{t("page.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmTagActivation()
              }}
              disabled={isActivatingTag}
            >
              {isActivatingTag ? t("tagFilter.activating") : t("tagFilter.confirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ürün Silme Onay Modalı */}
      <AlertDialog open={!!productToDelete} onOpenChange={(open) => { if (!open) setProductToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("page.deleteProduct.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.rich("page.deleteProduct.description", {
                name: productToDelete?.name ?? "",
                bold: (chunks) => <strong>{chunks}</strong>,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("page.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmDeleteProduct()
              }}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting ? t("page.deleting") : t("page.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Kategori Silme Onay Modalı */}
      <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => { if (!open) setCategoryToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("page.deleteCategory.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.rich("page.deleteCategory.description", {
                name: categoryToDelete?.name ?? "",
                bold: (chunks) => <strong>{chunks}</strong>,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("page.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmDeleteCategory()
              }}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting ? t("page.deleting") : t("page.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}

export default function MenuManagementPage() {
  return (
    <AuthGuard module="menu">
      <MenuManagementPageContent />
    </AuthGuard>
  )
}
