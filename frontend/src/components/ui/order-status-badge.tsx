"use client"

import { useTranslations } from "next-intl"
import { cn } from '@/lib/utils'

const STATUS_CLASSES: Record<string, string> = {
  PENDING:   'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-800/30',
  PREPARING: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:ring-sky-800/30',
  READY:     'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-800/30',
  DELIVERED: 'bg-muted text-muted-foreground ring-1 ring-border',
  CANCELLED: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-800/30',
  COMPLETED: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-800/30',
}

interface OrderStatusBadgeProps {
  status: string
  className?: string
  /** 'xs' = text-2xs, 'sm' = text-xs */
  size?: 'xs' | 'sm'
}

/**
 * Sipariş ve ürün durumlarını tutarlı şekilde gösteren badge bileşeni.
 * TakeawayOrderModal, TableOrderModal ve diğer yerlerdeki inline ternary'lerin yerini alır.
 *
 * @example
 *   <OrderStatusBadge status={item.status} />
 *   <OrderStatusBadge status="READY" size="sm" />
 */
const KNOWN_STATUSES = ['PENDING', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED', 'COMPLETED'] as const
type KnownStatus = (typeof KNOWN_STATUSES)[number]

export function OrderStatusBadge({ status, className, size = 'xs' }: OrderStatusBadgeProps) {
  const t = useTranslations('common.orderStatus')
  const label = (KNOWN_STATUSES as readonly string[]).includes(status)
    ? t(status as KnownStatus)
    : status
  const colorClass = STATUS_CLASSES[status] ?? 'bg-slate-100 text-muted-foreground'

  return (
    <span
      className={cn(
        'font-medium rounded-full',
        size === 'xs' ? 'text-2xs px-1.5 py-0.5' : 'text-xs px-2 py-0.5',
        colorClass,
        className
      )}
    >
      {label}
    </span>
  )
}
