"use client"

import React, { memo, useEffect } from "react"
import { useInView } from "react-intersection-observer"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"

import { formatQuantityWithUnit } from "@/lib/formatters"
import { useMatchMedia } from "@/hooks/useMatchMedia"
import {
  getInventoryVirtualOverscan,
  INVENTORY_ITEM_ROW_ESTIMATE_PX,
  INVENTORY_VIRTUAL_LG_QUERY,
} from "@/features/inventory/components/inventoryTableVirtual"
import { cn } from "@/lib/utils"
import type { PurchaseRecommendation } from "@/features/warehouse/types"

const COL_SPAN_WITH_COMMIT = 8
const COL_SPAN_VIEW_ONLY = 6

function UrgencyBadge({ urgency }: { urgency: PurchaseRecommendation["urgency"] }) {
  const t = useTranslations("warehouse")
  if (urgency === "ok") return null
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-ui-semibold uppercase tracking-wide",
        urgency === "critical"
          ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
          : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
      )}
    >
      {t(`purchaseRecommendationsTab.urgency.${urgency}`)}
    </span>
  )
}

type RecommendationRowProps = {
  row: PurchaseRecommendation
  canCommit: boolean
  selected: boolean
  orderQty: string
  onToggleSelect: (checked: boolean) => void
  onOrderQtyChange: (value: string) => void
}

const RecommendationRow = memo(function RecommendationRow({
  row,
  canCommit,
  selected,
  orderQty,
  onToggleSelect,
  onOrderQtyChange,
}: RecommendationRowProps) {
  const t = useTranslations("warehouse")

  return (
    <tr
      className={cn(
        "border-b border-border hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors",
        row.is_low_stock && "bg-amber-50/40 dark:bg-amber-950/10",
      )}
    >
      {canCommit ? (
        <td className="px-3 py-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onToggleSelect(e.target.checked)}
            aria-label={row.stock_item_name}
          />
        </td>
      ) : null}
      <td className="px-4 py-3">
        <div className="font-ui-medium text-slate-900 dark:text-slate-200">{row.stock_item_name}</div>
        <div className="text-xs text-muted-foreground">{row.stock_item_sku}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <UrgencyBadge urgency={row.urgency} />
        </div>
        {row.suppliers.length === 0 ? (
          <div className="text-xs text-amber-600 mt-1">{t("purchaseRecommendationsTab.noSupplier")}</div>
        ) : null}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {formatQuantityWithUnit(row.current_quantity, row.unit)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {formatQuantityWithUnit(row.in_transit_quantity, row.unit)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {formatQuantityWithUnit(row.weekly_average_consumption, row.unit)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
        {row.estimated_days_until_stockout != null
          ? t("purchaseRecommendationsTab.daysLeft", { days: row.estimated_days_until_stockout })
          : "—"}
      </td>
      <td className="px-4 py-3 text-right font-ui-semibold tabular-nums text-slate-900 dark:text-slate-200">
        {formatQuantityWithUnit(row.recommended_quantity, row.unit)}
      </td>
      {canCommit ? (
        <td className="px-4 py-3 text-right">
          <input
            type="number"
            min={0}
            step="any"
            value={orderQty}
            onChange={(e) => onOrderQtyChange(e.target.value)}
            className="w-24 px-2 py-1 rounded border border-border bg-card text-right text-sm tabular-nums"
          />
        </td>
      ) : null}
    </tr>
  )
})

export type PurchaseRecommendationsTableProps = {
  rows: PurchaseRecommendation[]
  canCommit: boolean
  warehouseSelected: boolean
  selected: Record<string, boolean>
  overrides: Record<string, string>
  onToggleSelect: (stockItemId: string, checked: boolean) => void
  onToggleAll: (checked: boolean) => void
  onOverrideChange: (stockItemId: string, value: string) => void
  allSelected: boolean
  fetchNextPage: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isLoading: boolean
}

export const PurchaseRecommendationsTable = memo(function PurchaseRecommendationsTable({
  rows,
  canCommit,
  warehouseSelected,
  selected,
  overrides,
  onToggleSelect,
  onToggleAll,
  onOverrideChange,
  allSelected,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
}: PurchaseRecommendationsTableProps) {
  const t = useTranslations("warehouse")
  const colSpan = canCommit ? COL_SPAN_WITH_COMMIT : COL_SPAN_VIEW_ONLY
  const { ref: fetchSentinelRef, inView } = useInView()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const isLg = useMatchMedia(INVENTORY_VIRTUAL_LG_QUERY, false)
  const overscan = getInventoryVirtualOverscan(isLg, "items")

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => INVENTORY_ITEM_ROW_ESTIMATE_PX,
    overscan,
  })

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage])

  const virtualItems = rowVirtualizer.getVirtualItems()
  const paddingTop =
    rows.length > 0 && virtualItems.length > 0 ? virtualItems[0]?.start ?? 0 : 0
  const paddingBottom =
    rows.length > 0 && virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0

  return (
    <div
      ref={scrollRef}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto rounded-xl border border-border/80 bg-card/50 dark:border-slate-800"
    >
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/50 border-b border-border">
          <tr>
            {canCommit ? (
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onToggleAll(e.target.checked)}
                  aria-label={t("purchaseRecommendationsTab.selectAll")}
                />
              </th>
            ) : null}
            <th className="text-left px-4 py-3 font-ui-semibold text-muted-foreground">
              {t("purchaseRecommendationsTab.colProduct")}
            </th>
            <th className="text-right px-4 py-3 font-ui-semibold text-muted-foreground">
              {t("purchaseRecommendationsTab.colCurrent")}
            </th>
            <th className="text-right px-4 py-3 font-ui-semibold text-muted-foreground">
              {t("purchaseRecommendationsTab.colInTransit")}
            </th>
            <th className="text-right px-4 py-3 font-ui-semibold text-muted-foreground">
              {t("purchaseRecommendationsTab.colWeeklyAvg")}
            </th>
            <th className="text-right px-4 py-3 font-ui-semibold text-muted-foreground">
              {t("purchaseRecommendationsTab.colDaysLeft")}
            </th>
            <th className="text-right px-4 py-3 font-ui-semibold text-muted-foreground">
              {t("purchaseRecommendationsTab.colRecommended")}
            </th>
            {canCommit ? (
              <th className="text-right px-4 py-3 font-ui-semibold text-muted-foreground">
                {t("purchaseRecommendationsTab.colOrderQty")}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {!warehouseSelected ? (
            <tr>
              <td colSpan={colSpan} className="text-center py-12 text-muted-foreground">
                {t("purchaseRecommendationsTab.pickWarehouse")}
              </td>
            </tr>
          ) : isLoading && rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="text-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="text-center py-12 text-muted-foreground">
                {t("purchaseRecommendationsTab.empty")}
              </td>
            </tr>
          ) : (
            <>
              {paddingTop > 0 ? (
                <tr aria-hidden>
                  <td colSpan={colSpan} style={{ height: paddingTop }} />
                </tr>
              ) : null}
              {virtualItems.map((virtualRow) => {
                const row = rows[virtualRow.index]
                return (
                  <RecommendationRow
                    key={row.stock_item_id}
                    row={row}
                    canCommit={canCommit}
                    selected={!!selected[row.stock_item_id]}
                    orderQty={overrides[row.stock_item_id] ?? row.recommended_quantity}
                    onToggleSelect={(checked) => onToggleSelect(row.stock_item_id, checked)}
                    onOrderQtyChange={(value) => onOverrideChange(row.stock_item_id, value)}
                  />
                )
              })}
              {paddingBottom > 0 ? (
                <tr aria-hidden>
                  <td colSpan={colSpan} style={{ height: paddingBottom }} />
                </tr>
              ) : null}
              {hasNextPage ? (
                <tr ref={fetchSentinelRef}>
                  <td colSpan={colSpan} className="py-4 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-blue-600" />
                  </td>
                </tr>
              ) : null}
            </>
          )}
        </tbody>
      </table>
    </div>
  )
})
