import { ClipboardList, CalendarClock, BrainCircuit, Settings2 } from "lucide-react"
import type React from "react"

export type PrepTabKey = "tasks" | "templates" | "smart-rules" | "settings"

export const PREP_TAB_META: {
  key: PrepTabKey
  icon: React.ElementType
  i18nTabKey: string
}[] = [
  { key: "tasks", icon: ClipboardList, i18nTabKey: "tasks" },
  { key: "templates", icon: CalendarClock, i18nTabKey: "templates" },
  { key: "smart-rules", icon: BrainCircuit, i18nTabKey: "smartRules" },
  { key: "settings", icon: Settings2, i18nTabKey: "settings" },
]

export const PREP_NAV_SEARCH = {
  parentHref: "/prep-management",
  parentLabelKey: "prepManagement",
  parentGroupLabelKey: "kitchen",
  moduleKey: "prep" as const,
  tabs: PREP_TAB_META.map((t) => ({
    key: t.key,
    href: `/prep-management?tab=${t.key}`,
    labelKey: `management.tabs.${t.i18nTabKey}`,
  })),
}
