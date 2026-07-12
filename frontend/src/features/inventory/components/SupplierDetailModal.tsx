"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
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
import { adminApi } from "@/features/admin/services/adminApi"
import { AsyncPdfExportButton } from "@/components/AsyncPdfExportButton"
import type { Supplier, SupplierDetailTab, SupplierRejectedItem, SupplierGoodsReceivingSummary } from "@/features/inventory/types"
import { Loader2, Package, FileDown, FileSpreadsheet, Search, X } from "lucide-react"
import { formatDate, formatQuantityWithUnit } from "@/lib/formatters"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

const ROW_ESTIMATE = 56

const rejectedRowGrid =
  "grid w-full min-w-0 grid-cols-[minmax(7rem,1fr)_minmax(8rem,1.6fr)_minmax(4.5rem,0.5fr)_minmax(4.5rem,0.5fr)_minmax(4rem,0.4fr)_minmax(3.5rem,0.4fr)] items-start gap-x-3 gap-y-1 px-4 py-2.5 text-sm"

const receivingRowGrid =
  "grid w-full min-w-0 grid-cols-[minmax(7rem,0.9fr)_minmax(6rem,0.8fr)_minmax(6rem,0.9fr)_minmax(6rem,0.7fr)_minmax(5rem,0.5fr)_minmax(5rem,0.4fr)_minmax(5rem,0.4fr)] items-start gap-x-3 gap-y-1 px-4 py-2.5 text-sm"

interface SupplierDetailModalProps {
  supplier: Supplier | null
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultTab: SupplierDetailTab
}

export function SupplierDetailModal({ supplier, open, onOpenChange, defaultTab }: SupplierDetailModalProps) {
  const t = useTranslations("inventory.supplierDetail")
  const [activeTab, setActiveTab] = useState<SupplierDetailTab>(defaultTab)
  const toaster = useTranslations("inventory.supplierDetail")

  useEffect(() => {
    if (open) setActiveTab(defaultTab)
  }, [open, defaultTab])

  const [search, setSearch] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const scrollRef = useRef<HTMLDivElement>(null)

  const {
    data: rejectedPages,
    fetchNextPage: fetchRejectedNext,
    hasNextPage: hasRejectedNext,
    isFetchingNextPage: isFetchingRejectedNext,
    isLoading: rejectedLoading,
  } = useInfiniteQuery({
    queryKey: ["supplier-rejected-items", supplier?.id, startDate, endDate, debouncedSearch],
    queryFn: async ({ pageParam = 1 }) => {
      if (!supplier?.id) return { results: [], next: null }
      return inventoryApi.getSupplierRejectedItems(supplier.id, {
        page: pageParam as number,
        page_size: 40,
        ...(startDate && { start_date: startDate }),
        ...(endDate && { end_date: endDate }),
        ...(debouncedSearch && { search: debouncedSearch }),
      })
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.next) return undefined
      const url = new URL(lastPage.next)
      return parseInt(url.searchParams.get("page") || "1", 10)
    },
    enabled: !!supplier?.id && open && activeTab === "rejected",
  })

  const {
    data: receivingPages,
    fetchNextPage: fetchReceivingNext,
    hasNextPage: hasReceivingNext,
    isFetchingNextPage: isFetchingReceivingNext,
    isLoading: receivingLoading,
  } = useInfiniteQuery({
    queryKey: ["supplier-goods-receivings", supplier?.id, startDate, endDate, debouncedSearch],
    queryFn: async ({ pageParam = 1 }) => {
      if (!supplier?.id) return { results: [], next: null }
      return inventoryApi.getSupplierGoodsReceivings(supplier.id, {
        page: pageParam as number,
        page_size: 40,
        ...(startDate && { start_date: startDate }),
        ...(endDate && { end_date: endDate }),
        ...(debouncedSearch && { search: debouncedSearch }),
      })
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.next) return undefined
      const url = new URL(lastPage.next)
      return parseInt(url.searchParams.get("page") || "1", 10)
    },
    enabled: !!supplier?.id && open && activeTab === "receivings",
  })

  const rejectedItems = useMemo(() => rejectedPages?.pages.flatMap((p) => p.results) ?? [], [rejectedPages])
  const receivingRecords = useMemo(() => receivingPages?.pages.flatMap((p) => p.results) ?? [], [receivingPages])

  const isRejectedTab = activeTab === "rejected"
  const rows = isRejectedTab ? rejectedItems : receivingRecords
  const isLoading = isRejectedTab ? rejectedLoading : receivingLoading
  const hasNextPage = isRejectedTab ? hasRejectedNext : hasReceivingNext
  const isFetchingNextPage = isRejectedTab ? isFetchingRejectedNext : isFetchingReceivingNext
  const fetchNextPage = isRejectedTab ? fetchRejectedNext : fetchReceivingNext

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 12,
    getItemKey: (index) => (rows[index] as { id?: string })?.id ?? index,
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
    scrollRef.current?.scrollTo({ top: 0 })
  }, [activeTab, startDate, endDate, debouncedSearch, supplier?.id])

  useEffect(() => {
    rowVirtualizer.measure()
  }, [rows.length, rowVirtualizer])

  useEffect(() => {
    if (!open || !supplier?.id || isLoading) return
    const el = scrollRef.current
    if (!el || !hasNextPage || isFetchingNextPage) return
    if (el.scrollHeight <= el.clientHeight + 80) {
      void fetchNextPage()
    }
  }, [open, supplier?.id, isLoading, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const filterChanged = startDate || endDate || debouncedSearch

  const [isExportingExcel, setIsExportingExcel] = useState(false)

  const reportSlug = isRejectedTab ? "supplier-rejected-items" : "supplier-goods-receiving"

  const reportParams = {
    supplier_id: supplier?.id,
    ...(startDate && { start_date: startDate }),
    ...(endDate && { end_date: endDate }),
    ...(debouncedSearch && { search: debouncedSearch }),
  }

  const handleExportExcel = async () => {
    if (!supplier) return
    setIsExportingExcel(true)
    const toastId = `supplier-report-excel-${supplier.id}-${activeTab}`
    toast.loading(toaster("toastPreparing"), { id: toastId })
    try {
      const blob = await adminApi.generateModuleReport(reportSlug, {
        supplier_id: supplier.id,
        ...(startDate && { start_date: startDate }),
        ...(endDate && { end_date: endDate }),
        ...(debouncedSearch && { search: debouncedSearch }),
      }, "excel")
      const url = window.URL.createObjectURL(new Blob([blob]))
      const link = document.createElement("a")
      link.href = url
      const dateStr = new Date().toISOString().split("T")[0]
      link.setAttribute("download", `${reportSlug}-${supplier.name.replace(/\s+/g, "_")}-${dateStr}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success(toaster("toastDownloaded"), { id: toastId })
    } catch {
      toast.error(toaster("toastExcelError"), { id: toastId })
    } finally {
      setIsExportingExcel(false)
    }
  }

  if (!supplier) return null

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
      INSPECTED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      ACCEPTED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
      PARTIALLY_ACCEPTED: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
      REJECTED: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
    }
    return `inline-flex max-w-full rounded px-2 py-0.5 text-sub font-ui-medium ${colors[status] || "bg-slate-100 text-slate-800"}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layout="scroll" size="7xl" className="max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-8">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                <Package className="size-5 text-foreground" />
              </div>
              <div className="min-w-0">
                <DialogTitle>{supplier.name}</DialogTitle>
                <DialogDescription>
                  {isRejectedTab ? t("tabRejected") : t("tabReceivings")}
                </DialogDescription>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={handleExportExcel}
                disabled={isExportingExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-ui-sm font-ui-medium transition-colors disabled:opacity-50"
              >
                <FileSpreadsheet size={14} />
                {isExportingExcel ? toaster("exporting") : "Excel"}
              </button>
              <AsyncPdfExportButton
                reportSlug={reportSlug}
                params={reportParams}
                filename={`${reportSlug}-${supplier.name.replace(/\s+/g, "_")}-${new Date().toISOString().split("T")[0]}.pdf`}
                size="sm"
              />
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-col overflow-hidden p-0">
          <div className="flex shrink-0 items-center gap-1 border-b border-border px-5 py-2 dark:border-slate-800">
            <button
              onClick={() => setActiveTab("rejected")}
              className={`px-4 py-1.5 rounded-lg text-ui-sm font-ui-medium transition-colors ${
                isRejectedTab
                  ? "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t("tabRejected")}
            </button>
            <button
              onClick={() => setActiveTab("receivings")}
              className={`px-4 py-1.5 rounded-lg text-ui-sm font-ui-medium transition-colors ${
                !isRejectedTab
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t("tabReceivings")}
            </button>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-2.5 dark:border-slate-800">
            <div className="relative flex-1 min-w-[160px] max-w-[300px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="w-full rounded border border-border bg-white py-1.5 pl-8 pr-8 text-ui-sm outline-none dark:border-slate-600 dark:bg-slate-800"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded border border-border bg-white px-3 py-1.5 text-ui-sm dark:border-slate-600 dark:bg-slate-800 dark:[color-scheme:dark]"
            />
            <span className="text-muted-foreground text-ui-sm">—</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded border border-border bg-white px-3 py-1.5 text-ui-sm dark:border-slate-600 dark:bg-slate-800 dark:[color-scheme:dark]"
            />
            {filterChanged && (
              <button
                onClick={() => {
                  setSearch("")
                  setDebouncedSearch("")
                  setStartDate("")
                  setEndDate("")
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-ui-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                <X size={14} />
                {t("clearFilters")}
              </button>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {isRejectedTab ? (
              <div className={`sticky top-0 z-10 border-b border-border bg-white pb-2 text-ui-sm font-ui-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-muted-foreground ${rejectedRowGrid}`}>
                <span className="min-w-0 text-left">{t("colReceivingNo")}</span>
                <span className="min-w-0 text-left">{t("colProduct")}</span>
                <span className="min-w-0 text-right tabular-nums">{t("colExpected")}</span>
                <span className="min-w-0 text-right tabular-nums">{t("colAccepted")}</span>
                <span className="min-w-0 text-right tabular-nums">{t("colRejected")}</span>
                <span className="min-w-0 text-left">{t("colUnit")}</span>
              </div>
            ) : (
              <div className={`sticky top-0 z-10 border-b border-border bg-white pb-2 text-ui-sm font-ui-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-muted-foreground ${receivingRowGrid}`}>
                <span className="min-w-0 text-left">{t("colReceivingNo")}</span>
                <span className="min-w-0 text-left">{t("colDate")}</span>
                <span className="min-w-0 text-left">{t("colStatus")}</span>
                <span className="min-w-0 text-left">{t("colWarehouse")}</span>
                <span className="min-w-0 text-right tabular-nums">{t("colTotal")}</span>
                <span className="min-w-0 text-center">{t("colItems")}</span>
                <span className="min-w-0 text-center">{t("colRejectedItems")}</span>
              </div>
            )}

            <div
              ref={scrollRef}
              onScroll={loadMoreOnScroll}
              className="min-h-[200px] flex-1 overflow-auto"
            >
              {isLoading ? (
                <div className="flex justify-center px-5 py-12 text-muted-foreground">
                  <Loader2 className="size-8 animate-spin" />
                </div>
              ) : rows.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t("noData")}</p>
              ) : (
                <>
                  <div
                    className="relative w-full"
                    style={{ height: rowVirtualizer.getTotalSize() }}
                    role="presentation"
                  >
                    {rowVirtualizer.getVirtualItems().map((vi) => {
                      const row = rows[vi.index]
                      if (!row) return null

                      if (isRejectedTab) {
                        const item = row as SupplierRejectedItem
                        return (
                          <div
                            key={vi.key}
                            data-index={vi.index}
                            ref={rowVirtualizer.measureElement}
                            className="absolute left-0 top-0 w-full border-b border-slate-100 dark:border-slate-800"
                            style={{ transform: `translateY(${vi.start}px)` }}
                          >
                            <div className={`${rejectedRowGrid} text-foreground`}>
                              <div className="min-w-0">
                                <div className="font-mono text-ui-sm text-foreground">{item.receiving_number as string}</div>
                                <div className="text-sub text-muted-foreground">{formatDate(item.received_date as string)}</div>
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-ui-sm font-ui-medium" title={item.stock_item_name as string}>
                                  {item.stock_item_name as string}
                                </div>
                                <div className="font-mono text-sub text-muted-foreground">{item.stock_item_sku as string}</div>
                              </div>
                              <div className="min-w-0 text-right tabular-nums text-ui-sm text-muted-foreground">
                                {formatQuantityWithUnit(item.expected_quantity as number, item.unit as string)}
                              </div>
                              <div className="min-w-0 text-right tabular-nums text-ui-sm text-emerald-700 dark:text-emerald-400 font-ui-medium">
                                {formatQuantityWithUnit(item.received_quantity as number, item.unit as string)}
                              </div>
                              <div className="min-w-0 text-right tabular-nums text-ui-sm text-rose-700 dark:text-rose-400 font-ui-bold">
                                {formatQuantityWithUnit(item.rejected_quantity as number, item.unit as string)}
                              </div>
                              <div className="min-w-0 text-ui-sm text-muted-foreground">{item.unit as string}</div>
                            </div>
                          </div>
                        )
                      }

                      const rec = row as SupplierGoodsReceivingSummary
                      return (
                        <div
                          key={vi.key}
                          data-index={vi.index}
                          ref={rowVirtualizer.measureElement}
                          className="absolute left-0 top-0 w-full border-b border-slate-100 dark:border-slate-800"
                          style={{ transform: `translateY(${vi.start}px)` }}
                        >
                          <div className={`${receivingRowGrid} text-foreground`}>
                            <div className="min-w-0">
                              <div className="font-mono text-ui-sm text-foreground">{rec.receiving_number as string}</div>
                              <div className="text-sub text-muted-foreground">{formatDate(rec.received_date as string)}</div>
                            </div>
                            <div className="min-w-0 text-ui-sm text-muted-foreground">
                              {formatDate(rec.received_date as string)}
                            </div>
                            <div className="min-w-0">
                              <span className={statusBadge(rec.status as string)}>
                                {rec.status_display as string}
                              </span>
                            </div>
                            <div className="min-w-0 truncate text-ui-sm text-muted-foreground" title={rec.warehouse_name as string}>
                              {rec.warehouse_name as string}
                            </div>
                            <div className="min-w-0 text-right tabular-nums text-ui-sm font-ui-medium">
                              {new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(rec.total_amount as number)}
                            </div>
                            <div className="min-w-0 text-center tabular-nums text-ui-sm text-muted-foreground">
                              {rec.items_count as number}
                            </div>
                            <div className={`min-w-0 text-center tabular-nums text-ui-sm font-ui-medium ${(rec.rejected_items_count as number) > 0 ? "text-rose-700 dark:text-rose-400" : "text-muted-foreground"}`}>
                              {rec.rejected_items_count as number}
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
                    ) : rows.length > 0 ? (
                      <span className="opacity-70">{t("allLoaded")}</span>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
