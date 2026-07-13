"use client"

import { Warehouse as WarehouseIcon, ShoppingCart, PackageCheck, ArrowRightLeft, ClipboardCheck, Clock } from "lucide-react"
import { useTranslations } from "next-intl"
import type { WarehouseSummary } from "@/features/warehouse/types"
import { cn } from "@/lib/utils"

interface WarehouseStatsProps {
  summary?: WarehouseSummary
  isLoading?: boolean
  onOverdueClick?: () => void
}

const STAT_CARDS = [
  { key: "total_warehouses" as const, icon: WarehouseIcon, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30" },
  { key: "pending_orders" as const, icon: ShoppingCart, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30" },
  { key: "overdue_orders" as const, icon: Clock, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30", clickable: true },
  { key: "pending_receivings" as const, icon: PackageCheck, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  { key: "active_transfers" as const, icon: ArrowRightLeft, color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-950/30" },
  { key: "pending_countings" as const, icon: ClipboardCheck, color: "text-rose-500", bg: "bg-rose-50 dark:bg-rose-950/30" },
]

export function WarehouseStats({ summary, isLoading, onOverdueClick }: WarehouseStatsProps) {
  const t = useTranslations("warehouse.stats")
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {STAT_CARDS.map(({ key, icon: Icon, color, bg, clickable }) => {
        const value = summary?.[key] ?? 0
        const isOverdueCard = key === "overdue_orders"
        const isClickable = clickable && isOverdueCard && value > 0 && onOverdueClick

        return (
          <div
            key={key}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onClick={isClickable ? onOverdueClick : undefined}
            onKeyDown={
              isClickable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onOverdueClick?.()
                    }
                  }
                : undefined
            }
            className={cn(
              `group relative overflow-hidden rounded-xl border border-border/80 border-border ${bg} p-4 transition-all`,
              isClickable && "cursor-pointer hover:shadow-md hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50",
              isOverdueCard && value > 0 && "border-red-200 dark:border-red-900/50",
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sub font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  {t(key)}
                </p>
                <p className={cn(
                  "text-2xl font-bold text-foreground",
                  isOverdueCard && value > 0 && "text-red-600 dark:text-red-400",
                )}>
                  {isLoading ? "—" : value}
                </p>
              </div>
              <div className={`p-2 rounded-lg bg-white/60 bg-card/40 ${color}`}>
                <Icon size={22} />
              </div>
            </div>
            <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent ${color.replace('text-', 'via-')} to-transparent opacity-40`} />
          </div>
        )
      })}
    </div>
  )
}
