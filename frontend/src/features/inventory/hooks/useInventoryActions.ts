"use client";

import { useTranslations } from "next-intl"
import { useState, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import { parseApiError } from "@/lib/parseApiError"
import type { StockCategory } from "@/features/inventory/types"

type MovementFormState = {
  stock_item_id: string
  warehouse_id: string
  movement_type: string
  quantity: string
  unit: string
  reference: string
  notes: string
  supplier_id: string
  unit_price: string
}

type SupplierFormState = {
  name: string
  contact_person: string
  phone: string
  email: string
  address: string
  stock_items: string[]
  notes: string
}

type CategoryFormState = { name: string; code: string; parent: string }

type UnitFormState = { name: string; short_name: string; multiplier: string }

interface UseInventoryActionsProps {
  showToast: (msg: string, type?: 'success' | 'error') => void
  fetchData: () => Promise<void>
}

function emptyStockItemForm() {
  return {
    name: "",
    sku: "",
    barcode: "",
    unit: "",
    minimum_quantity: "0",
    last_purchase_price: "0",
    category: "",
    allergen_ids: [] as string[],
  }
}

export function useInventoryActions({ showToast, fetchData }: UseInventoryActionsProps) {
  const t = useTranslations("inventory")
  const queryClient = useQueryClient()
  const [isSubmitting, setIsSubmitting] = useState(false)
  /** POST/DELETE /inventory/stock-movements/ backend hata metni — AlertDialog ile gösterilir */
  const [stockMovementError, setStockMovementError] = useState<string | null>(null)
  const clearStockMovementError = useCallback(() => setStockMovementError(null), [])

  // Modals visibility state (moving some common ones here)
  const [showForm, setShowForm] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [formData, setFormData] = useState(emptyStockItemForm)

  // Refresh helper
  const refreshItemsAndSummary = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['stock-items'] })
    queryClient.invalidateQueries({ queryKey: ['stock-summary'] })
  }, [queryClient])

  const handleItemSubmit = useCallback(async () => {
    setIsSubmitting(true)
    try {
      const payload = {
        ...formData,
        minimum_quantity: parseFloat(formData.minimum_quantity) || 0,
        last_purchase_price: parseFloat(formData.last_purchase_price) || 0,
        allergen_ids: formData.allergen_ids,
      }
      if (editingItemId) {
        await inventoryApi.updateStockItem(editingItemId, payload)
      } else {
        await inventoryApi.createStockItem(payload)
      }
      setShowForm(false)
      setEditingItemId(null)
      setFormData(emptyStockItemForm())
      refreshItemsAndSummary()
      await fetchData() // Re-fetch categories to sync product counts/data
      showToast(editingItemId ? t("toasts.itemUpdated") : t("toasts.itemCreated"))
    } catch (e) {
      console.error("Stok kalemi işlemi hatası:", e)
      showToast(parseApiError(e), "error")
    } finally {
      setIsSubmitting(false)
    }
  }, [editingItemId, formData, refreshItemsAndSummary, fetchData, showToast, t])

  /** Yeni stok kalemi modalı: önceki düzenleme / taslak alanlarını temizler */
  const openNewStockItemForm = useCallback(() => {
    setEditingItemId(null)
    setFormData(emptyStockItemForm())
    setShowForm(true)
  }, [])

  const handleMovementSubmit = useCallback(async (
    movementData: MovementFormState,
    setMovementData: (data: MovementFormState) => void,
    setShowMovementForm: (open: boolean) => void
  ) => {
    if (movementData.movement_type === "ADJUSTMENT" && !movementData.warehouse_id) {
      showToast(t("toasts.adjustmentWarehouseRequired"), "error")
      return
    }
    setIsSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        stock_item_id: movementData.stock_item_id,
        warehouse_id: movementData.warehouse_id || null,
        movement_type: movementData.movement_type,
        quantity: parseFloat(movementData.quantity),
        unit: movementData.unit,
        reference: movementData.reference || "",
        notes: movementData.notes || "",
        unit_price: parseFloat(movementData.unit_price) || 0,
      }
      if (movementData.supplier_id) {
        payload.supplier_id = movementData.supplier_id
      }
      if (!payload.warehouse_id) delete payload.warehouse_id

      await inventoryApi.createStockMovement(payload)
      setShowMovementForm(false)
      setMovementData({ stock_item_id: "", warehouse_id: "", movement_type: "IN", quantity: "", unit: "", reference: "", notes: "", supplier_id: "", unit_price: "0" })

      refreshItemsAndSummary()
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] })
      showToast(t("toasts.movementSaved"))
    } catch (e) {
      console.error("Stok hareketi hatası:", e)
      const errorMsg = parseApiError(e)
      setStockMovementError(errorMsg)
      showToast(errorMsg, "error")
    } finally {
      setIsSubmitting(false)
    }
  }, [refreshItemsAndSummary, queryClient, showToast, t])

  const handleSupplierSubmit = useCallback(async (
    editingSupplierId: string | null,
    supplierFormData: SupplierFormState,
    setSupplierFormData: (data: SupplierFormState) => void,
    setShowSupplierForm: (open: boolean) => void
  ) => {
    setIsSubmitting(true)
    try {
      if (editingSupplierId) {
        await inventoryApi.updateSupplier(editingSupplierId, supplierFormData)
      } else {
        await inventoryApi.createSupplier(supplierFormData)
      }
      setShowSupplierForm(false)
      setSupplierFormData({ name: "", contact_person: "", phone: "", email: "", address: "", notes: "", stock_items: [] })
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      showToast(editingSupplierId ? t("toasts.supplierUpdated") : t("toasts.supplierCreated"))
    } catch (e) {
      console.error("Tedarikçi işlemi hatası:", e)
      showToast(parseApiError(e), "error")
    } finally {
      setIsSubmitting(false)
    }
  }, [showToast, queryClient, t])

  const handleDeleteSupplier = useCallback(async (supplierToDelete: string) => {
    try {
      await inventoryApi.deleteSupplier(supplierToDelete)
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      showToast(t("toasts.supplierDeleted"))
    } catch (e) {
      console.error("Silme hatası:", e)
      showToast(t("toasts.supplierDeleteFail"), "error")
    }
  }, [showToast, queryClient, t])

  const handleDeleteMovement = useCallback(async (movementToDelete: string) => {
    try {
      await inventoryApi.deleteStockMovement(movementToDelete)
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] })
      refreshItemsAndSummary()
      showToast(t("toasts.movementDeleted"))
    } catch (e) {
      console.error("Stok hareketi silme hatası:", e)
      setStockMovementError(parseApiError(e))
    }
  }, [queryClient, refreshItemsAndSummary, showToast, t])

  const handleCategorySubmit = useCallback(async (
    editingCategoryId: string | null,
    categoryFormData: CategoryFormState,
    setCategoryFormData: (data: CategoryFormState) => void,
    setShowCategoryForm: (open: boolean) => void
  ) => {
    setIsSubmitting(true)
    try {
      if (editingCategoryId) {
        await inventoryApi.updateCategory(editingCategoryId, categoryFormData)
      } else {
        await inventoryApi.createCategory(categoryFormData)
      }
      setShowCategoryForm(false)
      setCategoryFormData({ name: "", code: "", parent: "" })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      showToast(editingCategoryId ? t("toasts.categoryUpdated") : t("toasts.categoryCreated"))
    } catch (e) {
      console.error("Kategori işlemi hatası:", e)
      showToast(parseApiError(e), "error")
    } finally {
      setIsSubmitting(false)
    }
  }, [showToast, queryClient, t])

  const handleUnitSubmit = useCallback(async (
    editingUnitId: string | null,
    unitFormData: UnitFormState,
    setUnitFormData: (data: UnitFormState) => void,
    setShowUnitForm: (open: boolean) => void
  ) => {
    setIsSubmitting(true)
    try {
      const payload = {
        ...unitFormData,
        multiplier: parseFloat(unitFormData.multiplier) || 1.0,
      }
      if (editingUnitId) {
        await inventoryApi.updateStockUnit(editingUnitId, payload)
      } else {
        await inventoryApi.createStockUnit(payload)
      }
      setShowUnitForm(false)
      setUnitFormData({ name: "", short_name: "", multiplier: "1.000" })
      queryClient.invalidateQueries({ queryKey: ['stock-units'] })
      showToast(editingUnitId ? t("toasts.unitUpdated") : t("toasts.unitCreated"))
    } catch (e) {
      console.error("Birim işlemi hatası:", e)
      showToast(parseApiError(e), "error")
    } finally {
      setIsSubmitting(false)
    }
  }, [showToast, queryClient, t])

  const handleDeleteUnit = useCallback(async (unitToDelete: string) => {
    try {
      await inventoryApi.deleteStockUnit(unitToDelete)
      queryClient.invalidateQueries({ queryKey: ['stock-units'] })
      showToast(t("toasts.unitDeleted"))
    } catch (e) {
      console.error("Silme hatası:", e)
      showToast(t("toasts.unitDeleteFail"), "error")
    }
  }, [showToast, queryClient, t])

  const handleDeleteCategory = useCallback(async (categoryToDelete: StockCategory) => {
    try {
      await inventoryApi.deleteCategory(categoryToDelete.id)
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      showToast(t("toasts.categoryDeleted"))
    } catch (e: unknown) {
      console.error("Kategori silme hatası:", e)
      showToast(parseApiError(e), "error")
    }
  }, [showToast, queryClient, t])

  const handleDeleteStockItem = useCallback(async (stockItemId: string) => {
    try {
      await inventoryApi.deleteStockItem(stockItemId)
      refreshItemsAndSummary()
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] })
      showToast(t("toasts.itemDeleted"))
    } catch (e: unknown) {
      console.error("Stok kalemi silme hatası:", e)
      showToast(parseApiError(e), "error")
    }
  }, [refreshItemsAndSummary, queryClient, showToast, t])

  return {
    isSubmitting,
    showForm, setShowForm,
    editingItemId, setEditingItemId,
    formData, setFormData,
    openNewStockItemForm,
    handleItemSubmit,
    handleMovementSubmit,
    handleSupplierSubmit,
    handleDeleteSupplier,
    handleDeleteMovement,
    handleCategorySubmit,
    handleUnitSubmit,
    handleDeleteUnit,
    handleDeleteCategory,
    handleDeleteStockItem,
    stockMovementError,
    clearStockMovementError,
  }
}
