"use client"

import { LayoutGrid } from "lucide-react"
import { SearchResultItemRow } from "./SearchResultItem"
import type { ResolvedNavSearchItem } from "../utils/navSearch"

interface NavSearchResultSectionProps {
  title: string
  badgeLabel: string
  items: ResolvedNavSearchItem[]
  onSelect: (url: string) => void
  selectedIndex: number
  startIndex: number
}

/**
 * Hızlı Arama — sayfa/menü navigasyon sonuçları grubu.
 */
export function NavSearchResultSection({
  title,
  badgeLabel,
  items,
  onSelect,
  selectedIndex,
  startIndex,
}: NavSearchResultSectionProps) {
  if (items.length === 0) return null

  return (
    <div id="search-group-nav-pages" className="mb-3">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <LayoutGrid size={13} className="text-muted-foreground dark:text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
          {title}
        </span>
        <span className="ml-auto text-xs text-muted-foreground dark:text-muted-foreground tabular-nums">
          {items.length}
        </span>
      </div>

      <div className="space-y-0.5">
        {items.map((item, idx) => {
          const globalIndex = startIndex + idx
          return (
            <SearchResultItemRow
              key={item.id}
              item={{
                id: item.id,
                title: item.title,
                subtitle: item.subtitle,
              }}
              url={item.href}
              onSelect={onSelect}
              badgeLabel={badgeLabel}
              isSelected={selectedIndex === globalIndex}
              dataIndex={globalIndex}
            />
          )
        })}
      </div>
    </div>
  )
}
