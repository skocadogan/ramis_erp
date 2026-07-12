"use client"

import React, { memo, useEffect } from "react"
import { useInView } from "react-intersection-observer"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Loader2, MoreHorizontal } from "lucide-react"
import { useTranslations } from "next-intl"

import { formatQuantity } from "@/lib/formatters"
import { useMatchMedia } from "@/hooks/useMatchMedia"
import {
  getInventoryVirtualOverscan,
  INVENTORY_ITEM_ROW_ESTIMATE_PX,
  INVENTORY_VIRTUAL_LG_QUERY,
} from "@/features/inventory/components/inventoryTableVirtual"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { ExpiringLot, ExpiryActionType } from "@/features/warehouse/types"

const COL_SPAN = 7

type ExpiringLotRowProps = {
  lot: ExpiringLot
  canManage: boolean
  canManageReturnCancel: boolean
  onAction: (lot: ExpiringLot, actionType: ExpiryActionType) => void
  onAutoReturnCancel: (lot: ExpiringLot) => void
  onSelectLot: (lot: ExpiringLot) => void
  selectedLotId?: string
}

const ExpiringLotRow = memo(function ExpiringLotRow({
  lot,
  canManage,
  canManageReturnCancel,
  onAction,
  onAutoReturnCancel,
  onSelectLot,
  selectedLotId,
}: ExpiringLotRowProps) {
  const t = useTranslations("warehouse")
  const isCritical = lot.is_expired || (lot.days_until_expiry != null && lot.days_until_expiry <= 1)
  const isWarning = !isCritical && lot.days_until_expiry != null && lot.days_until_expiry <= 3

  return (
    <tr
      className={cn(
        "border-b border-border hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer",
        selectedLotId === lot.id && "bg-blue-50/50 dark:bg-blue-950/20",
        isCritical && "bg-rose-50/40 dark:bg-rose-950/10",
        isWarning && "bg-amber-50/30 dark:bg-amber-950/10",
      )}
      onClick={() => onSelectLot(lot)}
    >
      <td className="px-4 py-3">
        <div className="font-ui-medium text-slate-900 dark:text-slate-200">{lot.stock_item_name}</div>
        <div className="text-xs text-muted-foreground">{lot.stock_item_sku}</div>
      </td>
      <td className="px-4 py-3 text-foreground">{lot.warehouse_name}</td>
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{lot.lot_number || "—"}</td>
      <td className="px-4 py-3 text-foreground">
        {lot.expiry_date ?? "—"}
        {lot.days_until_expiry != null ? (
          <span
            className={cn(
              "ml-2 text-xs",
              lot.is_expired ? "text-rose-600" : isWarning || isCritical ? "text-amber-600" : "text-muted-foreground",
            )}
          >
            ({lot.is_expired ? t("expiringLots.expired") : t("expiringLots.daysLeft", { count: lot.days_until_expiry })})
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3 text-right font-ui-semibold tabular-nums text-slate-900 dark:text-slate-200">
        {formatQuantity(lot.quantity)}
      </td>
      <td className="px-4 py-3 text-center">
        {lot.risk_score != null ? (
          <span
            className={cn(
              "inline-flex min-w-[2rem] justify-center rounded-full px-2 py-0.5 text-xs font-ui-semibold tabular-nums",
              lot.risk_score >= 80
                ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
                : lot.risk_score >= 50
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
            )}
          >
            {lot.risk_score}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-3 text-right">
        {canManage || (lot.is_expired && canManageReturnCancel) ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label={t("expiryActions.menuAria", { name: lot.stock_item_name })}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {canManage ? (
                <>
                  <DropdownMenuItem onClick={() => onAction(lot, "PRIORITY_CONSUME")}>
                    {t("expiryActions.priorityConsume")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAction(lot, "TRANSFER_SUGGEST")}>
                    {t("expiryActions.transferSuggest")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAction(lot, "PLAN_NOTE")}>
                    {t("expiryActions.planNote")}
                  </DropdownMenuItem>
                </>
              ) : null}
              {lot.is_expired && canManageReturnCancel ? (
                <DropdownMenuItem onClick={() => onAutoReturnCancel(lot)}>
                  {t("expiryActions.autoReturnCancel")}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </td>
    </tr>
  )
})

export type ExpiringLotsTableProps = {
  rows: ExpiringLot[]
  canManage: boolean
  canManageReturnCancel: boolean
  isLoading: boolean
  selectedLotId?: string
  onSelectLot: (lot: ExpiringLot) => void
  onAction: (lot: ExpiringLot, actionType: ExpiryActionType) => void
  onAutoReturnCancel: (lot: ExpiringLot) => void
  fetchNextPage: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
}

export const ExpiringLotsTable = memo(function ExpiringLotsTable({
  rows,
  canManage,
  canManageReturnCancel,
  isLoading,
  selectedLotId,
  onSelectLot,
  onAction,
  onAutoReturnCancel,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: ExpiringLotsTableProps) {
  const t = useTranslations("warehouse")
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
        <thead className="sticky top-0 z-10 border-b border-border bg-slate-50 dark:bg-slate-800/50">
          <tr>
            <th className="px-4 py-3 text-left font-ui-semibold text-muted-foreground">{t("expiringLots.colProduct")}</th>
            <th className="px-4 py-3 text-left font-ui-semibold text-muted-foreground">{t("expiringLots.colWarehouse")}</th>
            <th className="px-4 py-3 text-left font-ui-semibold text-muted-foreground">{t("expiringLots.colLot")}</th>
            <th className="px-4 py-3 text-left font-ui-semibold text-muted-foreground">{t("expiringLots.colExpiry")}</th>
            <th className="px-4 py-3 text-right font-ui-semibold text-muted-foreground">{t("expiringLots.colRemaining")}</th>
            <th className="px-4 py-3 text-center font-ui-semibold text-muted-foreground">{t("expiringLots.colRisk")}</th>
            <th className="px-3 py-3 text-right font-ui-semibold text-muted-foreground w-12" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading && rows.length === 0 ? (
            <tr>
              <td colSpan={COL_SPAN} className="py-12 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={COL_SPAN} className="py-12 text-center text-muted-foreground">
                {t("expiringLots.empty")}
              </td>
            </tr>
          ) : (
            <>
              {paddingTop > 0 ? (
                <tr aria-hidden>
                  <td colSpan={COL_SPAN} style={{ height: paddingTop }} />
                </tr>
              ) : null}
              {virtualItems.map((virtualRow) => {
                const lot = rows[virtualRow.index]
                if (!lot) return null
                return (
                  <ExpiringLotRow
                    key={lot.id}
                    lot={lot}
                    canManage={canManage}
                    canManageReturnCancel={canManageReturnCancel}
                    onAction={onAction}
                    onAutoReturnCancel={onAutoReturnCancel}
                    onSelectLot={onSelectLot}
                    selectedLotId={selectedLotId}
                  />
                )
              })}
              {paddingBottom > 0 ? (
                <tr aria-hidden>
                  <td colSpan={COL_SPAN} style={{ height: paddingBottom }} />
                </tr>
              ) : null}
              <tr ref={fetchSentinelRef}>
                <td colSpan={COL_SPAN} className="py-2 text-center text-xs text-muted-foreground">
                  {isFetchingNextPage ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : null}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  )
})
