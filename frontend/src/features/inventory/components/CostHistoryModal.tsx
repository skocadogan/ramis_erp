"use client"

import React, { useMemo, useState } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import { pageFromDrfNext } from "@/lib/pagination"
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table"
import { StockItem, type StockMovement } from "@/features/inventory/types"
import { Loader2, History, ArrowDownToLine, Search, RotateCcw } from "lucide-react"
import { formatQuantity, formatAmount } from "@/lib/formatters"
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts"
import { useLocale, useTranslations } from "next-intl"

type CostHistoryRow = StockMovement & { supplier_name?: string | null }

interface CostHistoryModalProps {
  item: StockItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CostHistoryModal({ item, open, onOpenChange }: CostHistoryModalProps) {
  const t = useTranslations("inventory.costHistory")
  const locale = useLocale()
  const canViewAmounts = useCanViewAmounts()
  const [searchTerm, setSearchTerm] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["stock-cost-history", item?.id, searchTerm, startDate, endDate],
    queryFn: async ({ pageParam = 1 }) => {
      if (!item?.id) return { results: [], next: null }

      return inventoryApi.getStockMovements({
        stock_item_id: item.id,
        movement_type: "IN",
        page: pageParam as number,
        page_size: 20,
        ...(searchTerm && { search: searchTerm }),
        ...(startDate && { start_date: startDate }),
        ...(endDate && { end_date: endDate }),
      })
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => pageFromDrfNext(lastPage.next),
    enabled: !!item?.id && open,
  })

  const history = useMemo(() => {
    return data?.pages.flatMap((page) => page.results) || []
  }, [data])

  const clearFilters = () => {
    setSearchTerm("")
    setStartDate("")
    setEndDate("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layout="scroll" size="6xl" className="max-h-[90vh]">
        <DialogHeader>
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div className="flex items-center gap-3 pr-8">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                <History className="size-5 text-foreground" />
              </div>
              <div>
                <DialogTitle>{t("title", { name: item?.name ?? "" })}</DialogTitle>
                <DialogDescription>
                  <span className="font-mono">{item?.sku}</span>
                </DialogDescription>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={t("searchPh")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-56 rounded-md border border-border py-2 pl-8 pr-3 text-xs outline-none focus:border-blue-500 border-input bg-muted text-foreground"
                />
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 border-border bg-muted">
                <span className="text-2xs font-bold uppercase text-muted-foreground">{t("dateLabel")}</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-28 border-none bg-transparent text-xs outline-none text-foreground dark:[color-scheme:dark]"
                />
                <span className="">-</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-28 border-none bg-transparent text-xs outline-none text-foreground dark:[color-scheme:dark]"
                />
              </div>
              {(searchTerm || startDate || endDate) && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-md border border-border p-2 text-muted-foreground hover:text-rose-600 border-border bg-muted"
                  title={t("clearFiltersTitle")}
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="relative min-h-0 p-0 pt-0">
          <VirtualTable
            rows={history}
            rowHeight={56}
            overscan={8}
            fetchMore={() => void fetchNextPage()}
            hasMore={!!hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            className="h-full max-h-[min(60vh,520px)]"
            tableClassName="w-full border-separate border-spacing-0 text-sm"
            header={
              <thead className={virtualTableStickyHeadClass}>
                <tr className="border-b border-border text-muted-foreground border-border dark:text-muted-foreground">
                  <th className="border-b px-2 py-3 text-left font-semibold border-border">{t("colTxnDate")}</th>
                  <th className="border-b px-2 py-3 text-left font-semibold border-border">{t("colSupplier")}</th>
                  <th className="border-b px-2 py-3 text-left font-semibold border-border">{t("colDocRef")}</th>
                  <th className="border-b px-2 py-3 text-left font-semibold border-border">{t("colNotes")}</th>
                  <th className="border-b px-2 py-3 text-right font-semibold border-border">{t("colQty")}</th>
                  <th className="border-b px-2 py-3 text-right font-semibold border-border">{t("colUnitPrice")}</th>
                  <th className="border-b px-2 py-3 text-right font-semibold border-border">{t("colLineTotal")}</th>
                </tr>
              </thead>
            }
            emptyState={
              isLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-32 text-muted-foreground">
                  <Loader2 className="size-10 animate-spin text-blue-600" />
                  <p className="text-sm font-medium">{t("loading")}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-4 py-32 text-muted-foreground">
                  <div className="rounded-full p-6 bg-muted">
                    <History size={48} className="opacity-25" />
                  </div>
                  <div className="text-center">
                    <p className="text-base font-semibold text-muted-foreground">{t("emptyTitle")}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{t("emptySub")}</p>
                  </div>
                </div>
              )
            }
            loadingMore={
              <tr>
                <td colSpan={7} className="py-4 text-center">
                  <Loader2 className="animate-spin text-blue-600 mx-auto" size={20} />
                </td>
              </tr>
            }
            renderRow={(m: CostHistoryRow) => (
              <>
                <td className="px-2 py-3">
                  <div className="flex flex-col">
                    <span className="font-semibold text-foreground">
                      {new Date(m.created_at).toLocaleDateString(locale)}
                    </span>
                    <span className="text-sub font-medium text-muted-foreground">
                      {new Date(m.created_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-3 font-medium text-muted-foreground">
                  {m.supplier_name || <span className="text-muted-foreground">-</span>}
                </td>
                <td className="px-2 py-3">
                  <span className="rounded px-2 py-1 font-mono text-sub font-bold tracking-tight bg-muted dark:text-muted-foreground">
                    {m.reference || t("refNone")}
                  </span>
                </td>
                <td className="max-w-[200px] truncate px-2 py-3 text-xs italic text-muted-foreground">
                  {m.notes || ""}
                </td>
                <td className="px-2 py-3 text-right">
                  <span className="font-bold text-foreground">{formatQuantity(m.quantity)}</span>
                  <span className="ml-1 text-sub font-medium uppercase text-muted-foreground">{m.unit}</span>
                </td>
                <td className="px-2 py-3 text-right">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {formatAmount(m.unit_price, canViewAmounts)}
                  </span>
                </td>
                <td className="px-2 py-3 text-right">
                  <span className="font-bold text-foreground">
                    {formatAmount(m.quantity * m.unit_price, canViewAmounts)}
                  </span>
                </td>
              </>
            )}
          />
        </DialogBody>

        <DialogFooter className="justify-center">
          <div className="flex items-center justify-center gap-2 text-center text-sub font-bold uppercase tracking-wider text-muted-foreground">
            <ArrowDownToLine size={14} className="shrink-0" />
            <p>{t("footerNote")}</p>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
