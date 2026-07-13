"use client"

import React, { memo, useState } from "react"
import { Package, AlertTriangle, CircleDollarSign, Wallet, Info } from "lucide-react"
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts"
import { formatAmount } from "@/lib/formatters"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLocale, useTranslations } from "next-intl"

interface InventoryStatsProps {
  totalItems: number
  totalValue: number
  approximateStockValue: number
  lowStockCount: number
  totalReservedQty?: number
  onLowStockClick?: () => void
  isLowStockActive?: boolean
  compact?: boolean
}

export const InventoryStats = memo(
  ({
    totalItems,
    totalValue,
    approximateStockValue,
    lowStockCount,
    totalReservedQty = 0,
    onLowStockClick,
    isLowStockActive,
    compact = false,
  }: InventoryStatsProps) => {
    const canViewAmounts = useCanViewAmounts()
    const [infoKey, setInfoKey] = useState<null | "value" | "approx">(null)
    const t = useTranslations("inventory")
    const locale = useLocale()

    const cards = [
      {
        id: "total",
        icon: Package,
        iconBg: "bg-blue-100 dark:bg-blue-900/40",
        iconColor: "text-blue-600 dark:text-blue-400",
        label: t("stats.totalProducts"),
        value: totalItems,
        valueColor: "text-foreground",
        clickable: false,
        kind: "count" as const,
      },
      {
        id: "value",
        icon: CircleDollarSign,
        iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
        iconColor: "text-emerald-600 dark:text-emerald-400",
        label: t("stats.totalInventoryValue"),
        value: totalValue,
        valueColor: "text-emerald-700 dark:text-emerald-300",
        clickable: false,
        kind: "currency" as const,
      },
      {
        id: "approx",
        icon: Wallet,
        iconBg: "bg-violet-100 dark:bg-violet-900/40",
        iconColor: "text-violet-600 dark:text-violet-400",
        label: t("stats.approxStockValue"),
        value: approximateStockValue,
        valueColor: "text-violet-700 dark:text-violet-300",
        clickable: false,
        kind: "currency" as const,
      },
      {
        id: "low",
        icon: AlertTriangle,
        iconBg: isLowStockActive ? "bg-red-100 dark:bg-red-900/60" : "bg-amber-100 dark:bg-amber-900/40",
        iconColor: isLowStockActive ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400",
        label: t("stats.lowStock"),
        value: lowStockCount,
        valueColor: isLowStockActive ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400",
        clickable: true,
        active: isLowStockActive,
        kind: "count" as const,
      },
    ]

    return (
      <>
        <div
          className={
            compact
              ? "flex items-center gap-1.5 shrink-0 overflow-x-auto"
              : "grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0"
          }
        >
          {cards.map((card) => {
            const Icon = card.icon
            const display =
              card.kind === "currency"
                ? formatAmount(card.value, canViewAmounts)
                : valueFormatter(card.value, locale)
            const showInfo = card.id === "value" || card.id === "approx"
            return (
              <div
                key={card.id}
                onClick={card.clickable ? onLowStockClick : undefined}
                className={`bg-card rounded-md border flex items-center transition-all shrink-0
 ${compact ? "h-9 gap-1.5 px-2" : "px-3 py-2.5 rounded-lg gap-3"}
 ${card.clickable ? "cursor-pointer hover:shadow-md active:scale-[0.98]" : ""}
 ${card.active ? "border-red-200 dark:border-red-900/50 ring-1 ring-red-500/20" : "border-border"}`}
              >
                <div
                  className={`${card.iconBg} rounded ${card.iconColor} shrink-0 ${compact ? "p-1" : "p-2 rounded-md"}`}
                >
                  <Icon size={compact ? 14 : 18} />
                </div>
                <div className="min-w-0">
                  {compact ? (
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className="text-2xs font-medium text-muted-foreground">{card.label}</span>
                      <span className={`text-xs font-semibold tabular-nums ${card.valueColor}`}>{display}</span>
                      {showInfo && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setInfoKey(card.id === "value" ? "value" : "approx")
                          }}
                          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover: hover: dark:hover: dark:hover:"
                          aria-label={`${card.label} ${t("stats.infoAriaSuffix")}`}
                        >
                          <Info className="size-3" />
                        </button>
                      )}
                      {card.id === "total" && totalReservedQty > 0 && (
                        <span className="text-2xs font-medium text-amber-600 dark:text-amber-400">
                          -{totalReservedQty}
                        </span>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
                        {showInfo && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setInfoKey(card.id === "value" ? "value" : "approx")
                            }}
                            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover: hover: dark:hover: dark:hover:"
                            aria-label={`${card.label} ${t("stats.infoAriaSuffix")}`}
                          >
                            <Info className="size-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <p className={`text-lg font-semibold ${card.valueColor}`}>{display}</p>
                        {card.id === "total" && totalReservedQty > 0 && (
                          <span className="text-2xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1 rounded">
                            -{totalReservedQty} {t("stats.reservedSuffix")}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {!compact && card.active && (
                  <div className="ml-auto w-1.5 h-1.5 shrink-0 rounded-full bg-red-500/70" />
                )}
              </div>
            )
          })}
        </div>

        <Dialog open={infoKey !== null} onOpenChange={(open) => !open && setInfoKey(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {infoKey === "value" ? t("stats.dialogValueTitle") : t("stats.dialogApproxTitle")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm text-foreground">
              {infoKey === "value" ? (
                <>
                  <p>
                    {t.rich("stats.dialogValueP1", {
                      last: (chunks) => <strong>{chunks}</strong>,
                      qty: (chunks) => <strong>{chunks}</strong>,
                    })}
                  </p>
                  <p className="text-muted-foreground">{t("stats.dialogValueP2")}</p>
                </>
              ) : infoKey === "approx" ? (
                <>
                  <p>
                    {t.rich("stats.dialogApproxP1", {
                      avg: (chunks) => <strong>{chunks}</strong>,
                    })}
                  </p>
                  <p className="text-muted-foreground">{t("stats.dialogApproxP2")}</p>
                </>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      </>
    )
  },
)
InventoryStats.displayName = "InventoryStats"

function valueFormatter(val: number, locale: string) {
  return new Intl.NumberFormat(locale).format(val)
}
