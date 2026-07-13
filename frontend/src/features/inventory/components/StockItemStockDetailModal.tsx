"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import type { StockItem, StockMovement } from "@/features/inventory/types"
import { Loader2, Package, Warehouse, ArrowRightLeft, ExternalLink } from "lucide-react"
import Link from "next/link"
import { formatDate, formatQuantityWithUnit } from "@/lib/formatters"
import {
  formatStockMovementReference,
  formatStockMovementQuantitySign,
  getStockMovementSignedQuantity,
  getStockMovementTypeLabel,
  stockMovementQuantityTextClass,
  stockMovementTypeBadgeClass,
} from "@/lib/stockMovementDisplay"
import { formatMinimumQuantityDisplay } from "@/lib/stockMinimum"
import { AsyncPdfExportButton } from "@/components/AsyncPdfExportButton"
import { useTranslations } from "next-intl"

/** Sanal satır tahmini — uzun notlar için measureElement gerçek yüksekliği ayarlar */
const MOVEMENT_ROW_EST = 56

/**
 * 6 sütun tam genişliğe yayılır (fr oranları); dar ekranda min genişlik korunur.
 * Tarih·Depo·Referans·Not genişler; Tip/Miktar biraz daha kompakt fr ile kalır.
 */
const movementRowGridClass =
  "grid w-full min-w-0 grid-cols-[minmax(6.5rem,1.05fr)_minmax(5rem,1.2fr)_minmax(4.25rem,0.2fr)_minmax(4.25rem,0.2fr)_minmax(5rem,2fr)_minmax(8rem,2.15fr)] items-start gap-x-4 gap-y-1 px-5 py-2.5 text-sm"

const selectClass =
  "rounded border border-border bg-background px-3 py-1.5 text-ui-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"

interface StockItemStockDetailModalProps {
  item: StockItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StockItemStockDetailModal({ item, open, onOpenChange }: StockItemStockDetailModalProps) {
  const t = useTranslations("inventory.stockDetail")
  const tMov = useTranslations("inventory.movementType")
  const tReason = useTranslations("inventory.returnCancelReason")
  const [movementType, setMovementType] = useState<string>("ALL")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const movementsScrollRef = useRef<HTMLDivElement>(null)

  const { data: levels = [], isLoading: levelsLoading } = useQuery({
    queryKey: ["stock-item-warehouse-levels", item?.id],
    queryFn: () => inventoryApi.getStockItemWarehouseLevels(item!.id),
    enabled: !!item?.id && open,
  })

  const {
    data: movPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: movLoading,
  } = useInfiniteQuery({
    queryKey: ["stock-item-detail-movements", item?.id, movementType, startDate, endDate],
    queryFn: async ({ pageParam = 1 }) => {
      if (!item?.id) return { results: [], next: null }
      return inventoryApi.getStockMovements({
        stock_item_id: item.id,
        page: pageParam as number,
        page_size: 40,
        ...(movementType !== "ALL" && { movement_type: movementType }),
        ...(startDate && { start_date: startDate }),
        ...(endDate && { end_date: endDate }),
      })
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.next) return undefined
      const url = new URL(lastPage.next)
      return parseInt(url.searchParams.get("page") || "1", 10)
    },
    enabled: !!item?.id && open,
  })

  const movements = useMemo(() => movPages?.pages.flatMap((p) => p.results) ?? [], [movPages])

  const rowVirtualizer = useVirtualizer({
    count: movements.length,
    getScrollElement: () => movementsScrollRef.current,
    estimateSize: () => MOVEMENT_ROW_EST,
    overscan: 12,
    getItemKey: (index) => movements[index]?.id ?? index,
  })

  const loadMoreOnScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      if (distanceFromBottom < 200 && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage()
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  )

  useEffect(() => {
    if (!open) {
      setMovementType("ALL")
      setStartDate("")
      setEndDate("")
    }
  }, [open])

  useEffect(() => {
    movementsScrollRef.current?.scrollTo({ top: 0 })
  }, [movementType, startDate, endDate, item?.id])

  useEffect(() => {
    rowVirtualizer.measure()
  }, [movements.length, rowVirtualizer])

  /** Liste kısa olduğunda (kaydırma çubuğu yok) sonraki sayfayı otomatik yükle */
  useEffect(() => {
    if (!open || !item?.id || movLoading) return
    const el = movementsScrollRef.current
    if (!el || !hasNextPage || isFetchingNextPage) return
    if (el.scrollHeight <= el.clientHeight + 80) {
      void fetchNextPage()
    }
  }, [open, item?.id, movLoading, movements.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const labelForMovement = (mt: StockMovement["movement_type"]) =>
    getStockMovementTypeLabel(mt, (key) => tMov(key))

  const referenceLabel = (reference: string | null | undefined, notes: string | null | undefined) =>
    formatStockMovementReference(reference, notes, (key) => tReason(key))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {item ? (
      <DialogContent layout="scroll" size="7xl" className="max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-8">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                <Package className="size-5 text-foreground" />
              </div>
              <div className="min-w-0">
                <DialogTitle>{item.name}</DialogTitle>
                <DialogDescription>
                  <span className="font-mono">{item.sku}</span>
                  <span className="mx-2 text-muted-foreground">·</span>
                  {item.unit}
                  {item.category_name ? (
                    <>
                      <span className="mx-2 text-muted-foreground">·</span>
                      {item.category_name}
                    </>
                  ) : null}
                </DialogDescription>
              </div>
            </div>

            <AsyncPdfExportButton
              reportSlug="stock-item-detail"
              params={{
                stock_item_id: item.id,
                movement_type: movementType,
                start_date: startDate,
                end_date: endDate
              }}
              filename={`urun-karti-${item.sku}-${new Date().toISOString().split("T")[0]}.pdf`}
              size="sm"
            />
          </div>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-col overflow-hidden p-0">
          <div className="shrink-0 border-b border-border py-3">
            <div className="mb-2 flex items-center gap-2 px-5 text-ui-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Warehouse className="size-4" />
              {t("warehouseDist")}
            </div>
            {levelsLoading ? (
              <div className="flex items-center gap-2 px-5 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t("loading")}
              </div>
            ) : levels.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">{t("noWarehouseStock")}</p>
            ) : (
              <div className="max-h-40 w-full overflow-auto border-y border-border">
                <table className="w-full table-fixed text-ui">
                  <thead className="sticky top-0 bg-background text-left text-ui-sm font-semibold text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2">{t("colWarehouse")}</th>
                      <th className="px-3 py-2 text-right">{t("colQty")}</th>
                      <th className="px-3 py-2 text-right">{t("colMinimum")}</th>
                      <th className="px-3 py-2 text-center">{t("colStatus")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {levels.map((row) => (
                      <tr key={row.warehouse_id}>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-foreground text-ui-sm">{row.warehouse_name}</div>
                          <div className="font-mono text-sub text-muted-foreground">{row.warehouse_code}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {formatQuantityWithUnit(row.quantity, item.unit)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {formatMinimumQuantityDisplay(row.minimum_quantity, item.unit)}
                        </td>
                        <td className="px-3 py-2.5 text-center text-ui-sm">
                          <div className="flex items-center justify-center gap-3">
                            {row.is_low_stock ? (
                              <span className="text-rose-600 dark:text-rose-400 font-bold">{t("statusCritical")}</span>
                            ) : (
                              <span className="text-muted-foreground font-normal">{t("statusNormal")}</span>
                            )}
                            <Link
                              href={`/warehouse?warehouseId=${row.warehouse_id}`}
                              className="inline-flex items-center justify-center rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              title={t("goWarehouseTitle")}
                            >
                              <ExternalLink size={14} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-3">
              <div className="mr-2 flex items-center gap-2 text-ui-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <ArrowRightLeft className="size-4" />
                {t("movementsSection")}
              </div>
              <select
                value={movementType}
                onChange={(e) => setMovementType(e.target.value)}
                className={selectClass}
              >
                <option value="ALL">{t("filterAllTypes")}</option>
                <option value="IN">{tMov("IN")}</option>
                <option value="OUT">{tMov("OUT")}</option>
                <option value="ADJUSTMENT">{tMov("ADJUSTMENT")}</option>
                <option value="TRANSFER">{tMov("TRANSFER")}</option>
                <option value="WASTE">{tMov("WASTE")}</option>
                <option value="RETURN">{tMov("RETURN")}</option>
                <option value="CANCEL">{tMov("CANCEL")}</option>
                <option value="DISPOSAL">{tMov("DISPOSAL")}</option>
              </select>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={`${selectClass} dark:[color-scheme:dark]`}
              />
              <span className="text-muted-foreground">—</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={`${selectClass} dark:[color-scheme:dark]`}
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div
                className={`sticky top-0 z-10 border-b border-border bg-background pb-2 text-ui-sm font-semibold text-muted-foreground ${movementRowGridClass}`}
              >
                <span className="min-w-0 text-left">{t("colDate")}</span>
                <span className="min-w-0 text-left">{t("colWhMove")}</span>
                <span className="min-w-0 text-left">{t("colType")}</span>
                <span className="min-w-0 text-right tabular-nums">{t("colQtyMove")}</span>
                <span className="min-w-0 text-left">{t("colRef")}</span>
                <span className="min-w-0 text-left">{t("colNoteOp")}</span>
              </div>

              <div
                ref={movementsScrollRef}
                onScroll={loadMoreOnScroll}
                className="min-h-[200px] flex-1 overflow-auto"
              >
                {movLoading ? (
                  <div className="flex justify-center px-5 py-12 text-muted-foreground">
                    <Loader2 className="size-8 animate-spin" />
                  </div>
                ) : movements.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t("noMovements")}</p>
                ) : (
                  <>
                    <div
                      className="relative w-full"
                      style={{ height: rowVirtualizer.getTotalSize() }}
                      role="presentation"
                    >
                    {rowVirtualizer.getVirtualItems().map((vi) => {
                      const m = movements[vi.index]
                      if (!m) return null
                      return (
                        <div
                          key={vi.key}
                          data-index={vi.index}
                          ref={rowVirtualizer.measureElement}
                          className="absolute left-0 top-0 w-full border-b border-border"
                          style={{ transform: `translateY(${vi.start}px)` }}
                        >
                          <div className={`${movementRowGridClass} text-foreground`}>
                            <div className="min-w-0 whitespace-nowrap text-ui-sm text-muted-foreground">
                              {formatDate(m.created_at)}
                            </div>
                            <div className="min-w-0 truncate text-ui-sm" title={m.warehouse_name ?? undefined}>
                              {m.warehouse_name ?? "—"}
                            </div>
                            <div className="min-w-0">
                              <span
                                className={`inline-flex max-w-full rounded px-2 py-0.5 text-sub font-medium ${stockMovementTypeBadgeClass(m.movement_type)}`}
                              >
                                {labelForMovement(m.movement_type)}
                              </span>
                            </div>
                            <div
                              className={`min-w-0 text-right text-ui-sm font-medium tabular-nums ${stockMovementQuantityTextClass(m)}`}
                            >
                              {formatStockMovementQuantitySign(m)}
                              {formatQuantityWithUnit(Math.abs(getStockMovementSignedQuantity(m)), m.unit)}
                            </div>
                            <div className="min-w-0 truncate font-mono text-ui-sm text-muted-foreground">
                              {referenceLabel(m.reference, null)}
                            </div>
                            <div className="min-w-0 text-ui-sm text-muted-foreground">
                              <div className="break-words" title={m.notes || undefined}>
                                {m.notes || "—"}
                              </div>
                              {m.performed_by_name ? (
                                <div className="mt-0.5 text-sub text-muted-foreground">{m.performed_by_name}</div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex justify-center px-5 py-3 text-xs text-muted-foreground">
                    {isFetchingNextPage ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" /> {t("loadingMore")}
                      </span>
                    ) : hasNextPage ? (
                      <span>{t("scrollHint")}</span>
                    ) : movements.length > 0 ? (
                      <span className="opacity-70">{t("allLoaded")}</span>
                    ) : null}
                  </div>
                </>
              )}
            </div>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
      ) : null}
    </Dialog>
  )
}
