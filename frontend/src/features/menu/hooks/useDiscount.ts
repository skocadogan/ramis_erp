"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { menuApi } from "@/features/menu/services/menuApi"
import type { Product } from "@/features/menu/types"

export function useDiscount(products: Product[], fetchData: () => void) {
  const t = useTranslations("menu_management")
  const [showDiscountModal, setShowDiscountModal] = useState(false)
  const [discountSelectedCategories, setDiscountSelectedCategories] = useState<Set<string>>(new Set())
  const [discountSelectedProducts, setDiscountSelectedProducts] = useState<Set<string>>(new Set())
  const [discountRate, setDiscountRate] = useState<string>("")
  const [discountBranchId, setDiscountBranchId] = useState<string | null>(null)
  const [isDiscountSubmitting, setIsDiscountSubmitting] = useState(false)
  const [hasInitialized, setHasInitialized] = useState(false)

  const discountFilteredProducts = products.filter(p => {
    const matchCategory = discountSelectedCategories.size === 0 || discountSelectedCategories.has(p.category)
    const matchBranch = !discountBranchId || p.branch_id === discountBranchId
    return matchCategory && matchBranch
  })

  // Auto-select all on first open
  if (showDiscountModal && !hasInitialized && products.length > 0) {
    setDiscountSelectedProducts(new Set(products.map(p => p.id)))
    setHasInitialized(true)
  }

  const closeModal = () => {
    setShowDiscountModal(false)
    setDiscountSelectedCategories(new Set())
    setDiscountSelectedProducts(new Set())
    setDiscountRate("")
    setDiscountBranchId(null)
    setHasInitialized(false)
  }

  const toggleDiscountCategory = (id: string) => {
    if (id === "__all__") {
      setDiscountSelectedCategories(new Set())
      const newlyFiltered = products.filter(p => !discountBranchId || p.branch_id === discountBranchId)
      setDiscountSelectedProducts(new Set(newlyFiltered.map(p => p.id)))
      return
    }
    setDiscountSelectedCategories(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      const newlyFiltered = products.filter(p => 
        (next.size === 0 || next.has(p.category)) && (!discountBranchId || p.branch_id === discountBranchId)
      )
      setDiscountSelectedProducts(new Set(newlyFiltered.map(p => p.id)))
      return next
    })
  }

  const toggleDiscountProduct = (id: string) => {
    setDiscountSelectedProducts(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const toggleAllDiscountProducts = () => {
    if (discountSelectedProducts.size === discountFilteredProducts.length) {
      setDiscountSelectedProducts(new Set())
    } else {
      setDiscountSelectedProducts(new Set(discountFilteredProducts.map(p => p.id)))
    }
  }

  const handleDiscountSubmit = async () => {
    const rate = parseFloat(discountRate)
    if (isNaN(rate) || rate < 0 || rate > 100) return
    const targetProductIds = Array.from(discountSelectedProducts)
    if (targetProductIds.length === 0) return

    setIsDiscountSubmitting(true)
    try {
      await menuApi.bulkDiscount(targetProductIds, rate, discountBranchId)
      closeModal()
      fetchData()
    } catch {
      toast.error(t("toasts.discountError"))
    } finally {
      setIsDiscountSubmitting(false)
    }
  }

  const handleDiscountClear = async () => {
    const targetProductIds = Array.from(discountSelectedProducts)
    if (targetProductIds.length === 0) return

    setIsDiscountSubmitting(true)
    try {
      await menuApi.bulkDiscount(targetProductIds, 0, discountBranchId)
      closeModal()
      fetchData()
    } catch {
      toast.error(t("toasts.discountError"))
    } finally {
      setIsDiscountSubmitting(false)
    }
  }

  return {
    showDiscountModal, setShowDiscountModal,
    discountSelectedCategories, setDiscountSelectedCategories,
    discountSelectedProducts, setDiscountSelectedProducts,
    discountRate, setDiscountRate,
    discountBranchId, setDiscountBranchId,
    isDiscountSubmitting,
    discountFilteredProducts,
    closeModal,
    toggleDiscountCategory,
    toggleDiscountProduct,
    toggleAllDiscountProducts,
    handleDiscountSubmit,
    handleDiscountClear,
  }
}

