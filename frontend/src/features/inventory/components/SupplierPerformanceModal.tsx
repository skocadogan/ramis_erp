"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import { useProcurementAlerts } from "@/features/warehouse/hooks/useWarehouse"
import type { Supplier, SupplierDetailTab } from "@/features/inventory/types"

export function SupplierPerformanceModal({
  supplier,
  onClose,
  onShowDetail,
}: {
  supplier: Supplier
  onClose: () => void
  onShowDetail?: (tab: SupplierDetailTab) => void
}) {
  const t = useTranslations("inventory.supplierPerformance")
  const [days, setDays] = useState(30)

  const perf = useQuery({
    queryKey: ["supplier-performance", supplier.id, days],
    queryFn: () => inventoryApi.getSupplierPerformance(supplier.id, days),
  })

  const overdue = useProcurementAlerts({ supplier_id: supplier.id })

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent layout="scroll" size="lg" className="max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{supplier.name}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("period")}</span>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
            >
              <option value={7}>{t("days7")}</option>
              <option value={30}>{t("days30")}</option>
              <option value={90}>{t("days90")}</option>
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card
              label={t("receivingsCount")}
              value={perf.data?.receivings_count}
              loading={perf.isLoading}
              onClick={onShowDetail ? () => onShowDetail("receivings") : undefined}
              clickable
            />
            <Card
              label={t("avgDelivery")}
              value={perf.data?.avg_lead_days != null ? Number(perf.data.avg_lead_days).toFixed(1) : "—"}
              loading={perf.isLoading}
            />
            <Card
              label={t("rejectRate")}
              value={perf.data ? `${Math.round((Number(perf.data.rejection_rate) || 0) * 100)}%` : "—"}
              loading={perf.isLoading}
              onClick={onShowDetail ? () => onShowDetail("rejected") : undefined}
              clickable
            />
            <Card
              label={t("onTimeRate")}
              value={perf.data?.on_time_rate != null ? `${Math.round(Number(perf.data.on_time_rate) * 100)}%` : "—"}
              loading={perf.isLoading}
            />
          </div>

          {(overdue.data?.overdue_orders?.length ?? 0) > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
              <p className="text-sm font-ui-semibold text-amber-900 dark:text-amber-100">
                {t("overdueOrdersTitle", { count: overdue.data?.overdue_orders_count ?? 0 })}
              </p>
              <ul className="mt-2 space-y-2">
                {overdue.data?.overdue_orders.map((po) => (
                  <li
                    key={po.po_id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm text-amber-900/90 dark:text-amber-100/90"
                  >
                    <span className="font-ui-medium">{po.order_number}</span>
                    <span className="text-xs">
                      {t("overdueDays", { days: po.days_overdue, date: po.expected_date })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function Card({
  label,
  value,
  loading,
  onClick,
  clickable,
}: {
  label: string
  value: React.ReactNode
  loading?: boolean
  onClick?: () => void
  clickable?: boolean
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-background p-4 ${
        clickable ? "cursor-pointer transition-colors hover:border-border hover:bg-background" : ""
      }`}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.() } } : undefined}
    >
      <p className="text-xs font-ui-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-ui-bold text-foreground">{loading ? "—" : (value ?? 0)}</p>
    </div>
  )
}
