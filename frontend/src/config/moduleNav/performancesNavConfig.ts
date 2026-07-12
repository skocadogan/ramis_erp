import { BarChart3, TrendingUp } from "lucide-react"
import type React from "react"

type PerformanceTabKey = "waiterCalls" | "waiterSales"

const PERFORMANCE_TAB_META: {
  key: PerformanceTabKey
  icon: React.ElementType
}[] = [
  { key: "waiterCalls", icon: BarChart3 },
  { key: "waiterSales", icon: TrendingUp },
]

export const PERFORMANCES_NAV_SEARCH = {
  parentHref: "/performances",
  parentLabelKey: "performanceManagement",
  parentGroupLabelKey: "personnel",
  moduleKey: "performances" as const,
  tabs: PERFORMANCE_TAB_META.map((t) => ({
    key: t.key,
    href: `/performances?tab=${t.key}`,
    labelKey: `tabs.${t.key}`,
  })),
}
