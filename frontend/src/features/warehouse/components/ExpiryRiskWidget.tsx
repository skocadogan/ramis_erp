"use client"

import Link from "next/link"
import { Clock } from "lucide-react"
import { useTranslations } from "next-intl"

import { useExpirySummary } from "@/features/warehouse/hooks/useWarehouse"
import { useModulePermissions } from "@/hooks/useModulePermissions"
import { PERMISSION_INVENTORY_VIEW_EXPIRY_RISK } from "@/lib/constants"
import { cn } from "@/lib/utils"

type ExpiryRiskWidgetProps = {
  warehouseId?: string
  className?: string
  linkHref?: string
  onNavigate?: () => void
  compact?: boolean
}

export function ExpiryRiskWidget({
  warehouseId,
  className,
  linkHref = "/warehouse?tab=expiring_lots",
  onNavigate,
  compact = false,
}: ExpiryRiskWidgetProps) {
  const t = useTranslations("warehouse")
  const { canManage } = useModulePermissions()
  const canView = canManage(PERMISSION_INVENTORY_VIEW_EXPIRY_RISK)

  const { data, isLoading } = useExpirySummary(
    { warehouse_id: warehouseId },
    canView,
  )

  if (!canView) return null

  const hasRisk = (data?.within_3_days ?? 0) > 0 || (data?.expired ?? 0) > 0

  const card = compact ? (
    <div
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2 transition-all",
        hasRisk
          ? "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30"
          : "border-border bg-card border-border",
        className,
      )}
    >
      <div
        className={cn(
          "rounded p-1",
          hasRisk
            ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
            : "bg-slate-100 text-slate-500 bg-muted text-muted-foreground",
        )}
      >
        <Clock size={14} />
      </div>
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="text-2xs font-medium text-muted-foreground">{t("expiryWidget.title")}</span>
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {isLoading ? "—" : (data?.within_3_days ?? 0)}
        </span>
      </div>
    </div>
  ) : (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border/80 p-4 transition-all hover:shadow-md border-border",
        hasRisk ? "bg-amber-50 dark:bg-amber-950/30" : "bg-muted/40",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="mb-1 text-sub font-medium uppercase tracking-wider text-muted-foreground">
            {t("expiryWidget.title")}
          </p>
          <p className="text-2xl font-bold text-foreground">
            {isLoading ? "—" : (data?.within_3_days ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isLoading
              ? "…"
              : t("expiryWidget.subtitle", {
                  seven: data?.within_7_days ?? 0,
                  expired: data?.expired ?? 0,
                })}
          </p>
        </div>
        <div className={cn("rounded-lg bg-white/60 p-2 bg-card/40", hasRisk ? "text-amber-600" : "text-slate-500")}>
          <Clock size={22} />
        </div>
      </div>
    </div>
  )

  if (onNavigate) {
    return (
      <button
        type="button"
        onClick={onNavigate}
        className={cn(
          "text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          compact ? "shrink-0 rounded-md" : "block w-full rounded-xl",
        )}
      >
        {card}
      </button>
    )
  }

  if (linkHref) {
    return (
      <Link
        href={linkHref}
        className={cn(
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          compact ? "shrink-0 rounded-md" : "block rounded-xl",
        )}
      >
        {card}
      </Link>
    )
  }

  return card
}
