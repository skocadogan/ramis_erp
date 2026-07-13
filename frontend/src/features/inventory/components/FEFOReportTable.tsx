"use client"

import React, { forwardRef, memo } from "react"
import { useInView } from "react-intersection-observer"
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual"
import { useTranslations } from "next-intl"
import { Loader2, Package, ExternalLink } from "lucide-react"
import { FEFOReportListItem } from "@/features/inventory/types"
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts"
import { formatCurrency, formatAmount } from "@/lib/formatters"
import { useMatchMedia } from "@/hooks/useMatchMedia"
import {
  FEFO_ROW_ESTIMATE_MAIN_PX,
  getInventoryVirtualOverscan,
  INVENTORY_VIRTUAL_LG_QUERY,
} from "@/features/inventory/components/inventoryTableVirtual"

interface FEFOReportTableProps {
  reportData: FEFOReportListItem[]
  fetchNextPage: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isLoading: boolean
  onOpenLotDetails?: (item: FEFOReportListItem) => void
}

const FEFO_COL_SPAN = 7

const FefoMainRow = memo(
  forwardRef<
    HTMLTableRowElement,
    {
      item: FEFOReportListItem
      onOpenLotDetails?: (item: FEFOReportListItem) => void
      virtualRow: VirtualItem
    }
  >(function FefoMainRow({ item, onOpenLotDetails, virtualRow }, ref) {
    const t = useTranslations("inventory.fefoTable")
    const canViewAmounts = useCanViewAmounts()

    return (
      <tr
        ref={ref}
        data-index={virtualRow.index}
        className="border-b border-border transition-colors hover:bg-muted/20"
      >
        <td className="px-4 py-2">
          <div className="flex flex-col">
            <span className="font-medium text-foreground">{item.name}</span>
            <span className="text-2xs font-mono uppercase text-muted-foreground">{item.sku}</span>
          </div>
        </td>
        <td className="px-4 py-2 text-xs text-muted-foreground">{item.category_name}</td>
        <td className="px-4 py-2 text-xs text-muted-foreground">{item.unit}</td>
        <td className="px-4 py-2 text-right font-medium text-foreground">
          {item.total_quantity.toFixed(2)}
        </td>
        <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
          {item.total_quantity > 0 && canViewAmounts
            ? formatCurrency(item.total_value / item.total_quantity)
            : "-"}
        </td>
        <td className="px-4 py-2 text-right font-semibold text-foreground">
          {formatAmount(item.total_value, canViewAmounts)}
        </td>
        <td className="px-4 py-2 text-right">
          <button
            type="button"
            onClick={() => onOpenLotDetails?.(item)}
            className="group rounded-md p-1.5 text-muted-foreground transition-all hover:bg-muted/20 hover:text-foreground"
            title={t("colDetail")}
          >
            <ExternalLink size={16} className="transition-transform group-hover:scale-110" />
          </button>
        </td>
      </tr>
    )
  })
)

export const FEFOReportTable = memo(({
  reportData,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  onOpenLotDetails,
}: FEFOReportTableProps) => {
  const t = useTranslations("inventory.fefoTable")
  const { ref: fetchSentinelRef, inView } = useInView()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const isLg = useMatchMedia(INVENTORY_VIRTUAL_LG_QUERY, false)
  const overscan = getInventoryVirtualOverscan(isLg, "fefo")

  const rowVirtualizer = useVirtualizer({
    count: reportData.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => FEFO_ROW_ESTIMATE_MAIN_PX,
    overscan,
    getItemKey: (index) => reportData[index]?.id ?? index,
  })

  React.useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage])

  const virtualItems = rowVirtualizer.getVirtualItems()
  const paddingTop =
    reportData.length > 0 && virtualItems.length > 0 ? virtualItems[0]?.start ?? 0 : 0
  const paddingBottom =
    reportData.length > 0 && virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-auto rounded-lg border border-border"
    >
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left font-medium">{t("colProductSku")}</th>
            <th className="px-4 py-2 text-left font-medium">{t("colCategory")}</th>
            <th className="px-4 py-2 text-left font-medium">{t("colUnit")}</th>
            <th className="px-4 py-2 text-right font-medium">{t("colStockTotal")}</th>
            <th className="px-4 py-2 text-right font-medium">{t("colAvgCost")}</th>
            <th className="px-4 py-2 text-right font-medium">{t("colFefoValue")}</th>
            <th className="px-4 py-2 text-right font-medium">{t("colDetail")}</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && reportData.length === 0 ? (
            <tr>
              <td colSpan={FEFO_COL_SPAN} className="py-24 text-center">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
                  <span className="text-sm text-muted-foreground">{t("reportPreparing")}</span>
                </div>
              </td>
            </tr>
          ) : reportData.length === 0 ? (
            <tr>
              <td colSpan={FEFO_COL_SPAN} className="py-24 text-center">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Package size={48} strokeWidth={1} />
                  <span>{t("emptyStock")}</span>
                </div>
              </td>
            </tr>
          ) : (
            <>
              {paddingTop > 0 && (
                <tr aria-hidden>
                  <td colSpan={FEFO_COL_SPAN} style={{ height: paddingTop }} />
                </tr>
              )}
              {virtualItems.map((virtualRow) => {
                const item = reportData[virtualRow.index]
                if (!item) return null
                return (
                  <FefoMainRow
                    key={virtualRow.key}
                    ref={rowVirtualizer.measureElement}
                    virtualRow={virtualRow}
                    item={item}
                    onOpenLotDetails={onOpenLotDetails}
                  />
                )
              })}
              {paddingBottom > 0 && (
                <tr aria-hidden>
                  <td colSpan={FEFO_COL_SPAN} style={{ height: paddingBottom }} />
                </tr>
              )}
              {hasNextPage && (
                <tr ref={fetchSentinelRef}>
                  <td colSpan={FEFO_COL_SPAN} className="py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-600" />
                  </td>
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  )
})

FEFOReportTable.displayName = "FEFOReportTable"
