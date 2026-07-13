"use client"

import { useTranslations } from "next-intl"
import { AMOUNT_DISPLAY_MASK, formatAmount, useLocalizedFormatters } from "@/lib/formatters"
import { MiniSparkline } from "@/app/dashboard/DashboardChartsSection"
import { AnimatedValue } from "@/components/ui/animated-value"

interface RevenueData {
  today: number
  yesterday: number
  change_pct: number
  sparkline_data?: { date: string; value: number }[]
}

interface OrderCountData {
  today: number
  yesterday: number
  change_pct: number
  sparkline_data?: { date: string; value: number }[]
}

interface TargetStats {
  month_revenue: number
  target_revenue: number
  percentage: number
}

interface ActiveShift {
  id: string
  opened_at: string
  opening_cash: number
  branch_id: string
}

export interface DashboardKPIGridProps {
  revenue: RevenueData | undefined
  orderCount: OrderCountData | undefined
  targetStats: TargetStats | undefined
  avgOrderValue: number | undefined
  activeShift: ActiveShift | null | undefined
  canViewAmounts: boolean
  dateRangePreset: string
  lowStockCount: number | undefined
  stockValue: number | undefined
  wasteRatio: number | undefined
  inventoryLoading: boolean
}

export function DashboardKPIGrid({
  revenue,
  orderCount,
  targetStats,
  avgOrderValue,
  activeShift,
  canViewAmounts,
  dateRangePreset,
  lowStockCount,
  stockValue,
  wasteRatio,
  inventoryLoading,
}: DashboardKPIGridProps) {
  const t = useTranslations("dashboard")
  const { formatCurrency } = useLocalizedFormatters()

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex-1 p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {t("kpi.revenue", { period: t(`presets.${dateRangePreset}`) })}
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              <AnimatedValue value={formatAmount(revenue?.today ?? 0, canViewAmounts)} />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("kpi.yesterday")}{" "}
              {formatAmount(revenue?.yesterday ?? 0, canViewAmounts)}
              <span className={`ml-1 font-semibold ${(revenue?.change_pct ?? 0) >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                ({(revenue?.change_pct ?? 0) >= 0 ? '+' : ''}{revenue?.change_pct ?? 0}%)
              </span>
            </p>
          </div>
          {revenue?.sparkline_data && (
            <MiniSparkline data={revenue.sparkline_data} color="#10b981" />
          )}
        </div>
        <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex-1 p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">{t("kpi.orderCount")}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              <AnimatedValue value={orderCount?.today ?? 0} />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("kpi.yesterday")} {orderCount?.yesterday ?? 0}
              <span className={`ml-1 font-semibold ${(orderCount?.change_pct ?? 0) >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                ({(orderCount?.change_pct ?? 0) >= 0 ? '+' : ''}{orderCount?.change_pct ?? 0}%)
              </span>
            </p>
          </div>
          {orderCount?.sparkline_data && (
            <MiniSparkline data={orderCount.sparkline_data} color="#3b82f6" />
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("kpi.monthlyTarget")}</p>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <p className="text-2xl font-bold text-foreground">
              <AnimatedValue value={`%${targetStats?.percentage ?? 0}`} />
            </p>
            <p className="text-2xs text-muted-foreground">
              {canViewAmounts
                ? `${formatCurrency(targetStats?.month_revenue ?? 0)} / ${formatCurrency(targetStats?.target_revenue ?? 0)}`
                : AMOUNT_DISPLAY_MASK}
            </p>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-700 ease-out"
              style={{ width: `${Math.min(targetStats?.percentage ?? 0, 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("kpi.avgTicket")}</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            <AnimatedValue value={formatAmount(avgOrderValue ?? 0, canViewAmounts)} />
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("kpi.openShift")}</p>
          {activeShift ? (
            <p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              {t("kpi.openingCash", {
                amount: canViewAmounts
                  ? formatCurrency(activeShift.opening_cash)
                  : AMOUNT_DISPLAY_MASK,
              })}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{t("kpi.none")}</p>
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("inventoryKpi.criticalStock")}</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {inventoryLoading ? "—" : <AnimatedValue value={lowStockCount ?? 0} />}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("inventoryKpi.belowMinimum")}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("inventoryKpi.stockValue")}</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {inventoryLoading
              ? "—"
              : <AnimatedValue value={formatAmount(stockValue ?? 0, canViewAmounts)} />}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-muted-foreground">{t("inventoryKpi.wasteRatio")}</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {inventoryLoading ? "—" : <AnimatedValue value={`${Math.round((wasteRatio ?? 0) * 100)}%`} />}
          </p>
        </div>
      </div>
    </>
  )
}
