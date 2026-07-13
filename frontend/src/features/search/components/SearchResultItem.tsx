"use client"

import type { SearchResultItem } from "../types"

interface SearchResultItemProps {
  item: SearchResultItem
  url: string
  /** Called with the full URL when the row is selected (click or Enter). */
  onSelect: (url: string) => void
  /** Compact category badge text (e.g. "Menü", "Sipariş"). */
  badgeLabel?: string
  /** Whether this item is currently highlighted via keyboard navigation. */
  isSelected?: boolean
  /** Flat-index used for keyboard navigation and scroll-into-view. */
  dataIndex?: number
}

/**
 * Arama sonuç listesindeki tek bir satır.
 * Tıklandığında veya klavye ile seçildiğinde parent callback üzerinden
 * yönlendirme yapılır ve dialog kapatılır.
 */
export function SearchResultItemRow({
  item,
  url,
  onSelect,
  badgeLabel,
  isSelected = false,
  dataIndex,
}: SearchResultItemProps) {
  const handleClick = () => {
    onSelect(url)
  }

  return (
    <button
      id={`search-result-${item.id}`}
      data-search-index={dataIndex}
      onClick={handleClick}
      className={[
        "w-full flex items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
        "focus:outline-none",
        isSelected
          ? "bg-accent bg-accent"
          : "hover:bg-slate-100 dark:hover:bg-slate-800",
      ].join(" ")}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-800 text-foreground truncate">
            {item.title}
          </p>
          {badgeLabel && (
            <span className="inline-flex h-5 shrink-0 items-center rounded-4xl border border-border/60 bg-muted/60 px-2 text-2xs font-medium text-muted-foreground whitespace-nowrap">
              {badgeLabel}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {item.subtitle}
        </p>
      </div>
    </button>
  )
}
