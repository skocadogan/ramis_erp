"use client"

import { useRef, useCallback, useEffect, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "@/lib/utils"

/** Sticky thead için opak arka plan — scroll sırasında satırların başlıktan görünmesini engeller */
export const virtualTableStickyHeadClass =
  "sticky top-0 z-10 bg-slate-50 border-b border-border bg-card border-border rounded-lg"

const virtualTableHeadDefaults =
  "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-slate-50 dark:[&_thead]:bg-slate-900 [&_thead_tr]:bg-slate-50 dark:[&_thead_tr]:bg-slate-900 [&_thead_th]:bg-slate-50 dark:[&_thead_th]:bg-slate-900"

export interface VirtualTableProps<T> {
  rows: T[]
  rowHeight?: number
  overscan?: number
  estimateSize?: (index: number) => number
  renderRow: (item: T, index: number) => ReactNode
  fetchMore?: () => void
  hasMore?: boolean
  isFetchingNextPage?: boolean
  className?: string
  tableClassName?: string
  header?: ReactNode
  emptyState?: ReactNode
  loadingMore?: ReactNode
}

export function VirtualTable<T>({
  rows,
  rowHeight = 44,
  overscan = 3,
  estimateSize,
  renderRow,
  fetchMore,
  hasMore,
  isFetchingNextPage,
  className,
  tableClassName,
  header,
  emptyState,
  loadingMore,
}: VirtualTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastScrollRef = useRef(0)

  const estimatedSize = useCallback(
    (index: number) => estimateSize?.(index) ?? rowHeight,
    [estimateSize, rowHeight]
  )

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: estimatedSize,
    overscan,
  })

  const handleScroll = useCallback(() => {
    if (!fetchMore || !hasMore || isFetchingNextPage) return
    const now = Date.now()
    if (now - lastScrollRef.current < 100) return
    lastScrollRef.current = now

    const el = scrollRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    if (scrollHeight - scrollTop - clientHeight < 300) {
      fetchMore()
    }
  }, [fetchMore, hasMore, isFetchingNextPage])

  const virtualItems = virtualizer.getVirtualItems()

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1]
    if (!lastItem || !fetchMore || !hasMore || isFetchingNextPage) return
    if (lastItem.index >= rows.length - 1) {
      fetchMore()
    }
  }, [virtualItems, rows.length, fetchMore, hasMore, isFetchingNextPage])
  const paddingTop =
    rows.length > 0 && virtualItems.length > 0 ? virtualItems[0]?.start ?? 0 : 0
  const paddingBottom =
    rows.length > 0 && virtualItems.length > 0
      ? virtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0

  if (rows.length === 0 && emptyState) {
    return <div className={className}>{emptyState}</div>
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className={cn("overflow-auto", className)}
    >
      <table className={cn("w-full", virtualTableHeadDefaults, tableClassName)}>
        {header}
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden>
              <td colSpan={99} style={{ height: paddingTop }} />
            </tr>
          )}
          {virtualItems.map((virtualItem) => (
            <tr
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
            >
              {renderRow(rows[virtualItem.index], virtualItem.index)}
            </tr>
          ))}
          {paddingBottom > 0 && (
            <tr aria-hidden>
              <td colSpan={99} style={{ height: paddingBottom }} />
            </tr>
          )}
          {isFetchingNextPage && loadingMore}
        </tbody>
      </table>
    </div>
  )
}
