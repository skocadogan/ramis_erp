"use client"

import React, { memo, useEffect } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { format } from "date-fns"
import { Loader2, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import type { StockMovement } from "@/features/inventory/types"

type InfiniteControls = {
  hasNextPage?: boolean
  isFetchingNextPage?: boolean
  fetchNextPage: () => void
}

type ReturnCancelTableProps = {
  rows: StockMovement[]
  canManage: boolean
  onSelect?: (row: StockMovement) => void
  onDelete?: (row: StockMovement) => void
  infiniteControls?: InfiniteControls
}

function reasonLabel(t: ReturnType<typeof useTranslations>, code?: string | null, notes?: string | null) {
  if (code && code in { EXPIRED: 1, DAMAGED: 1, SUPPLIER_ERROR: 1, ORDER_CANCELLED: 1, QUALITY_ISSUE: 1, RECALL: 1, OTHER: 1 }) {
    return t(`reasons.${code}` as "reasons.EXPIRED")
  }
  return notes || code || "—"
}

const ReturnCancelRow = memo(function ReturnCancelRow({
  row,
  index,
  canManage,
  onSelect,
  onDelete,
  measureElement,
}: {
  row: StockMovement
  index: number
  canManage: boolean
  onSelect?: (row: StockMovement) => void
  onDelete?: (row: StockMovement) => void
  measureElement?: (el: HTMLElement | null) => void
}) {
  const t = useTranslations("warehouse_return_cancel")
  const qty = row.quantity
  const price = row.unit_price || 0
  const currency = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" })
  const isReturn = row.movement_type === "RETURN"

  return (
    <tr
      data-index={index}
      ref={measureElement}
      onClick={() => onSelect?.(row)}
      className={cn(
        "transition-colors hover:/50 dark:hover:/30",
        onSelect && "cursor-pointer",
      )}
    >
      <td className="whitespace-nowrap px-4 py-3 text-foreground">
        {format(new Date(row.created_at), "dd.MM.yyyy HH:mm")}
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold",
            isReturn
              ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
              : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
          )}
        >
          {isReturn ? t("movementTypeReturn") : t("movementTypeCancel")}
        </span>
      </td>
      <td className="px-4 py-3 font-medium text-foreground">{row.stock_item_name}</td>
      <td className="px-4 py-3 text-muted-foreground">{row.warehouse_name}</td>
      <td className="px-4 py-3 text-right font-semibold tabular-nums text-rose-600 dark:text-rose-400">
        {qty} {row.unit}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-foreground">{currency.format(price)}</td>
      <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
        {currency.format(qty * price)}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {reasonLabel(t, row.reference, row.notes)}
      </td>
      <td className="max-w-[160px] truncate px-4 py-3 text-muted-foreground" title={row.notes || ""}>
        {row.notes || "—"}
      </td>
      <td className="px-4 py-3 text-muted-foreground">{row.supplier_name || "—"}</td>
      {canManage ? (
        <td className="px-3 py-3 text-right">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete?.(row)
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label={t("delete")}
          >
            <Trash2 size={16} />
          </button>
        </td>
      ) : null}
    </tr>
  )
})

export const ReturnCancelTable = memo(function ReturnCancelTable({
  rows,
  canManage,
  onSelect,
  onDelete,
  infiniteControls,
}: ReturnCancelTableProps) {
  const t = useTranslations("warehouse_return_cancel")
  const containerRef = React.useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 56,
    overscan: 8,
    measureElement: (el) => el.getBoundingClientRect().height,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1]
    if (!lastItem || !infiniteControls) return
    if (
      lastItem.index >= rows.length - 1 &&
      infiniteControls.hasNextPage &&
      !infiniteControls.isFetchingNextPage
    ) {
      infiniteControls.fetchNextPage()
    }
  }, [virtualItems, rows.length, infiniteControls])

  const headers = [
    t("colDateTime"),
    t("colType"),
    t("colProduct"),
    t("colWarehouse"),
    t("colQuantity"),
    t("colUnitCost"),
    t("colTotal"),
    t("colReason"),
    t("colNotes"),
    t("colSupplier"),
  ]
  if (canManage) headers.push(t("colActions"))

  if (rows.length === 0 && !infiniteControls?.isFetchingNextPage) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 text-muted-foreground">
        <p className="text-sm font-medium">{t("empty")}</p>
      </div>
    )
  }

  const paddingTop = virtualItems.length > 0 ? virtualItems[0]?.start || 0 : 0
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end || 0)
      : 0

  return (
    <div
      ref={containerRef}
      className="min-h-0 flex-1 overflow-auto rounded-xl border border-border/80 bg-card/50 border-border"
    >
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 border-b border-border bg-muted/50">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground first:text-left last:text-right"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {paddingTop > 0 ? (
            <tr>
              <td colSpan={headers.length} style={{ height: `${paddingTop}px` }} />
            </tr>
          ) : null}
          {virtualItems.map((virtualRow) => {
            const row = rows[virtualRow.index]
            return (
              <ReturnCancelRow
                key={row.id}
                row={row}
                index={virtualRow.index}
                canManage={canManage}
                onSelect={onSelect}
                onDelete={onDelete}
                measureElement={rowVirtualizer.measureElement}
              />
            )
          })}
          {paddingBottom > 0 ? (
            <tr>
              <td colSpan={headers.length} style={{ height: `${paddingBottom}px` }} />
            </tr>
          ) : null}
          {infiniteControls?.isFetchingNextPage ? (
            <tr>
              <td colSpan={headers.length} className="py-4">
                <div className="flex items-center justify-center gap-2 text-blue-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs font-medium">{t("loadingMore")}</span>
                </div>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
})
