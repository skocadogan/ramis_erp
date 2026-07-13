"use client"

import { format } from "date-fns"
import { Edit, Loader2, CheckCircle, Trash2, Copy, Calculator } from "lucide-react"
import { useTranslations } from "next-intl"
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table"
import { ProductionPlan } from "../types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PlansListProps {
  plans: ProductionPlan[]
  isLoading: boolean
  onEdit: (plan: ProductionPlan) => void
  onApprove: (id: string) => void
  onDelete: (plan: ProductionPlan) => void
  onViewMrp: (plan: ProductionPlan) => void
  onViewApproximateCost: (plan: ProductionPlan) => void
  onApplyForecast: (plan: ProductionPlan) => void
  onCopy: (plan: ProductionPlan) => void
  hasNextPage?: boolean
  onLoadMore?: () => void
  isFetchingNextPage?: boolean
}

export function PlansList({
  plans,
  isLoading,
  onEdit,
  onApprove,
  onDelete,
  onViewMrp,
  onViewApproximateCost,
  onApplyForecast,
  onCopy,
  hasNextPage = false,
  onLoadMore,
  isFetchingNextPage = false,
}: PlansListProps) {
  const t = useTranslations("production.plansList")

  return (
    <VirtualTable
      rows={plans}
      rowHeight={68}
      overscan={12}
      fetchMore={onLoadMore ? () => void onLoadMore() : undefined}
      hasMore={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      className="min-h-0 flex-1 rounded-lg border border-border bg-card"
      tableClassName="w-full text-sm"
      header={
        <thead className={virtualTableStickyHeadClass}>
          <tr>
            <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
              {t("columns.date")}
            </th>
            <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
              {t("columns.branch")}
            </th>
            <th className="text-center px-4 py-3 font-semibold text-muted-foreground">
              {t("columns.status")}
            </th>
            <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
              {t("columns.notes")}
            </th>
            <th className="text-right px-4 py-3 font-semibold text-muted-foreground">
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
          <td colSpan={5} className="text-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600 mx-auto" />
          </td>
        </tr>
      }
      renderRow={(plan) => (
        <>
          <td className="px-4 py-3 font-medium text-foreground align-middle">
            {plan.plan_date ? format(new Date(plan.plan_date), "dd-MM-yyyy") : "-"}
          </td>
          <td className="px-4 py-3 text-muted-foreground align-middle">
            {plan.branch_name || t("branchHQ")}
          </td>
          <td className="px-4 py-3 text-center align-middle">
            <span
              className={cn(
                "inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold",
                plan.status === "APPROVED"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : plan.status === "DRAFT"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : "bg-slate-100 text-slate-700 bg-muted text-muted-foreground",
              )}
            >
              {plan.status === "APPROVED"
                ? t("statusApproved")
                : plan.status === "DRAFT"
                  ? t("statusDraft")
                  : plan.status}
            </span>
          </td>
          <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px] align-middle">
            {plan.notes || "-"}
          </td>
          <td className="px-4 py-3 text-right align-middle">
            <div className="flex items-center justify-end gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewApproximateCost(plan)}
                title={t("approxCostTitle")}
                className="h-8 gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-900/40 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
              >
                <Calculator className="h-3.5 w-3.5 hidden sm:block" /> {t("approxCost")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewMrp(plan)}
                title={t("mrpTitle")}
                className="h-8 gap-1 text-blue-600 border-blue-200 hover:bg-blue-50 dark:border-blue-900/40 dark:hover:bg-blue-900/20"
              >
                <CheckCircle className="h-3.5 w-3.5 hidden sm:block" /> {t("mrp")}
              </Button>
              {plan.status === "DRAFT" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onApplyForecast(plan)}
                    title={t("forecastTitle")}
                    className="h-8 gap-1 text-purple-600 border-purple-200 hover:bg-purple-50 dark:border-purple-900/40 dark:hover:bg-purple-900/20"
                  >
                    {t("forecast")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onApprove(plan.id)}
                    title={t("approveTitle")}
                    className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                  >
                    <CheckCircle className="h-4 w-4" />
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCopy(plan)}
                title={t("copyTitle")}
                className="h-8 gap-1 text-slate-600 border-border hover:bg-slate-100 text-muted-foreground border-input dark:hover:bg-slate-800"
              >
                <Copy className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("copy")}</span>
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onEdit(plan)} title={t("editTitle")}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(plan)}
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
