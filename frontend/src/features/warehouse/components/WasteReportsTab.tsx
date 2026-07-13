"use client"

import React, { useMemo, useState } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { useDebounce } from "@/hooks/useDebounce"
import { AlertCircle, Calendar as CalendarIcon, Loader2, Search } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { AsyncPdfExportButton } from "@/components/AsyncPdfExportButton"
import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import { formatQuantityWithUnit } from "@/lib/formatters"
import { formatKitchenClosingNotes } from "@/features/warehouse/utils/kitchenClosingDisplay"
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table"
import { pageFromDrfNext } from "@/lib/pagination"

const WASTE_PAGE_SIZE = 50

interface WasteReportsTabProps {
  branchId?: string
}

export function WasteReportsTab({ branchId }: WasteReportsTabProps) {
  const t = useTranslations("warehouse")
  const [date, setDate] = useState<Date>(new Date())
  const [searchTerm, setSearchTerm] = useState("")
  const debouncedSearch = useDebounce(searchTerm, 500)

  const formattedDate = format(date, "yyyy-MM-dd")

  const movementsQuery = useInfiniteQuery({
    queryKey: ["wasteReports", branchId, formattedDate, debouncedSearch],
    queryFn: async ({ pageParam = 1 }) =>
      inventoryApi.getStockMovements({
        movement_type: "WASTE",
        start_date: formattedDate,
        end_date: formattedDate,
        warehouse_id: branchId === "ALL" ? undefined : branchId,
        search: debouncedSearch || undefined,
        page: pageParam as number,
        page_size: WASTE_PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => pageFromDrfNext(lastPage.next),
    refetchOnMount: "always",
  })

  const movements = useMemo(
    () => movementsQuery.data?.pages.flatMap((p) => p.results) ?? [],
    [movementsQuery.data?.pages],
  )

  const wasteExportParams = {
    warehouse_id: branchId === "ALL" ? undefined : branchId,
    movement_type: "WASTE",
    start_date: formattedDate,
    end_date: formattedDate,
    search: debouncedSearch,
  }

  const totalWaste = movements.reduce((acc, curr) => acc + curr.quantity, 0)
  const totalAmount = movements.reduce(
    (acc, curr) => acc + curr.quantity * (curr.unit_price || 0),
    0,
  )

  const currency = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" })

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("waste.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("waste.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder={t("waste.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 w-44 rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none border-border bg-card/50"
            />
          </div>
          <div className="relative">
            <CalendarIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="date"
              className="h-9 w-40 rounded-lg border border-border bg-card pl-9 pr-3 text-xs outline-none border-border bg-card/50"
              value={formattedDate}
              onChange={(e) => {
                if (e.target.value) {
                  setDate(new Date(e.target.value))
                }
              }}
              required
            />
          </div>
          <AsyncPdfExportButton
            reportSlug="stock-movement-list"
            params={wasteExportParams}
            filename={`Fire_Zayi_Raporu_${formattedDate}.pdf`}
            size="sm"
            className="h-9"
          />
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border/80 bg-amber-50/80 p-4 border-border dark:bg-amber-950/20">
          <p className="text-sub font-medium tracking-widertext-muted-foreground">
            {t("waste.totalWaste")}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {totalWaste.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border border-border/80 bg-rose-50/80 p-4 border-border dark:bg-rose-950/20">
          <p className="text-sub font-medium tracking-widertext-muted-foreground">
            {t("waste.totalCostEstimate")}
          </p>
          <p
            className={cn(
              "mt-1 text-2xl font-bold tabular-nums",
              totalAmount > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground",
            )}
          >
            {currency.format(totalAmount)}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-border/80 bg-card/50 border-border">
        {movementsQuery.isLoading ? (
          <div className="py-12 text-center text-muted-foreground">{t("waste.loading")}</div>
        ) : movements.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <AlertCircle className="h-8 w-8 text-muted-foreground/70" />
            <p>{t("waste.empty")}</p>
          </div>
        ) : (
          <VirtualTable
            rows={movements}
            rowHeight={44}
            overscan={10}
            fetchMore={movementsQuery.fetchNextPage}
            hasMore={!!movementsQuery.hasNextPage}
            isFetchingNextPage={movementsQuery.isFetchingNextPage}
            className="flex-1 min-h-0"
            tableClassName="w-full text-sm"
            header={
              <thead className={virtualTableStickyHeadClass}>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                    {t("waste.colDateTime")}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                    {t("waste.colProduct")}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                    {t("waste.colWarehouse")}
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                    {t("waste.colQuantity")}
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                    {t("waste.colUnitCost")}
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                    {t("waste.colTotal")}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">
                    {t("waste.colNotes")}
                  </th>
                </tr>
              </thead>
            }
            loadingMore={
              <tr>
                <td colSpan={7} className="py-3 text-center">
                  <Loader2 size={16} className="mx-auto animate-spin text-muted-foreground" />
                </td>
              </tr>
            }
            renderRow={(m) => {
              const qty = m.quantity
              const price = m.unit_price || 0
              const notesText = m.notes?.includes("Teorik:")
                ? formatKitchenClosingNotes(m.notes)
                : m.notes || m.reference || "-"
              return (
                <>
                  <td className="whitespace-nowrap px-4 py-3 text-foreground">
                    {format(new Date(m.created_at), "HH:mm")}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">{m.stock_item_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{m.warehouse_name}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                    {formatQuantityWithUnit(qty, m.unit)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {currency.format(price)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                    {currency.format(qty * price)}
                  </td>
                  <td
                    className="max-w-[200px] truncate px-4 py-3 text-muted-foreground"
                    title={notesText}
                  >
                    {notesText}
                  </td>
                </>
              )
            }}
          />
        )}
      </div>
    </div>
  )
}
