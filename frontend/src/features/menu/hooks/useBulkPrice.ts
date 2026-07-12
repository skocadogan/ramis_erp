"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { menuApi } from "@/features/menu/services/menuApi"
import type { Product } from "@/features/menu/types"

export function useBulkPrice(products: Product[], fetchData: () => void) {
  const t = useTranslations("menu_management")
  const [showBulkPriceModal, setShowBulkPriceModal] = useState(false)
  const [bulkSelectedCategories, setBulkSelectedCategories] = useState<Set<string>>(new Set())
  const [bulkSelectedProducts, setBulkSelectedProducts] = useState<Set<string>>(new Set())
  const [bulkRate, setBulkRate] = useState<string>("")
  const [bulkBranchId, setBulkBranchId] = useState<string | null>(null)
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false)

  const bulkFilteredProducts = products.filter(p => {
    const matchCategory = bulkSelectedCategories.size === 0 || bulkSelectedCategories.has(p.category)
    const matchBranch = !bulkBranchId || p.branch_id === bulkBranchId
    return matchCategory && matchBranch
  })

  // Initialize selected products when opening modal or when filtered products change (category filter)
  // Only auto-initialize on first open
  const [hasInitialized, setHasInitialized] = useState(false)

  if (showBulkPriceModal && !hasInitialized && products.length > 0) {
    setBulkSelectedProducts(new Set(products.map(p => p.id)))
    setHasInitialized(true)
  }

  const closeModal = () => {
    setShowBulkPriceModal(false)
    setBulkSelectedCategories(new Set())
    setBulkSelectedProducts(new Set())
    setBulkRate("")
    setBulkBranchId(null)
    setHasInitialized(false)
  }

  const toggleBulkCategory = (id: string) => {
    if (id === "__all__") {
      setBulkSelectedCategories(new Set())
      const newlyFiltered = products.filter(p => !bulkBranchId || p.branch_id === bulkBranchId)
      setBulkSelectedProducts(new Set(newlyFiltered.map(p => p.id)))
      return
    }
    setBulkSelectedCategories(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      
      const newlyFiltered = products.filter(p => 
        (next.size === 0 || next.has(p.category)) && (!bulkBranchId || p.branch_id === bulkBranchId)
      )
      setBulkSelectedProducts(new Set(newlyFiltered.map(p => p.id)))
      
      return next
    })
  }

  const toggleBulkProduct = (id: string) => {
    setBulkSelectedProducts(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const toggleAllBulkProducts = () => {
    if (bulkSelectedProducts.size === bulkFilteredProducts.length) {
      setBulkSelectedProducts(new Set())
    } else {
      setBulkSelectedProducts(new Set(bulkFilteredProducts.map(p => p.id)))
    }
  }

  const handleBulkPriceUpdate = async () => {
    const rate = parseFloat(bulkRate)
    if (isNaN(rate) || rate === 0) return
    const targetProductIds = Array.from(bulkSelectedProducts)
    if (targetProductIds.length === 0) return
    
    setIsBulkSubmitting(true)
    try {
      await menuApi.bulkPriceUpdate(targetProductIds, bulkBranchId, 'PERCENT', rate)
      closeModal()
      fetchData()
    } catch {
      toast.error(t("toasts.bulkPriceError"))
    } finally {
      setIsBulkSubmitting(false)
    }
  }

  return {
    showBulkPriceModal, setShowBulkPriceModal,
    bulkSelectedCategories, setBulkSelectedCategories,
    bulkSelectedProducts, setBulkSelectedProducts,
    bulkRate, setBulkRate,
    bulkBranchId, setBulkBranchId,
    isBulkSubmitting,
    bulkFilteredProducts,
    closeModal,
    toggleBulkCategory,
    toggleBulkProduct,
    toggleAllBulkProducts,
    handleBulkPriceUpdate,
  }
}
