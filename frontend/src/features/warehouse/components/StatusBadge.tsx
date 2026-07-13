"use client"

import { memo } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

type StatusBadgeDomain = "po" | "gr" | "transfer" | "counting" | "deficiency"

type StatusInput = string

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  APPROVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  ORDERED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PARTIALLY_RECEIVED: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  RECEIVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  CANCELLED: "bg-destructive/10 text-destructive",
  INSPECTED: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  ACCEPTED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  PARTIALLY_ACCEPTED: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  REJECTED: "bg-destructive/10 text-destructive",
  IN_TRANSIT: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PARTIALLY_COMMITTED: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  COMMITTED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
}

interface StatusBadgeProps {
  domain: StatusBadgeDomain
  status: StatusInput
  className?: string
}

export const StatusBadge = memo(function StatusBadge({ domain, status, className }: StatusBadgeProps) {
  const tWh = useTranslations("warehouse")
  const path = `status.${domain}.${status}`
  const typedT = tWh as unknown as (key: string) => string
  const translated = typedT(path)
  const label = translated === path || translated.startsWith(`${path}.`) ? status : translated

  const colorClass = STATUS_COLORS[status] ?? "bg-muted text-muted-foreground"

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-sub font-semibold tracking-wide whitespace-nowrap",
        colorClass,
        className,
      )}
    >
      {label}
    </span>
    )
})
