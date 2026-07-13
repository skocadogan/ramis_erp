"use client"

import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import { useLocalizedFormatters, formatAmount } from "@/lib/formatters"

interface PayRow {
  key: string
  label: string
  value: number
}

interface TopProduct {
  name: string
  quantity: number
  revenue: number
}

export interface DashboardPaymentBreakdownProps {
  payData: PayRow[]
  topProducts: TopProduct[] | undefined
  canViewAmounts: boolean
  className?: string
}

export function DashboardPaymentBreakdown({
  payData,
  topProducts,
  canViewAmounts,
  className,
}: DashboardPaymentBreakdownProps) {
  const t = useTranslations("dashboard")
  const { formatNumber } = useLocalizedFormatters()

  return (
    <div className={cn("grid gap-6 lg:grid-cols-2", className)}>
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">{t("paymentBreakdown.title")}</h2>
        <ul className="space-y-2 text-sm">
          {payData.map((row) => (
            <li key={row.key} className="flex justify-between">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-semibold">
                {formatAmount(row.value, canViewAmounts)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">{t("topSellers.title")}</h2>
        <ul className="space-y-2 text-sm">
          {(topProducts ?? []).slice(0, 10).map((p) => (
            <li key={p.name} className="flex justify-between gap-2">
              <span className="truncate text-foreground">{p.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {formatNumber(p.quantity, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}{" "}
                {t("topSellers.piece")} ·{" "}
                {formatAmount(p.revenue, canViewAmounts)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
