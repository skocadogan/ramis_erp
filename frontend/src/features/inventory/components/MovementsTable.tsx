"use client"

import React from "react"
import { useInView } from "react-intersection-observer"
import { useVirtualizer } from "@tanstack/react-virtual"
import { StockMovement } from "@/features/inventory/types"
import { Trash2, Loader2 } from "lucide-react"
import { formatDate, formatQuantityWithUnit } from "@/lib/formatters"
import {
  formatStockMovementReference,
  formatStockMovementQuantitySign,
  getStockMovementSignedQuantity,
  getStockMovementTypeLabel,
  stockMovementQuantityTextClass,
  stockMovementTypeBadgeClass,
} from "@/lib/stockMovementDisplay"
import { useMatchMedia } from "@/hooks/useMatchMedia"
import {
  getInventoryVirtualOverscan,
  INVENTORY_MOVEMENT_ROW_ESTIMATE_PX,
  INVENTORY_VIRTUAL_LG_QUERY,
} from "@/features/inventory/components/inventoryTableVirtual"
import { useTranslations } from "next-intl"

const MOV_COL_SPAN = 7

interface MovementsTableProps {
  movements: StockMovement[]
  openDeleteDialog: (id: string) => void
  fetchNextPage: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isLoading?: boolean
}

export function MovementsTable({ 
  movements, 
  openDeleteDialog, 
  fetchNextPage, 
  hasNextPage, 
  isFetchingNextPage,
  isLoading
}: MovementsTableProps) {
  const t = useTranslations("inventory")
  const tReason = useTranslations("inventory.returnCancelReason")
  const { ref: fetchSentinelRef, inView } = useInView()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const isLg = useMatchMedia(INVENTORY_VIRTUAL_LG_QUERY, false)
  const overscan = getInventoryVirtualOverscan(isLg, "movements")

  const rowVirtualizer = useVirtualizer({
    count: movements.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => INVENTORY_MOVEMENT_ROW_ESTIMATE_PX,
    overscan,
  })

  React.useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage()
    }
  }, [inView, hasNextPage, fetchNextPage])

  const virtualItems = rowVirtualizer.getVirtualItems()
  const paddingTop =
    movements.length > 0 && virtualItems.length > 0 ? virtualItems[0]?.start ?? 0 : 0
  const paddingBottom =
    movements.length > 0 && virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0

  return (
    <div
      ref={scrollRef}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto rounded-lg border border-border"
    >
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2 font-medium">{t("movementsTable.colDate")}</th>
            <th className="text-left px-4 py-2 font-medium">{t("movementsTable.colProduct")}</th>
            <th className="text-left px-4 py-2 font-medium">{t("movementsTable.colType")}</th>
            <th className="text-right px-4 py-2 font-medium">{t("movementsTable.colQty")}</th>
            <th className="text-left px-4 py-2 font-medium">{t("movementsTable.colRef")}</th>
            <th className="text-left px-4 py-2 font-medium">{t("movementsTable.colNotes")}</th>
            <th className="text-right px-4 py-2 font-medium">{t("movementsTable.colAction")}</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && movements.length === 0 ? (
            <tr>
              <td colSpan={MOV_COL_SPAN} className="text-center py-12">
                <div className="flex flex-col items-center gap-2">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                  <span className="text-sm text-muted-foreground font-medium">{t("movementsTable.loading")}</span>
                </div>
              </td>
            </tr>
          ) : movements.length === 0 ? (
            <tr><td colSpan={MOV_COL_SPAN} className="py-12 text-center text-muted-foreground">{t("movementsTable.empty")}</td></tr>
          ) : (
            <>
              {paddingTop > 0 && (
                <tr aria-hidden>
                  <td colSpan={MOV_COL_SPAN} style={{ height: paddingTop }} />
                </tr>
              )}
              {virtualItems.map((virtualRow) => {
                const m = movements[virtualRow.index]
                return (
                  <tr
                    key={m.id}
                    className="border-b border-border transition-colors hover:bg-muted/20"
                  >
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{formatDate(m.created_at)}</td>
                    <td className="px-4 py-2 font-medium text-foreground">{m.stock_item_name}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${stockMovementTypeBadgeClass(m.movement_type)}`}>
                        {getStockMovementTypeLabel(m.movement_type, (key) => t(`movementType.${key}`))}
                      </span>
                    </td>
                    <td className={`px-4 py-2 text-right font-semibold ${stockMovementQuantityTextClass(m)}`}>
                      {formatStockMovementQuantitySign(m)}
                      {formatQuantityWithUnit(Math.abs(getStockMovementSignedQuantity(m)), m.unit)}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {formatStockMovementReference(m.reference, null, (key) => tReason(key))}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2 text-muted-foreground">{m.notes || "-"}</td>
                    <td className="px-4 py-2 text-right">
                      <button type="button" onClick={() => openDeleteDialog(m.id)} className="rounded-md p-1.5 text-muted-foreground transition-all hover:bg-muted/20 hover:text-rose-600">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {paddingBottom > 0 && (
                <tr aria-hidden>
                  <td colSpan={MOV_COL_SPAN} style={{ height: paddingBottom }} />
                </tr>
              )}
              <tr ref={fetchSentinelRef}>
                <td colSpan={MOV_COL_SPAN} className="px-3 py-4 text-center">
                  {isFetchingNextPage ? (
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 size={16} className="animate-spin text-emerald-600" />
                      {t("movementsTable.loadingMore")}
                    </div>
                  ) : hasNextPage ? (
                    <span className="text-xs text-muted-foreground">{t("movementsTable.loadMore")}</span>
                  ) : null}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}
