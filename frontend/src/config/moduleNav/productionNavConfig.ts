import { ClipboardList, CalendarClock, Settings2 } from "lucide-react"
import type React from "react"

export type ProductionTabKey = "plans" | "availability" | "settings"

export const PRODUCTION_TAB_META: {
  key: ProductionTabKey
  icon: React.ElementType
}[] = [
  { key: "plans", icon: ClipboardList },
  { key: "availability", icon: CalendarClock },
  { key: "settings", icon: Settings2 },
]

export const PRODUCTION_NAV_SEARCH = {
  parentHref: "/production-planning",
  parentLabelKey: "productionPlanning",
  parentGroupLabelKey: "kitchen",
  operationalKey: "production_planning" as const,
  tabs: PRODUCTION_TAB_META.map((t) => ({
    key: t.key,
    href: `/production-planning?tab=${t.key}`,
    labelKey: `page.tabs.${t.key}`,
  })),
}
