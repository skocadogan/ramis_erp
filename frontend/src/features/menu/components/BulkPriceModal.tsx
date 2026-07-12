"use client"

import { TrendingUp, Building2, Loader2 } from "lucide-react"
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
  bulkFilteredProducts: Product[]
  bulkSelectedCategories: Set<string>
  bulkSelectedProducts: Set<string>
  bulkRate: string
  bulkBranchId: string | null
  isBulkSubmitting: boolean
  onToggleCategory: (id: string) => void
  onToggleProduct: (id: string) => void
  onToggleAll: () => void
  onRateChange: (v: string) => void
  onBranchChange: (id: string | null) => void
  onSubmit: () => void
  onClose: () => void
}

export default function BulkPriceModal({
  categories, branches, bulkFilteredProducts,
  bulkSelectedCategories, bulkSelectedProducts,
  bulkRate, bulkBranchId, isBulkSubmitting,
  onToggleCategory, onToggleProduct, onToggleAll,
  onRateChange, onBranchChange, onSubmit, onClose,
}: Props) {
  const t = useTranslations("menu_management")
  const rate = parseFloat(bulkRate)
  const affectedCount = bulkSelectedProducts.size > 0 ? bulkSelectedProducts.size : bulkFilteredProducts.length

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent layout="scroll" size="4xl" className="h-[80vh] max-h-[90vh]">
        <DialogHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pr-12">
          <DialogTitle className="flex items-center gap-2 whitespace-nowrap text-base">
            <TrendingUp size={16} className="text-blue-600" />
            {t("bulkPrice.title")}
          </DialogTitle>

          {branches.length > 1 && (
            <div className="flex shrink-0 items-center gap-2 rounded-md border border-border bg-muted p-1">
              <Building2 size={14} className="ml-1.5 text-muted-foreground" />
              <select
                value={bulkBranchId || ""}
                onChange={(e) => onBranchChange(e.target.value || null)}
                className="border-none bg-transparent pr-8 text-xs font-ui-medium text-foreground focus:ring-0"
              >
                <option value="">{t("bulkPrice.allBranches")}</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 overflow-hidden p-0">
          <div className="w-48 shrink-0 border-r border-border p-4 overflow-y-auto">
            <p className="text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider mb-2 dark:text-muted-foreground">{t("bulkPrice.categories")}</p>
            <div className="flex flex-col gap-0.5">
              <label className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                <Checkbox
                  checked={bulkSelectedCategories.size === 0}
                  onCheckedChange={() => onToggleCategory("__all__")}
                />
                <span className="text-sm text-foreground">{t("bulkPrice.all")}</span>
              </label>
              {categories.map(cat => (
                <label key={cat.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                  <Checkbox
                    checked={bulkSelectedCategories.has(cat.id)}
                    onCheckedChange={() => onToggleCategory(cat.id)}
                  />
                  <span className="text-sm text-foreground truncate">{cat.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-auto p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">
                {t("bulkPrice.products", { count: bulkFilteredProducts.length })}
              </p>
              <button onClick={onToggleAll} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                {bulkSelectedProducts.size === bulkFilteredProducts.length && bulkFilteredProducts.length > 0
                  ? t("bulkPrice.deselectAll") : t("bulkPrice.selectAll")}
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {bulkFilteredProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center bg-slate-50/50 rounded-lg dark:bg-slate-800/30">{t("bulkPrice.noProducts")}</p>
              ) : (
                bulkFilteredProducts.map(p => {
                  const preview = !isNaN(rate) && rate !== 0
                    ? Math.round(p.base_price * (1 + rate / 100) * 100) / 100
                    : null
                  // Using direct state from our set
                  const isSelected = bulkSelectedProducts.has(p.id);

                  return (
                    <label key={p.id} className={`grid grid-cols-[auto_1fr_80px_80px] sm:grid-cols-[auto_1fr_90px_90px_90px] lg:grid-cols-[auto_1fr_120px_90px_90px] gap-2 sm:gap-3 items-center px-3 sm:px-4 py-3 rounded-lg cursor-pointer border border-transparent transition-all hover:bg-slate-50 hover:border-slate-100 dark:hover:bg-slate-800/50 dark:hover:border-slate-800
                      ${!isSelected ? "opacity-40 grayscale-[0.5]" : ""}`}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleProduct(p.id)}
                      />
                      <span className="text-sm font-ui-medium text-foreground truncate">{p.name}</span>
                      <span className="text-xs text-muted-foreground truncate text-center bg-slate-100 px-2 py-0.5 rounded-full dark:bg-slate-800 dark:text-muted-foreground">{p.category_name}</span>
                      <span className="text-sm font-ui-semibold text-foreground text-right font-mono">
                        {formatCurrency(p.base_price)}
                      </span>
                      <div className="flex justify-end min-w-[90px]">
                        {preview !== null && isSelected && (
                          <span className={`text-sm font-ui-bold flex items-center gap-1 font-mono ${rate > 0 ? "text-emerald-600" : "text-red-500"}`}>
                            <span>→</span>
                            {formatCurrency(preview)}
                          </span>
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
            <label className="shrink-0 text-sm font-ui-medium text-foreground">{t("bulkPrice.rate")}</label>
            <NumberInput
              step="0.1"
              value={bulkRate}
              onChange={onRateChange}
              placeholder={t("bulkPrice.ratePlaceholder")}
              suffix="%"
              containerClassName="w-40"
            />
            {bulkRate && !isNaN(rate) && rate !== 0 && (
              <span className={`text-sm font-ui-medium ${rate > 0 ? "text-emerald-600" : "text-red-500"}`}>
                {rate > 0
                  ? t("bulkPrice.summaryIncrease", { rate: bulkRate, count: affectedCount })
                  : t("bulkPrice.summaryDecrease", { rate: bulkRate, count: affectedCount })}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("bulkPrice.cancel")}
            </Button>
            <Button
              type="button"
              onClick={onSubmit}
              disabled={isBulkSubmitting || !bulkRate || isNaN(rate) || rate === 0 || bulkFilteredProducts.length === 0}
            >
              {isBulkSubmitting && <Loader2 size={14} className="animate-spin" />}
              {isBulkSubmitting ? t("bulkPrice.submitting") : t("bulkPrice.submit")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
