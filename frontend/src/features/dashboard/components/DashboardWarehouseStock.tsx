"use client"

import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import { formatAmount } from "@/lib/formatters"

interface WarehouseValue {
  warehouse_id: string
  warehouse_name: string
  warehouse_code: string
  value: number
}

export interface DashboardWarehouseStockProps {
  warehouseValues: WarehouseValue[] | undefined
  isLoading: boolean
  canViewAmounts: boolean
  className?: string
}

export function DashboardWarehouseStock({
  warehouseValues,
  isLoading,
  canViewAmounts,
  className,
}: DashboardWarehouseStockProps) {
  const t = useTranslations("dashboard")


  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <h2 className="mb-1 text-sm font-ui-semibold text-foreground">
        {t("warehouseStock.title")}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 text-muted-foreground font-ui-medium">{t("warehouseStock.warehouse")}</th>
              <th className="text-right py-2 text-muted-foreground font-ui-medium">{t("warehouseStock.value")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={2} className="py-6 text-center text-muted-foreground">{t("tables.loading")}</td>
              </tr>
            ) : (warehouseValues?.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={2} className="py-6 text-center text-muted-foreground">{t("tables.noRecords")}</td>
              </tr>
            ) : (
              warehouseValues!.slice(0, 10).map((w) => (
                <tr key={w.warehouse_id}>
                  <td className="py-2 text-foreground dark:text-slate-200">
                    {w.warehouse_name} <span className="text-xs text-muted-foreground">({w.warehouse_code})</span>
                  </td>
                  <td className="py-2 text-right font-ui-semibold text-foreground dark:text-slate-200">
                    {formatAmount(w.value, canViewAmounts)}
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
