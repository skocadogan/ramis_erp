"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { useTranslations } from "next-intl"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/formatters"
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts"
import { toastApiError, toastApiSuccess } from "@/lib/operationalToast"
import { menuApi } from "@/features/menu/services/menuApi"
import type { Category, Product, ProductRecommendation } from "@/features/menu/types"
import { getDescendantIds } from "@/features/menu/lib/categoryTree"
import CategoryPanel from "@/features/menu/components/CategoryPanel"
import {
  STANDARD_UNIT_VALUE,
  apiUnitIdToSelect,
  unitDisplayPrice,
  unitIdToApi,
} from "@/features/menu/lib/recommendedProductPricing"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

const ROW_HEIGHT_PX = 56

type RowSelection = {
  selected: boolean
  unitId: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceProductId: string
  sourceProductName: string
  sourceBranchIds: string[]
  categories: Category[]
  allProducts: Product[]
  onSaved: (items: ProductRecommendation[]) => void
}

function productAvailableInBranches(product: Product, branchIds: string[]): boolean {
  if (!branchIds.length) return true
  if (!product.branches?.length) return true
  return product.branches.some((b) => branchIds.includes(b))
}

const productRowGridClass =
  "grid grid-cols-[2rem_auto_minmax(0,1fr)_minmax(9rem,11rem)_5.5rem] items-center gap-x-3"

export function RecommendedProductsModal({
  open,
  onOpenChange,
  sourceProductId,
  sourceProductName,
  sourceBranchIds,
  categories,
  allProducts,
  onSaved,
}: Props) {
  const t = useTranslations("menu_management.recommendedProducts")
  const canViewAmounts = useCanViewAmounts()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [rowState, setRowState] = useState<Record<string, RowSelection>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const listScrollRef = useRef<HTMLDivElement>(null)

  const candidateProducts = useMemo(() => {
    return allProducts.filter(
      (p) =>
        p.id !== sourceProductId &&
        p.is_active &&
        productAvailableInBranches(p, sourceBranchIds),
    )
  }, [allProducts, sourceProductId, sourceBranchIds])

  const activeCategories = useMemo(
    () => categories.filter((c) => c.is_active),
    [categories],
  )

  const filteredProducts = useMemo(() => {
    if (!selectedCategory) return candidateProducts
    const descendantIds = getDescendantIds(activeCategories, selectedCategory)
    return candidateProducts.filter(
      (p) => p.category === selectedCategory || descendantIds.includes(p.category),
    )
  }, [candidateProducts, selectedCategory, activeCategories])

  const selectedSummary = useMemo(() => {
    return candidateProducts
      .filter((p) => rowState[p.id]?.selected)
      .map((p, index) => {
        const unitId = rowState[p.id]?.unitId ?? STANDARD_UNIT_VALUE
        return {
          product: p,
          unitId,
          price: unitDisplayPrice(p, unitId),
          order: index,
        }
      })
  }, [candidateProducts, rowState])

  const allSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((p) => rowState[p.id]?.selected)

  const rowVirtualizer = useVirtualizer({
    count: filteredProducts.length,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 10,
    getItemKey: (index) => filteredProducts[index]?.id ?? index,
  })

  const loadRecommendations = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await menuApi.getProductRecommendations(sourceProductId)
      const items = (res.data ?? []) as ProductRecommendation[]
      const next: Record<string, RowSelection> = {}
      for (const item of items) {
        next[item.recommended_product_id] = {
          selected: true,
          unitId: apiUnitIdToSelect(item.product_unit),
        }
      }
      setRowState(next)
    } catch (err) {
      toastApiError(err, t("loadFailed"))
    } finally {
      setIsLoading(false)
    }
  }, [sourceProductId, t])

  useEffect(() => {
    if (open) {
      setSelectedCategory(null)
      void loadRecommendations()
    }
  }, [open, loadRecommendations])

  const toggleRow = (productId: string) => {
    setRowState((prev) => {
      const current = prev[productId]
      if (current?.selected) {
        const next = { ...prev }
        delete next[productId]
        return next
      }
      return {
        ...prev,
        [productId]: {
          selected: true,
          unitId: STANDARD_UNIT_VALUE,
        },
      }
    })
  }

  const setRowUnit = (productId: string, unitId: string) => {
    setRowState((prev) => ({
      ...prev,
      [productId]: { selected: true, unitId },
    }))
  }

  const toggleAllVisible = () => {
    if (allSelected) {
      setRowState((prev) => {
        const next = { ...prev }
        for (const p of filteredProducts) {
          delete next[p.id]
        }
        return next
      })
      return
    }
    setRowState((prev) => {
      const next = { ...prev }
      for (const p of filteredProducts) {
        next[p.id] = {
          selected: true,
          unitId: next[p.id]?.unitId ?? STANDARD_UNIT_VALUE,
        }
      }
      return next
    })
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const items = selectedSummary.map((row, index) => ({
        recommended_product_id: row.product.id,
        product_unit_id: unitIdToApi(row.unitId),
        order: index,
      }))
      const res = await menuApi.syncProductRecommendations(sourceProductId, items)
      const saved = (res.data ?? []) as ProductRecommendation[]
      onSaved(saved)
      toastApiSuccess(t("saveSuccess"))
      onOpenChange(false)
    } catch (err) {
      toastApiError(err, t("saveFailed"))
    } finally {
      setIsSaving(false)
    }
  }

  const virtualItems = rowVirtualizer.getVirtualItems()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layout="scroll" size="6xl" className="h-[min(90vh,820px)] max-h-[90vh]">
        <DialogHeader className="pr-12">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-violet-500" />
            {t("modalTitle")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{sourceProductName}</p>
        </DialogHeader>

        {isLoading ? (
          <DialogBody className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </DialogBody>
        ) : (
          <DialogBody className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0">
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <CategoryPanel
                className="h-full min-h-0 border-r border-border p-4 pr-3"
                categories={activeCategories}
                products={candidateProducts}
                selectedCategory={selectedCategory}
                canManage={false}
                onSelect={setSelectedCategory}
              />

              {/* Ürün tablosu */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("productsCount", { count: filteredProducts.length })}
                  </p>
                  <button
                    type="button"
                    onClick={toggleAllVisible}
                    className="text-xs text-violet-600 hover:underline dark:text-violet-400"
                    disabled={filteredProducts.length === 0}
                  >
                    {allSelected ? t("deselectAll") : t("selectAll")}
                  </button>
                </div>

                <div
                  className={cn(
                    productRowGridClass,
                    "shrink-0 border-b border-border px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                  )}
                >
                  <span className="text-center">#</span>
                  <span aria-hidden className="w-4" />
                  <span>{t("columns.product")}</span>
                  <span>{t("columns.unit")}</span>
                  <span className="text-right">{t("columns.price")}</span>
                </div>

                <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
                  {filteredProducts.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">{t("emptyProducts")}</p>
                  ) : (
                    <div
                      className="relative w-full"
                      style={{ height: rowVirtualizer.getTotalSize() }}
                    >
                      {virtualItems.map((virtualItem) => {
                        const product = filteredProducts[virtualItem.index]
                        const state = rowState[product.id]
                        const isSelected = !!state?.selected
                        const unitId = state?.unitId ?? STANDARD_UNIT_VALUE
                        const hasUnits = (product.units?.length ?? 0) > 0
                        const price = unitDisplayPrice(product, unitId)

                        return (
                          <label
                            key={product.id}
                            data-index={virtualItem.index}
                            ref={rowVirtualizer.measureElement}
                            className={cn(
                              productRowGridClass,
                              "absolute left-0 top-0 w-full cursor-pointer border-b border-border/50 px-3 py-2 transition-colors hover:bg-muted/40",
                              !isSelected && "opacity-55",
                              isSelected && "bg-violet-50/50 dark:bg-violet-950/20",
                            )}
                            style={{
                              transform: `translateY(${virtualItem.start}px)`,
                            }}
                          >
                            <span className="text-center text-xs tabular-nums text-muted-foreground">
                              {virtualItem.index + 1}
                            </span>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleRow(product.id)}
                              aria-label={t("selectProduct", { name: product.name })}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="truncate text-sm font-medium text-foreground">
                              {product.name}
                            </span>
                            <div onClick={(e) => e.preventDefault()}>
                              {hasUnits ? (
                                <select
                                  value={isSelected ? unitId : STANDARD_UNIT_VALUE}
                                  disabled={!isSelected}
                                  onChange={(e) => setRowUnit(product.id, e.target.value)}
                                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                                >
                                  <option value={STANDARD_UNIT_VALUE}>{t("standardUnit")}</option>
                                  {product.units!.map((u) => (
                                    <option key={u.id} value={u.id!}>
                                      {u.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                            <span className="text-right text-sm font-mono tabular-nums">
                              {canViewAmounts ? formatCurrency(price) : "—"}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {selectedSummary.length > 0 && (
              <div className="shrink-0 border-t border-border bg-muted/10 px-6 py-3">
                <p className="mb-2 text-sm font-semibold">{t("selectedTitle")}</p>
                <div className="max-h-32 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-4">{t("columns.product")}</th>
                        <th className="pb-2 pr-4">{t("columns.unit")}</th>
                        <th className="pb-2 text-right">{t("columns.price")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSummary.map((row) => {
                        const unitLabel =
                          row.unitId === STANDARD_UNIT_VALUE
                            ? t("standardUnit")
                            : row.product.units?.find((u) => u.id === row.unitId)?.name ?? "—"
                        return (
                          <tr key={row.product.id} className="border-t border-border/60">
                            <td className="py-1.5 pr-4 font-medium">{row.product.name}</td>
                            <td className="py-1.5 pr-4 text-muted-foreground">{unitLabel}</td>
                            <td className="py-1.5 text-right font-mono tabular-nums">
                              {canViewAmounts ? formatCurrency(row.price) : "—"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </DialogBody>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={isSaving || isLoading}>
            {isSaving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
