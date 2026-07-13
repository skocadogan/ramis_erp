"use client"

import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import { useLocalizedFormatters } from "@/lib/formatters"

interface ConsumptionItem {
  stock_item_id: string
  name: string
  sku: string
  unit: string
  consumed: number
}

export interface DashboardConsumptionProps {
  consumptionTop: ConsumptionItem[] | undefined
  isLoading: boolean
  className?: string
}

export function DashboardConsumption({
  consumptionTop,
  isLoading,
  className,
}: DashboardConsumptionProps) {
  const t = useTranslations("dashboard")
  const { formatQuantity } = useLocalizedFormatters()

  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <h2 className="mb-1 text-sm font-semibold text-foreground">
        {t("topConsumption.title")}
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">{t("topConsumption.hint")}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 text-muted-foreground font-medium">{t("topConsumption.stock")}</th>
              <th className="text-left py-2 text-muted-foreground font-medium">{t("topConsumption.sku")}</th>
              <th className="text-right py-2 text-muted-foreground font-medium">{t("topConsumption.consumption")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={3} className="py-6 text-center text-muted-foreground">{t("tables.loading")}</td>
              </tr>
            ) : (consumptionTop?.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={3} className="py-6 text-center text-muted-foreground">{t("tables.noRecords")}</td>
              </tr>
            ) : (
              consumptionTop!.map((r) => (
                <tr key={r.stock_item_id}>
                  <td className="py-2 text-foreground">{r.name}</td>
                  <td className="py-2 font-mono text-xs text-muted-foreground">{r.sku}</td>
                  <td className="py-2 text-right font-semibold text-foreground">
                    {formatQuantity(r.consumed)} {r.unit}
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
