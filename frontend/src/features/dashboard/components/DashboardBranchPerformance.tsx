"use client"

import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import { formatAmount } from "@/lib/formatters"

interface BranchRevenue {
  branch_id: string
  branch_name: string
  revenue: number
}

export interface DashboardBranchPerformanceProps {
  branchRevenue: BranchRevenue[] | undefined
  isLoading: boolean
  canViewAmounts: boolean
  className?: string
}

export function DashboardBranchPerformance({
  branchRevenue,
  isLoading,
  canViewAmounts,
  className,
}: DashboardBranchPerformanceProps) {
  const t = useTranslations("dashboard")


  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <h2 className="mb-1 text-sm font-semibold text-foreground">
        {t("branchPerformance.title")}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 text-muted-foreground font-medium">{t("branchPerformance.branch")}</th>
              <th className="text-right py-2 text-muted-foreground font-medium">{t("branchPerformance.revenue")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={2} className="py-6 text-center text-muted-foreground">{t("tables.loading")}</td>
              </tr>
            ) : (branchRevenue?.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={2} className="py-6 text-center text-muted-foreground">{t("tables.noData")}</td>
              </tr>
            ) : (
              branchRevenue!.map((b) => (
                <tr key={b.branch_id}>
                  <td className="py-2 text-foreground">{b.branch_name}</td>
                  <td className="py-2 text-right font-semibold text-foreground">
                    {formatAmount(b.revenue, canViewAmounts)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
