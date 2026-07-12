"use client"

import { format } from "date-fns"
import { Edit, Loader2, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table"
import { ProductDayAvailability } from "../types"
import { Button } from "@/components/ui/button"
import { formatNumber } from "@/lib/formatters"
import { cn } from "@/lib/utils"

interface AvailabilityListProps {
  availabilities: ProductDayAvailability[]
  isLoading: boolean
  onEdit: (avail: ProductDayAvailability) => void
  onDelete: (item: ProductDayAvailability) => void
  hasNextPage?: boolean
  onLoadMore?: () => void
  isFetchingNextPage?: boolean
}

export function AvailabilityList({
  availabilities,
  isLoading,
  onEdit,
  onDelete,
  hasNextPage = false,
  onLoadMore,
  isFetchingNextPage = false,
}: AvailabilityListProps) {
  const t = useTranslations("production.availabilityList")

  return (
    <VirtualTable
      rows={availabilities}
      rowHeight={60}
      overscan={12}
      fetchMore={onLoadMore ? () => void onLoadMore() : undefined}
      hasMore={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      className="min-h-0 flex-1 rounded-lg border border-border bg-card"
      tableClassName="w-full text-sm"
      header={
        <thead className={virtualTableStickyHeadClass}>
          <tr>
            <th className="text-left px-4 py-3 font-ui-semibold text-muted-foreground">
              {t("columns.date")}
            </th>
            <th className="text-left px-4 py-3 font-ui-semibold text-muted-foreground">
              {t("columns.product")}
            </th>
            <th className="text-left px-4 py-3 font-ui-semibold text-muted-foreground">
              {t("columns.branch")}
            </th>
            <th className="text-center px-4 py-3 font-ui-semibold text-muted-foreground">
              {t("columns.mode")}
            </th>
            <th className="text-right px-4 py-3 font-ui-semibold text-muted-foreground">
              {t("columns.remaining")}
            </th>
            <th className="text-right px-4 py-3 font-ui-semibold text-muted-foreground">
              {t("columns.actions")}
            </th>
          </tr>
        </thead>
      }
      emptyState={
        isLoading ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center py-20 text-muted-foreground">
            {t("empty")}
          </div>
        )
      }
      loadingMore={
        <tr>
          <td colSpan={6} className="text-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600 mx-auto" />
          </td>
        </tr>
      }
      renderRow={(item) => (
        <>
          <td className="px-4 py-3 font-ui-medium text-foreground align-middle">
            {item.effective_date ? format(new Date(item.effective_date), "dd-MM-yyyy") : "-"}
          </td>
          <td className="px-4 py-3 text-foreground font-ui-medium align-middle">
            {item.product_name || t("unknownProduct")}
          </td>
          <td className="px-4 py-3 text-muted-foreground align-middle">
            {item.branch_name || t("allBranches")}
          </td>
          <td className="px-4 py-3 text-center align-middle">
            <span
              className={cn(
                "inline-flex items-center px-2 py-1 rounded-full text-xs font-ui-bold",
                item.mode === "SOLD_OUT"
                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  : item.mode === "LIMITED"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
              )}
            >
              {item.mode === "SOLD_OUT"
                ? t("modeSoldOut")
                : item.mode === "LIMITED"
                  ? t("modeLimited")
                  : t("modeUnlimited")}
            </span>
          </td>
          <td className="px-4 py-3 text-right font-ui-semibold text-foreground align-middle">
            {item.mode === "LIMITED" && item.remaining_portions !== null
              ? formatNumber(item.remaining_portions, 0)
              : item.mode === "SOLD_OUT"
                ? "0"
                : "-"}
          </td>
          <td className="px-4 py-3 text-right align-middle">
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(item)}
                title={t("editTitle")}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(item)}
                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </td>
        </>
      )}
    />
  )
}
