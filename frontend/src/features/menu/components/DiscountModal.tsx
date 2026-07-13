"use client"

import { Tag, Star, Building2, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { NumberInput } from "@/components/ui/number-input"
import { Checkbox } from "@/components/ui/checkbox"
import { formatCurrency } from "@/lib/formatters"
import type { Category, Product } from "@/features/menu/types"
import type { Branch } from "@/types/user.types"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface Props {
  categories: Category[]
  branches: Branch[]
  discountFilteredProducts: Product[]
  discountSelectedCategories: Set<string>
  discountSelectedProducts: Set<string>
  discountRate: string
  discountBranchId: string | null
  isDiscountSubmitting: boolean
  onToggleCategory: (id: string) => void
  onToggleProduct: (id: string) => void
  onToggleAll: () => void
  onRateChange: (v: string) => void
  onBranchChange: (id: string | null) => void
  onSubmit: () => void
  onClear?: () => void
  onClose: () => void
}

export default function DiscountModal({
  categories, branches, discountFilteredProducts,
  discountSelectedCategories, discountSelectedProducts,
  discountRate, discountBranchId, isDiscountSubmitting,
  onToggleCategory, onToggleProduct, onToggleAll,
  onRateChange, onBranchChange, onSubmit, onClear, onClose,
}: Props) {
  const t = useTranslations("menu_management")
  const rate = parseFloat(discountRate)
  const isValidRate = !isNaN(rate) && rate >= 0 && rate <= 100
  const affectedCount = discountSelectedProducts.size

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent layout="scroll" size="4xl" className="h-[80vh] max-h-[90vh]">
        <DialogHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pr-12">
          <DialogTitle className="flex items-center gap-2 whitespace-nowrap text-base">
            <Tag size={16} className="text-pink-600" />
            {t("discountModal.title")}
          </DialogTitle>

          {branches.length > 1 && (
            <div className="flex shrink-0 items-center gap-2 rounded-md border border-border bg-muted p-1">
              <Building2 size={14} className="ml-1.5 text-muted-foreground" />
              <select
                value={discountBranchId || ""}
                onChange={(e) => onBranchChange(e.target.value || null)}
                className="border-none bg-transparent pr-8 text-xs font-medium text-foreground focus:ring-0"
              >
                <option value="">{t("discountModal.allBranches")}</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 overflow-hidden p-0">
          {/* Category sidebar */}
          <div className="w-48 shrink-0 border-r border-border p-4 overflow-y-auto">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 dark:text-muted-foreground">{t("discountModal.categories")}</p>
            <div className="flex flex-col gap-0.5">
              <label className="flex items-center gap-2 px-2 py-1.5 rounded-md hover: dark:hover: cursor-pointer">
                <Checkbox
                  checked={discountSelectedCategories.size === 0}
                  onCheckedChange={() => onToggleCategory("__all__")}
                />
                <span className="text-sm text-foreground">{t("discountModal.all")}</span>
              </label>
              {categories.map(cat => (
                <label key={cat.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover: dark:hover: cursor-pointer">
                  <Checkbox
                    checked={discountSelectedCategories.has(cat.id)}
                    onCheckedChange={() => onToggleCategory(cat.id)}
                  />
                  <span className="text-sm text-foreground truncate">{cat.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Product list */}
          <div className="flex-1 overflow-y-auto overflow-x-auto p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">
                {t("discountModal.products", { count: discountFilteredProducts.length })}
              </p>
              <button onClick={onToggleAll} className="text-xs text-amber-600 hover:underline dark:text-amber-400">
                {discountSelectedProducts.size === discountFilteredProducts.length && discountFilteredProducts.length > 0
                  ? t("discountModal.deselectAll") : t("discountModal.selectAll")}
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {discountFilteredProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center /50 rounded-lg bg-muted/30">{t("discountModal.noProducts")}</p>
              ) : (
                discountFilteredProducts.map(p => {
                  const isSelected = discountSelectedProducts.has(p.id)
                  const discountedPreview = isValidRate && rate > 0 && isSelected
                    ? Math.round(p.base_price * (1 - rate / 100) * 100) / 100
                    : null
                  const currentDiscount = p.discount_rate || 0

                  return (
                    <label key={p.id} className={`grid grid-cols-[auto_1fr_80px_80px] sm:grid-cols-[auto_1fr_90px_90px_90px] lg:grid-cols-[auto_1fr_120px_90px_100px] gap-2 sm:gap-3 items-center px-3 sm:px-4 py-3 rounded-lg cursor-pointer border border-transparent transition-all hover:bg-amber-50 hover:border-amber-100 dark:hover:/50 dark:hover:border-slate-800
 ${!isSelected ? "opacity-40 grayscale-[0.5]" : ""}`}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleProduct(p.id)}
                      />
                      <span className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                        {p.name}
                        {p.is_featured && <Star size={12} className="text-amber-500 fill-amber-500 shrink-0" />}
                      </span>
                      <span className="text-xs text-muted-foreground truncate text-center px-2 py-0.5 rounded-full bg-muted dark:text-muted-foreground">{p.category_name}</span>
                      <div className="flex flex-col items-end">
                        <span className={`text-sm font-semibold font-mono ${currentDiscount > 0 ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {formatCurrency(p.base_price)}
                        </span>
                        {currentDiscount > 0 && p.discounted_price && (
                          <span className="text-xs font-bold text-amber-600 font-mono">
                            {formatCurrency(p.discounted_price)}
                            <span className="ml-1 text-2xs bg-amber-100 text-amber-700 px-1 py-0.5 rounded">%{currentDiscount}</span>
                          </span>
                        )}
                      </div>
                      <div className="flex justify-end min-w-[100px]">
                        {discountedPreview !== null && (
                          <span className="text-sm font-bold flex items-center gap-1 font-mono text-amber-600 dark:text-amber-400">
                            <span>→</span>
                            {formatCurrency(discountedPreview)}
                          </span>
                        )}
                        {rate === 0 && isSelected && currentDiscount > 0 && (
                          <span className="text-xs font-medium text-rose-500">{t("discountModal.removeInline")}</span>
                        )}
                      </div>
                    </label>
                  )
                })
              )}
            </div>
          </div>
        </DialogBody>

        <DialogFooter className="flex-row flex-wrap items-center gap-4 sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <label className="shrink-0 text-sm font-medium text-foreground">{t("discountModal.rate")}</label>
            <NumberInput
              step="0.5"
              min="0"
              max="100"
              value={discountRate}
              onChange={onRateChange}
              placeholder={t("discountModal.ratePlaceholder")}
              suffix="%"
              containerClassName="w-44"
            />
            {discountRate !== "" && isValidRate && (
              <span className={`text-sm font-medium ${rate > 0 ? "text-amber-600" : "text-rose-500"}`}>
                {rate > 0
                  ? t("discountModal.summaryDiscount", { rate: discountRate, count: affectedCount })
                  : t("discountModal.summaryRemove", { count: affectedCount })}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {onClear && affectedCount > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={onClear}
                disabled={isDiscountSubmitting}
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                {t("discountModal.removeInline")}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              {t("discountModal.cancel")}
            </Button>
            <Button
              type="button"
              onClick={onSubmit}
              disabled={isDiscountSubmitting || discountRate === "" || !isValidRate || affectedCount === 0}
              className="bg-amber-500 text-white hover:bg-amber-600"
            >
              {isDiscountSubmitting && <Loader2 size={14} className="animate-spin" />}
              {isDiscountSubmitting ? t("discountModal.submitting") : t("discountModal.submit")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
