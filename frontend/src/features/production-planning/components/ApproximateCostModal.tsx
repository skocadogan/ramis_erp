"use client"

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, FileDown, FileSpreadsheet, Filter, ChevronDown, ChevronRight } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useInView } from "react-intersection-observer"
import { usePlanApproximateCostInfinite } from "../hooks/useProductionPlanning"
import { ProductionPlan, ApproximateCostItem, ApproximateCostIngredient } from "../types"
import { formatAmount, formatNumber, useLocalizedFormatters } from "@/lib/formatters"
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts"
import { adminApi, type KitchenStation } from "@/features/admin/services/adminApi"
import { AsyncPdfExportButton } from "@/components/AsyncPdfExportButton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const COST_COL_COUNT = 6
const COST_ROW_PRODUCT_PX = 52
const COST_ROW_INGREDIENT_PX = 40
const COST_ROW_SUBHEADER_PX = 32
const COST_VIRTUAL_OVERSCAN = 10

type CostFlatRow =
  | { kind: "product"; item: ApproximateCostItem }
  | { kind: "subheader" }
  | { kind: "ingredient"; ingredient: ApproximateCostIngredient }

interface ApproximateCostModalProps {
  isOpen: boolean
  onClose: () => void
  plan: ProductionPlan | null
}

export function ApproximateCostModal({ isOpen, onClose, plan }: ApproximateCostModalProps) {
  const t = useTranslations("production.approximateCostModal")
  const { formatDate: formatDateLocalized } = useLocalizedFormatters()
  const canViewAmounts = useCanViewAmounts()
  const [selectedStationId, setSelectedStationId] = useState<string | null>("all")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [stations, setStations] = useState<KitchenStation[]>([])
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)

  const setScrollContainer = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node
    setScrollEl(node)
  }, [])

  const stationFilter =
    selectedStationId === "all" || !selectedStationId ? undefined : selectedStationId

  useEffect(() => {
    if (isOpen && plan?.branch) {
      adminApi.getStations({ branch_id: plan.branch }).then((res) => {
        if (Array.isArray(res)) {
          setStations(res)
        }
      })
    }
  }, [isOpen, plan?.branch])

  useEffect(() => {
    if (!isOpen) {
      setExpandedIds(new Set())
    }
  }, [isOpen, plan?.id, stationFilter])

  const toggleExpanded = useCallback((lineId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(lineId)) next.delete(lineId)
      else next.add(lineId)
      return next
    })
  }, [])

  const {
    data: costPages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePlanApproximateCostInfinite(plan?.id || "", stationFilter, {
    enabled: isOpen && !!plan?.id,
  })

  const items = useMemo(
    () => costPages?.pages.flatMap((p) => p.items) ?? [],
    [costPages]
  )

  const flatRows = useMemo((): CostFlatRow[] => {
    const out: CostFlatRow[] = []
    for (const item of items) {
      out.push({ kind: "product", item })
      if (
        expandedIds.has(item.line_id) &&
        item.has_recipe &&
        item.ingredients?.length
      ) {
        out.push({ kind: "subheader" })
        for (const ingredient of item.ingredients) {
          out.push({ kind: "ingredient", ingredient })
        }
      }
    }
    return out
  }, [items, expandedIds])

  const meta = costPages?.pages[0]
  const grandTotal = meta?.grand_total ?? 0

  const { ref: loadMoreRef, inView } = useInView({
    root: scrollEl,
    rootMargin: "0px 0px 240px 0px",
  })

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage])

  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = flatRows[index]
      if (!row) return COST_ROW_PRODUCT_PX
      if (row.kind === "product") return COST_ROW_PRODUCT_PX
      if (row.kind === "subheader") return COST_ROW_SUBHEADER_PX
      return COST_ROW_INGREDIENT_PX
    },
    overscan: COST_VIRTUAL_OVERSCAN,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()
  const paddingTop =
    flatRows.length > 0 && virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0
  const paddingBottom =
    flatRows.length > 0 && virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0

  const stationLabel =
    selectedStationId === "all"
      ? t("allStations")
      : stations.find((s) => s.id === selectedStationId)?.name || t("allStations")

  const warehouseName = meta?.warehouse_name || t("warehouseFallback")
  const unitCostColumnLabel = t("unitCostWarehouseLabel", { warehouse: warehouseName })

  const exportParams = {
    plan_id: plan?.id,
    station_id: stationFilter,
    station_name: stationLabel,
  }

  const handleDownloadExcel = async () => {
    if (!plan) return
    toast.loading(t("toastExcelPreparing"), { id: "approx-cost-export" })
    try {
      const blob = await adminApi.generateModuleReport(
        "production-plan-approximate-cost",
        exportParams,
        "excel"
      )
      const url = window.URL.createObjectURL(blob as Blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `Yaklasik_Maliyet_${plan.plan_date}.xlsx`
      a.click()
      window.URL.revokeObjectURL(url)
      toast.success(t("toastDownloaded"), { id: "approx-cost-export" })
    } catch {
      toast.error(t("toastExportError"), { id: "approx-cost-export" })
    }
  }

  const formattedDate = plan?.plan_date
    ? formatDateLocalized(plan.plan_date, { dateStyle: "short" })
    : ""

  const renderFlatRow = (row: CostFlatRow) => {
    if (row.kind === "product") {
      const item = row.item
      const expanded = expandedIds.has(item.line_id)
      const canExpand = item.has_recipe && (item.ingredients?.length ?? 0) > 0
      return (
        <tr
          className={cn(
            "border-b border-border transition-colors hover:bg-muted/20",
            canExpand && "cursor-pointer",
            expanded && "bg-emerald-50/30 dark:bg-emerald-900/10"
          )}
          onClick={canExpand ? () => toggleExpanded(item.line_id) : undefined}
        >
          <td className="px-2 py-2 text-center w-10">
            {canExpand ? (
              expanded ? (
                <ChevronDown size={16} className="text-emerald-600 mx-auto" />
              ) : (
                <ChevronRight size={16} className="text-muted-foreground mx-auto" />
              )
            ) : null}
          </td>
          <td className="px-4 py-2 font-medium text-foreground">{item.product_name}</td>
          <td className="px-4 py-2 text-xs text-muted-foreground">{item.station_name}</td>
          <td className="px-4 py-2 text-right">{item.quantity}</td>
          <td className="px-4 py-2 text-right text-muted-foreground">
            {item.has_recipe ? (
              formatAmount(item.unit_cost, canViewAmounts)
            ) : (
              <span className="italic text-xs">{t("noRecipe")}</span>
            )}
          </td>
          <td className="px-4 py-2 text-right font-semibold text-foreground">
            {formatAmount(item.line_total, canViewAmounts)}
          </td>
        </tr>
      )
    }

    if (row.kind === "subheader") {
      return (
        <tr className="bg-background">
          <td className="w-10" />
          <td className="px-4 py-1 text-2xs font-bold text-muted-foreground uppercase">
            {t("ingredientColumns.stockItem")}
          </td>
          <td />
          <td className="px-4 py-1 text-right text-2xs font-bold text-muted-foreground uppercase">
            {t("ingredientColumns.quantity")}
          </td>
          <td className="px-4 py-1 text-right text-2xs font-bold text-muted-foreground uppercase">
            {unitCostColumnLabel}
          </td>
          <td className="px-4 py-1 text-right text-2xs font-bold text-muted-foreground uppercase">
            {t("ingredientColumns.lineTotal")}
          </td>
        </tr>
      )
    }

    const ing = row.ingredient
    return (
      <tr
        className="border-b border-border bg-background text-xs"
      >
        <td className="w-10" />
        <td className="px-4 py-1.5 pl-6 text-muted-foreground">{ing.stock_item_name}</td>
        <td />
        <td className="px-4 py-1.5 text-right">
          {formatNumber(ing.quantity, 3)} {ing.unit}
        </td>
        <td className="px-4 py-1.5 text-right text-muted-foreground">
          {formatAmount(ing.unit_cost, canViewAmounts)}
        </td>
        <td className="px-4 py-1.5 text-right font-medium">
          {formatAmount(ing.line_total, canViewAmounts)}
        </td>
      </tr>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent layout="scroll" size="7xl" className="max-h-[90vh]">
        <DialogHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <DialogTitle>{t("title")}</DialogTitle>
              {plan?.plan_date && (
                <p className="text-sm text-muted-foreground">
                  {t("subtitle", {
                    date: formattedDate,
                    branch: plan?.branch_name || t("branchFallback"),
                  })}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
                <Filter size={14} className="text-muted-foreground" />
                <Select
                  value={selectedStationId}
                  onValueChange={setSelectedStationId}
                  disabled={stations.length === 0}
                >
                  <SelectTrigger className="h-8 border-none bg-transparent focus:ring-0 w-[180px] p-0 text-xs font-medium">
                    <SelectValue placeholder={t("filterStations")}>{stationLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("allStations")}</SelectItem>
                    {stations.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <AsyncPdfExportButton
                reportSlug="production-plan-approximate-cost"
                params={exportParams}
                filename={`Yaklasik_Maliyet_${plan?.plan_date}.pdf`}
                size="sm"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-2"
                onClick={handleDownloadExcel}
                disabled={isLoading || items.length === 0}
              >
                <FileSpreadsheet size={16} />
                {t("excelReport")}
              </Button>
            </div>
          </div>

          {meta && !isLoading && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                  {t("infoWarehouse")}
                </span>
                <p className="font-medium text-foreground">{meta.warehouse_name}</p>
              </div>
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                  {t("infoStation")}
                </span>
                <p className="font-medium text-foreground">{stationLabel}</p>
              </div>
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                  {t("infoPlanDate")}
                </span>
                <p className="font-medium text-foreground">{formattedDate}</p>
              </div>
            </div>
          )}
          {meta && !isLoading && (
            <p className="mt-3 text-xs text-muted-foreground">{t("costBasisHint", { warehouse: warehouseName })}</p>
          )}
        </DialogHeader>

        <DialogBody ref={setScrollContainer} className="min-h-0 flex-1 overflow-auto py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">{t("empty")}</div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
                  <tr>
                    <th className="w-10" />
                    <th className="text-left px-4 py-2 font-medium">{t("columns.product")}</th>
                    <th className="text-left px-4 py-2 font-medium">{t("columns.station")}</th>
                    <th className="text-right px-4 py-2 font-medium">{t("columns.quantity")}</th>
                    <th className="text-right px-4 py-2 font-medium max-w-[140px] leading-tight">
                      {unitCostColumnLabel}
                    </th>
                    <th className="text-right px-4 py-2 font-medium">{t("columns.lineTotal")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paddingTop > 0 && (
                    <tr aria-hidden>
                      <td
                        colSpan={COST_COL_COUNT}
                        style={{ height: paddingTop, padding: 0, border: "none" }}
                      />
                    </tr>
                  )}
                  {virtualItems.map((virtualRow) => {
                    const row = flatRows[virtualRow.index]
                    if (!row) return null
                    return (
                      <React.Fragment key={virtualRow.key}>
                        {renderFlatRow(row)}
                      </React.Fragment>
                    )
                  })}
                  {paddingBottom > 0 && (
                    <tr aria-hidden>
                      <td
                        colSpan={COST_COL_COUNT}
                        style={{ height: paddingBottom, padding: 0, border: "none" }}
                      />
                    </tr>
                  )}
                  {hasNextPage && (
                    <tr ref={loadMoreRef}>
                      <td
                        colSpan={COST_COL_COUNT}
                        className="border-t border-border py-3 text-center text-xs text-muted-foreground"
                      >
                        {isFetchingNextPage ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                            {t("loadingMore")}
                          </span>
                        ) : (
                          t("scrollForMore")
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </DialogBody>

        <DialogFooter className="flex-row flex-wrap items-center justify-between gap-3 sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {t("productCount", { count: meta?.count ?? items.length })}
          </span>
          <div className="text-right">
            <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider block">
              {t("grandTotalLabel")}
            </span>
            <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
              {formatAmount(grandTotal, canViewAmounts)}
            </span>
          </div>
          <Button onClick={onClose} variant="outline">
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
