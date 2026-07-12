"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { menuApi } from "@/features/menu/services/menuApi"
import { adminApi, type KitchenStation } from "@/features/admin/services/adminApi"
import type { Branch } from "@/types/user.types"
import { useModulePermissions } from "@/hooks/useModulePermissions"
import { useAuthStore } from "@/store/useAuthStore"
import type { Category, Product, ProductForm, CategoryForm, MenuTag, MenuCatalogSettings } from "@/features/menu/types"
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
import { resolveMediaUrl } from "@/lib/mediaUrl"

function normalizeMenuProduct(product: Product): Product {
  return {
    ...product,
    image: resolveMediaUrl(product.image),
  }
}

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

export function useMenuData() {
  const t = useTranslations("menu_management")
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [stations, setStations] = useState<KitchenStation[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [showProductForm, setShowProductForm] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)

  const [productForm, setProductForm] = useState<ProductForm>(EMPTY_PRODUCT_FORM)
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(EMPTY_CATEGORY_FORM)

  const [menuTags, setMenuTags] = useState<MenuTag[]>([])
  const [catalogSettings, setCatalogSettings] = useState<MenuCatalogSettings | null>(null)
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)
  const [showAllProducts, setShowAllProducts] = useState(false)
  const [pendingTagActivation, setPendingTagActivation] = useState<string | null>(null)
  const [isActivatingTag, setIsActivatingTag] = useState(false)

  const { canManage } = useModulePermissions()
  const user = useAuthStore((s) => s.user)
  const canManageCategory = canManage("menu.manage_category")
  const canManageProduct = canManage("menu.manage_product")

  const fetchTagData = useCallback(async (branchId: string) => {
    const [tagsResult, settingsResult] = await Promise.allSettled([
      menuApi.getMenuTags(branchId),
      menuApi.getCatalogSettings(branchId),
    ])
    if (tagsResult.status === "fulfilled") {
      const d = tagsResult.value.data
      const raw = d?.results ?? d
      setMenuTags(Array.isArray(raw) ? raw : [])
    } else {
      setMenuTags([])
    }
    if (settingsResult.status === "fulfilled") {
      setCatalogSettings(settingsResult.value.data as MenuCatalogSettings)
    } else {
      setCatalogSettings(null)
    }
  }, [])

  const fetchData = useCallback(async () => {
    const [catResult, prodResult, stationsResult, branchesResult] = await Promise.allSettled([
      menuApi.getCategories({ apply_tag_filter: false }),
      menuApi.getProducts({ apply_tag_filter: false }),
      adminApi.getStations(),
      adminApi.getBranches(),
    ])

    if (catResult.status === "fulfilled") {
      const d = catResult.value.data
      const raw = d?.results ?? d
      const cats = Array.isArray(raw) ? raw : []
      setCategories(cats)
      if (cats.length > 0) {
        setSelectedCategory((prev) => prev ?? cats[0].id)
      }
    } else {
      setCategories([])
    }

    if (prodResult.status === "fulfilled") {
      const d = prodResult.value.data
      const raw = d?.results ?? d
      const list = Array.isArray(raw) ? raw : []
      setProducts(list.map((p) => normalizeMenuProduct(p as Product)))
    } else {
      setProducts([])
    }

    if (stationsResult.status === "fulfilled") {
      setStations(stationsResult.value)
    }
    if (branchesResult.status === "fulfilled") {
      setBranches(branchesResult.value as Branch[])
    }

    setIsLoading(false)
  }, [])

  const refreshAfterTagChange = useCallback(async () => {
    await fetchData()
    if (selectedBranchId) {
      await fetchTagData(selectedBranchId)
    }
  }, [fetchData, fetchTagData, selectedBranchId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  useEffect(() => {
    if (selectedBranchId) return
    if (user?.branch_id) {
      setSelectedBranchId(user.branch_id)
    } else if (user?.available_branches && user.available_branches.length > 0) {
      setSelectedBranchId(user.available_branches[0].id)
    } else if (branches.length > 0) {
      setSelectedBranchId(branches[0].id)
    }
  }, [user, branches, selectedBranchId])

  useEffect(() => {
    if (!selectedBranchId) return
    void fetchTagData(selectedBranchId)
    setShowAllProducts(false)
  }, [selectedBranchId, fetchTagData])

  const handleCreateProduct = async () => {
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

      const createRes = await menuApi.createProduct(formData)
      const createdId = createRes.data?.id as string | undefined
      if (createdId && productForm.modifier_group_ids.length > 0) {
        await menuApi.setProductModifierGroups(createdId, productForm.modifier_group_ids)
      }
      setShowProductForm(false)
      setProductForm(EMPTY_PRODUCT_FORM)
      fetchData()
    } catch {
      toast.error(t("toasts.productCreateFailed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateProduct = async () => {
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
        menuTags,
        productForm.tag_ids,
      )
      formData.append('tag_ids', JSON.stringify(mergedProductTagIds))

      await menuApi.updateProduct(editingProduct.id, formData)
      await menuApi.setProductModifierGroups(editingProduct.id, productForm.modifier_group_ids)
      setEditingProduct(null)
      setProductForm(EMPTY_PRODUCT_FORM)
      fetchData()
    } catch {
      toast.error(t("toasts.productUpdateFailed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteProduct = (product: Product) => {
    setProductToDelete(product)
  }

  const confirmDeleteProduct = async () => {
    if (!productToDelete) return
    setIsDeleting(true)
    try {
      await menuApi.deleteProduct(productToDelete.id)
      setProductToDelete(null)
      fetchData()
    } catch {
      toast.error(t("toasts.productDeleteFailed"))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleToggleProductActive = async (product: Product) => {
    try {
      await menuApi.patchProduct(product.id, { is_active: !product.is_active })
      fetchData()
    } catch {
      toast.error(t("toasts.statusUpdateFailed"))
    }
  }

  const handleToggleProductPos = async (product: Product) => {
    try {
      await menuApi.patchProduct(product.id, { show_on_pos: !product.show_on_pos })
      fetchData()
    } catch {
      toast.error(t("toasts.posUpdateFailed"))
    }
  }

  const handleToggleProductFeatured = async (product: Product) => {
    try {
      await menuApi.patchProduct(product.id, { is_featured: !product.is_featured })
      fetchData()
    } catch {
      toast.error(t("toasts.featuredUpdateFailed"))
    }
  }

  const handleToggleProductPopular = async (product: Product) => {
    try {
      await menuApi.patchProduct(product.id, { is_popular: !product.is_popular })
      fetchData()
    } catch {
      toast.error(t("toasts.popularUpdateFailed"))
    }
  }

  const handleToggleProductChefRecommendation = async (product: Product) => {
    try {
      await menuApi.patchProduct(product.id, { is_chef_recommendation: !product.is_chef_recommendation })
      fetchData()
    } catch {
      toast.error(t("toasts.chefRecommendationUpdateFailed"))
    }
  }

  const handleCopyProduct = async (product: Product) => {
    try {
      await menuApi.copyProduct(product.id)
      void fetchData()
    } catch {
      toast.error(t("toasts.productCopyFailed"))
    }
  }

  const handleRemoveProductDiscount = async (product: Product) => {
    try {
      await menuApi.bulkDiscount([product.id], 0, null)
      void fetchData()
    } catch {
      toast.error(t("toasts.discountError"))
    }
  }


  const handleCreateCategory = async () => {
    setIsSubmitting(true)
    try {
      await menuApi.createCategory(categoryForm)
      setShowCategoryForm(false)
      setCategoryForm(EMPTY_CATEGORY_FORM)
      fetchData()
    } catch {
      toast.error(t("toasts.categoryCreateFailed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateCategory = async () => {
    if (!editingCategory) return
    setIsSubmitting(true)
    try {
      const mergedTagIds = mergeTagIdsForBranch(
        editingCategory.tags ?? [],
        menuTags,
        categoryForm.tag_ids,
      )
      await menuApi.updateCategory(editingCategory.id, { ...categoryForm, tag_ids: mergedTagIds })
      setEditingCategory(null)
      setCategoryForm(EMPTY_CATEGORY_FORM)
      fetchData()
    } catch {
      toast.error(t("toasts.categoryUpdateFailed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteCategory = (category: Category) => {
    setCategoryToDelete(category)
  }

  const confirmDeleteCategory = async () => {
    if (!categoryToDelete) return
    setIsDeleting(true)
    try {
      await menuApi.deleteCategory(categoryToDelete.id)
      if (selectedCategory === categoryToDelete.id) setSelectedCategory(null)
      setCategoryToDelete(null)
      fetchData()
    } catch {
      toast.error(t("toasts.categoryDeleteFailed"))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleReorderCategory = async (order_ids: string[]) => {
    try {
      await menuApi.reorderCategories(order_ids)
      setCategories(prev => {
        const sorted = [...prev].sort((a, b) => order_ids.indexOf(a.id) - order_ids.indexOf(b.id))
        return sorted
      })
    } catch (e) {
      console.error("Sorting error:", e)
      void fetchData()
    }
  }

  const handleReorderProduct = async (order_ids: string[]) => {
    try {
      await menuApi.reorderProducts(order_ids)
      setProducts(prev => {
        const sorted = [...prev].sort((a, b) => order_ids.indexOf(a.id) - order_ids.indexOf(b.id))
        return sorted
      })
    } catch (e) {
      console.error("Sorting error:", e)
      void fetchData()
    }
  }

  const openEditProduct = (product: Product) => {
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
        menuTags,
      ),
    })
  }

  const openEditCategory = (category: Category) => {
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
        menuTags,
      ),
    })
  }

  const openAddSubcategory = (parent: Category) => {
    setCategoryForm({ ...EMPTY_CATEGORY_FORM, parent: parent.id })
    setShowCategoryForm(true)
  }

  const openCreateProduct = () => {
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
  }

  const tagFilterActive = isTagFilterActive(catalogSettings, menuTags, selectedBranchId)

  const tagScopedProducts = products.filter((p) => {
    if (!tagFilterActive || showAllProducts) return true
    return productMatchesActiveTag(p, catalogSettings, categories, menuTags, selectedBranchId)
  })

  const filteredProducts = tagScopedProducts.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchCategory = !selectedCategory
      || p.category === selectedCategory
      || getDescendantIds(categories, selectedCategory).includes(p.category)
    return matchSearch && matchCategory
  })

  const panelCategories = categories.filter((cat) =>
    categoryVisibleInPanel(cat, products, catalogSettings, categories, menuTags, showAllProducts, selectedBranchId),
  )

  const panelProducts = showAllProducts || !tagFilterActive
    ? products
    : tagScopedProducts

  const requestTagActivation = (value: string) => {
    const current = catalogSettings?.filter_untagged
      ? UNTAGGED_FILTER_VALUE
      : catalogSettings?.active_tag_id ?? NO_TAG_FILTER_VALUE
    if (value === current) return
    setPendingTagActivation(value)
  }

  const confirmTagActivation = async () => {
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
      const res = await menuApi.activateCatalogTag(payload)
      setCatalogSettings(res.data as MenuCatalogSettings)
      setPendingTagActivation(null)
      toast.success(t("toasts.tagActivated"))
    } catch {
      toast.error(t("toasts.tagActivateFailed"))
    } finally {
      setIsActivatingTag(false)
    }
  }

  const cancelTagActivation = () => setPendingTagActivation(null)

  return {
    categories, products, filteredProducts, panelCategories, panelProducts,
    stations, branches,
    menuTags, setMenuTags,
    catalogSettings,
    selectedBranchId, setSelectedBranchId,
    showAllProducts, setShowAllProducts,
    tagFilterActive,
    tagFilteredProducts: tagScopedProducts,
    effectiveMenuActive: (product: Product) =>
      effectiveMenuActive(product, catalogSettings, categories, menuTags, selectedBranchId),
    pendingTagActivation, requestTagActivation, confirmTagActivation, cancelTagActivation,
    isActivatingTag,
    isLoading,
    searchTerm, setSearchTerm,
    selectedCategory, setSelectedCategory,
    canManageCategory, canManageProduct,
    showProductForm, setShowProductForm,
    showCategoryForm, setShowCategoryForm,
    isSubmitting,
    isDeleting,
    productToDelete, setProductToDelete, confirmDeleteProduct,
    categoryToDelete, setCategoryToDelete, confirmDeleteCategory,
    editingProduct, setEditingProduct,
    editingCategory, setEditingCategory,
    productForm, setProductForm,
    categoryForm, setCategoryForm,
    fetchData,
    fetchTagData,
    refreshAfterTagChange,
    handleCreateProduct, handleUpdateProduct, handleDeleteProduct,
    handleToggleProductActive, handleToggleProductPos, handleToggleProductFeatured,
    handleToggleProductPopular, handleToggleProductChefRecommendation,
    handleCopyProduct,
    handleRemoveProductDiscount,
    handleReorderProduct,
    handleCreateCategory, handleUpdateCategory, handleDeleteCategory,
    handleReorderCategory,
    openEditProduct, openEditCategory, openCreateProduct, openAddSubcategory,
  }
}
