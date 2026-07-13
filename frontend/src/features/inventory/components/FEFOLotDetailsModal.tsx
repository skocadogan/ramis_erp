"use client"

import React, { forwardRef, memo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FEFOReportListItem, StockLotDetail } from "@/features/inventory/types"
import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts"
import { formatAmount } from "@/lib/formatters"
import { cn } from "@/lib/utils"
import { Package, Calendar, Warehouse, Coins, Loader2 } from "lucide-react"
import { AsyncPdfExportButton } from "@/components/AsyncPdfExportButton"
import { useLocale, useTranslations } from "next-intl"
import { useMatchMedia } from "@/hooks/useMatchMedia"
import {
  FEFO_LOT_ROW_ESTIMATE_PX,
  getInventoryVirtualOverscan,
  INVENTORY_VIRTUAL_LG_QUERY,
} from "@/features/inventory/components/inventoryTableVirtual"

interface FEFOLotDetailsModalProps {
  item: FEFOReportListItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouseId?: string | null
}

const FEFO_LOT_COL_SPAN = 6

const FefoLotRow = memo(
  forwardRef<
    HTMLTableRowElement,
    {
      lot: StockLotDetail
      locale: string
      canViewAmounts: boolean
      virtualRow: VirtualItem
      noExpiryLabel: string
    }
  >(function FefoLotRow({ lot, locale, canViewAmounts, virtualRow, noExpiryLabel }, ref) {
    const isExpired = lot.expiry_date ? new Date(lot.expiry_date) < new Date() : false

    return (
      <tr
        ref={ref}
        data-index={virtualRow.index}
        className="transition-colors hover:bg-muted/40 dark:hover:bg-muted/25"
      >
        <td className="px-4 py-3 font-mono text-xs text-foreground/85">{lot.lot_number || "-"}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Calendar size={14} className={isExpired ? "text-rose-500" : "text-foreground/60"} />
            <span
              className={cn(
                isExpired ? "font-bold text-rose-600 dark:text-rose-400" : "text-foreground/80"
              )}
            >
              {lot.expiry_date ? new Date(lot.expiry_date).toLocaleDateString(locale) : noExpiryLabel}
            </span>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Warehouse size={14} className="text-foreground/60" />
            <span className="text-foreground/80">{lot.warehouse_name}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-right font-bold text-foreground">{lot.quantity.toFixed(2)}</td>
        <td className="px-4 py-3 text-right text-foreground/75">
          {formatAmount(lot.unit_price, canViewAmounts)}
        </td>
        <td className="px-4 py-3 text-right font-bold text-primary dark:text-primary">
          {formatAmount(lot.quantity * lot.unit_price, canViewAmounts)}
        </td>
      </tr>
    )
  })
)

interface FEFOLotsVirtualTableProps {
  lots: StockLotDetail[]
  locale: string
  canViewAmounts: boolean
  noExpiryLabel: string
  colLot: string
  colExp: string
  colWh: string
  colQty: string
  colUnitPrice: string
  colTotal: string
}

const FEFOLotsVirtualTable = memo(function FEFOLotsVirtualTable({
  lots,
  locale,
  canViewAmounts,
  noExpiryLabel,
  colLot,
  colExp,
  colWh,
  colQty,
  colUnitPrice,
  colTotal,
}: FEFOLotsVirtualTableProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const isLg = useMatchMedia(INVENTORY_VIRTUAL_LG_QUERY, false)
  const overscan = getInventoryVirtualOverscan(isLg, "fefo-lot")

  const rowVirtualizer = useVirtualizer({
    count: lots.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => FEFO_LOT_ROW_ESTIMATE_PX,
    overscan,
    getItemKey: (index) => lots[index]?.id ?? index,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()
  const paddingTop = lots.length > 0 && virtualItems.length > 0 ? virtualItems[0]?.start ?? 0 : 0
  const paddingBottom =
    lots.length > 0 && virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-muted/20 dark:bg-muted/10"
    >
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 border-b border-border bg-muted/60 dark:bg-muted/40">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-foreground/75 dark:text-foreground/85">
              {colLot}
            </th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-foreground/75 dark:text-foreground/85">
              {colExp}
            </th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-foreground/75 dark:text-foreground/85">
              {colWh}
            </th>
            <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-foreground/75 dark:text-foreground/85">
              {colQty}
            </th>
            <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-foreground/75 dark:text-foreground/85">
              {colUnitPrice}
            </th>
            <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-foreground/75 dark:text-foreground/85">
              {colTotal}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {paddingTop > 0 && (
            <tr aria-hidden>
              <td colSpan={FEFO_LOT_COL_SPAN} style={{ height: paddingTop }} />
            </tr>
          )}
          {virtualItems.map((virtualRow) => {
            const lot = lots[virtualRow.index]
            if (!lot) return null
            return (
              <FefoLotRow
                key={virtualRow.key}
                ref={rowVirtualizer.measureElement}
                virtualRow={virtualRow}
                lot={lot}
                locale={locale}
                canViewAmounts={canViewAmounts}
                noExpiryLabel={noExpiryLabel}
              />
            )
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden>
              <td colSpan={FEFO_LOT_COL_SPAN} style={{ height: paddingBottom }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
})

export function FEFOLotDetailsModal({ item, open, onOpenChange, warehouseId }: FEFOLotDetailsModalProps) {
  const t = useTranslations("inventory.fefoLot")
  const locale = useLocale()
  const canViewAmounts = useCanViewAmounts()

  const detailQuery = useQuery({
    queryKey: ["fefo-report-detail", item?.id, warehouseId],
    queryFn: () =>
      inventoryApi.getFEFOInventoryReportDetail(item!.id, {
        ...(warehouseId ? { warehouse_id: warehouseId } : {}),
      }),
    enabled: open && !!item?.id,
    staleTime: 30_000,
  })

  const detail = detailQuery.data
  const lots = detail?.lots ?? []

  if (!item) return null

  const totalQuantity = detail?.total_quantity ?? item.total_quantity
  const totalValue = detail?.total_value ?? item.total_value

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layout="scroll" size="6xl" className="max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-8">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                <Package className="text-blue-600 dark:text-blue-400" size={20} />
              </div>
              <div>
                <DialogTitle>
                  {item.name}{" "}
                  <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">({item.sku})</span>
                </DialogTitle>
                <DialogDescription className="mt-1 flex items-center gap-4">
                  <span>
                    <b className="text-foreground">{t("unitLabel")}</b> {item.unit}
                  </span>
                  <span>
                    <b className="text-foreground">{t("categoryLabel")}</b> {item.category_name}
                  </span>
                </DialogDescription>
              </div>
            </div>

            <AsyncPdfExportButton
              reportSlug="fefo-inventory"
              params={{ stock_item_id: item.id, warehouse_id: warehouseId || "" }}
              filename={`lot-detay-${item.sku}-${new Date().toISOString().split("T")[0]}.pdf`}
              size="sm"
            />
          </div>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-col overflow-hidden p-0">
          <div className="grid shrink-0 grid-cols-1 gap-0 border-b border-border bg-background md:grid-cols-3">
            <div className="flex flex-col items-center justify-center border-b border-border p-4 md:border-b-0 md:border-r">
              <span className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t("totalStock")}
              </span>
              <span className="text-2xl font-bold text-foreground">
                {totalQuantity.toFixed(2)} {item.unit}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center border-b border-border p-4 md:border-b-0 md:border-r">
              <span className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t("avgCost")}
              </span>
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatAmount(totalQuantity > 0 ? totalValue / totalQuantity : 0, canViewAmounts)}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center bg-blue-50/30 p-4 dark:bg-blue-900/10">
              <span className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t("fefoTotalValue")}
              </span>
              <span className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                {formatAmount(totalValue, canViewAmounts)}
              </span>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-5">
            <h4 className="mb-4 flex shrink-0 items-center gap-2 text-sm font-bold text-foreground">
              <Coins size={16} className="text-amber-500" /> {t("lotsHeading")}
            </h4>

            {detailQuery.isLoading ? (
              <div className="flex flex-1 items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              </div>
            ) : detailQuery.isError ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("loadError")}</p>
            ) : (
              <FEFOLotsVirtualTable
                lots={lots}
                locale={locale}
                canViewAmounts={canViewAmounts}
                noExpiryLabel={t("noExpiry")}
                colLot={t("colLot")}
                colExp={t("colExp")}
                colWh={t("colWh")}
                colQty={t("colQty")}
                colUnitPrice={t("colUnitPrice")}
                colTotal={t("colTotal")}
              />
            )}
          </div>
        </DialogBody>

        <DialogFooter className="justify-between sm:justify-between">
          <span className="text-2xs text-muted-foreground">
            {t("reportDate")} {new Date().toLocaleString(locale)}
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
