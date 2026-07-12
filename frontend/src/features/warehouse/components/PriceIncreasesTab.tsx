"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, TrendingUp } from "lucide-react"
import { useTranslations } from "next-intl"

import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import { CategorySelectTree } from "@/features/inventory/components/CategorySelectTree"
import { CostHistoryModal } from "@/features/inventory/components/CostHistoryModal"
import type { StockItem } from "@/features/inventory/types"
import type { PriceIncreaseRow } from "@/features/warehouse/types"
import { queryKeys } from "@/lib/queryKeys"
import { formatAmount, formatDate } from "@/lib/formatters"
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts"
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table"

export function PriceIncreasesTab({ branchId }: { branchId?: string }) {
  const t = useTranslations("warehouse.priceIncreasesTab")
  const canViewAmounts = useCanViewAmounts()
  const [minChangePct, setMinChangePct] = useState(5)
  const [lookbackDays, setLookbackDays] = useState(90)
  const [categoryId, setCategoryId] = useState("")
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null)

  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.categoriesBase,
    queryFn: () => inventoryApi.getCategories(),
  })

  const { data, isLoading } = useQuery({
    queryKey: ["price-increases", branchId, minChangePct, lookbackDays, categoryId],
    queryFn: () =>
      inventoryApi.getPriceIncreases({
        branch_id: branchId,
        category_id: categoryId || undefined,
        min_change_pct: minChangePct,
        lookback_days: lookbackDays,
        page_size: 200,
      }),
  })

  const rows = useMemo(() => data?.results ?? [], [data?.results])
  const summary = data?.summary

  const openCostHistory = (row: PriceIncreaseRow) => {
    setSelectedItem({
      id: row.stock_item_id,
      name: row.name,
      sku: row.sku,
      unit: row.unit,
    } as StockItem)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-foreground">
          <TrendingUp size={18} className="text-orange-500" />
          <span className="text-sm font-ui-semibold">{t("title")}</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={lookbackDays}
            onChange={(e) => setLookbackDays(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-border bg-card text-sm outline-none"
          >
            <option value={30}>{t("lookback30")}</option>
            <option value={60}>{t("lookback60")}</option>
            <option value={90}>{t("lookback90")}</option>
          </select>
          <select
            value={minChangePct}
            onChange={(e) => setMinChangePct(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-border bg-card text-sm outline-none"
          >
            <option value={3}>{t("threshold3")}</option>
            <option value={5}>{t("threshold5")}</option>
            <option value={10}>{t("threshold10")}</option>
            <option value={15}>{t("threshold15")}</option>
          </select>
          <CategorySelectTree
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            placeholder={t("allCategories")}
            className="w-44"
          />
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <p className="text-xs font-ui-medium uppercase text-muted-foreground">{t("summaryCount")}</p>
          <p className="mt-1 text-2xl font-ui-bold">{summary?.item_count ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <p className="text-xs font-ui-medium uppercase text-muted-foreground">{t("summaryAvg")}</p>
          <p className="mt-1 text-2xl font-ui-bold">
            {canViewAmounts && summary?.average_change_pct
              ? `%${summary.average_change_pct}`
              : canViewAmounts
                ? "—"
                : "•••"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card/50 p-4 col-span-2 sm:col-span-1">
          <p className="text-xs font-ui-medium uppercase text-muted-foreground">{t("summaryWindow")}</p>
          <p className="mt-1 text-sm font-ui-semibold">{t("windowLabel", { days: lookbackDays })}</p>
        </div>
      </div>

      <VirtualTable<PriceIncreaseRow>
        rows={rows}
        rowHeight={56}
        overscan={8}
        className="min-h-0 flex-1 rounded-xl border border-border/80 bg-card/50 dark:border-slate-800"
        tableClassName="text-sm"
        header={
          <thead className={virtualTableStickyHeadClass}>
            <tr>
              <th className="px-4 py-3 text-left">{t("colProduct")}</th>
              <th className="px-4 py-3 text-left">{t("colSupplier")}</th>
              <th className="px-4 py-3 text-right">{t("colPrevious")}</th>
              <th className="px-4 py-3 text-right">{t("colCurrent")}</th>
              <th className="px-4 py-3 text-right">{t("colChange")}</th>
              <th className="px-4 py-3 text-right">{t("colDate")}</th>
            </tr>
          </thead>
        }
        emptyState={
          isLoading ? (
            <div className="py-12 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">{t("empty")}</div>
          )
        }
        renderRow={(row) => (
          <>
            <td
              className="cursor-pointer px-4 py-3"
              onClick={() => openCostHistory(row)}
            >
              <div className="font-ui-medium">{row.name}</div>
              <div className="text-xs text-muted-foreground">{row.sku}</div>
            </td>
            <td
              className="cursor-pointer px-4 py-3 text-sm text-muted-foreground"
              onClick={() => openCostHistory(row)}
            >
              {row.supplier_name ?? "—"}
            </td>
            <td
              className="cursor-pointer px-4 py-3 text-right tabular-nums"
              onClick={() => openCostHistory(row)}
            >
              {formatAmount(row.previous_price, canViewAmounts)}
            </td>
            <td
              className="cursor-pointer px-4 py-3 text-right tabular-nums font-ui-semibold"
              onClick={() => openCostHistory(row)}
            >
              {formatAmount(row.current_price, canViewAmounts)}
            </td>
            <td
              className="cursor-pointer px-4 py-3 text-right tabular-nums text-orange-600 dark:text-orange-400"
              onClick={() => openCostHistory(row)}
            >
              {canViewAmounts ? `+%${row.change_pct}` : "•••"}
            </td>
            <td
              className="cursor-pointer px-4 py-3 text-right text-sm text-muted-foreground"
              onClick={() => openCostHistory(row)}
            >
              {formatDate(row.last_purchase_date)}
            </td>
          </>
        )}
      />

      <CostHistoryModal
        item={selectedItem}
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
      />
    </div>
  )
}
