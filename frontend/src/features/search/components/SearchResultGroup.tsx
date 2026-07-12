"use client"

import { useTranslations } from "next-intl"
import type { SearchResultGroup } from "../types"
import { SearchResultItemRow } from "./SearchResultItem"
import { getSearchModuleBadge, getSearchModuleLabel } from "../utils/searchModuleLabels"

import {
  UtensilsCrossed,
  FolderOpen,
  ShoppingCart,
  Package,
  Truck,
  Building2,
  Grid3X3,
  Users,
  Warehouse,
  ClipboardList,
  CalendarCheck,
  FileText,
} from "lucide-react"

const ICON_MAP: Record<string, React.ElementType> = {
  UtensilsCrossed,
  FolderOpen,
  ShoppingCart,
  Package,
  Truck,
  Building2,
  Grid3X3,
  Users,
  Warehouse,
  ClipboardList,
  CalendarCheck,
  FileText,
}

interface SearchResultGroupProps {
  moduleKey: string
  group: SearchResultGroup
  onSelect: (url: string) => void
  selectedIndex: number
  startIndex: number
}

/**
 * Bir modülün arama sonuçlarını başlık + liste olarak gösterir.
 * Grup başlığı ve badge aktif locale'e göre çözülür; eksik key'de API fallback.
 */
export function SearchResultGroupSection({
  moduleKey,
  group,
  onSelect,
  selectedIndex,
  startIndex,
}: SearchResultGroupProps) {
  const tModules = useTranslations("common.globalSearch.modules")
  const Icon = ICON_MAP[group.icon] ?? Package
  const groupLabel = getSearchModuleLabel(moduleKey, group.label, tModules)
  const badgeLabel = getSearchModuleBadge(moduleKey, tModules)

  return (
    <div id={`search-group-${moduleKey}`} className="mb-3">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Icon size={13} className="text-muted-foreground dark:text-muted-foreground shrink-0" />
        <span className="text-xs font-ui-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground">
          {groupLabel}
        </span>
        <span className="ml-auto text-xs text-muted-foreground dark:text-muted-foreground tabular-nums">
          {group.count}
        </span>
      </div>

      <div className="space-y-0.5">
        {group.items.map((item, idx) => {
          const globalIndex = startIndex + idx
          return (
            <SearchResultItemRow
              key={item.id}
              item={item}
              url={group.url}
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
