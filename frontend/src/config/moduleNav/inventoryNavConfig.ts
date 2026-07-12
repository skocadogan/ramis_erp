import {
  PackageSearch,
  ArrowRightLeft,
  Truck,
  FolderTree,
  Scale,
  FileSpreadsheet,
} from "lucide-react"
import type React from "react"
import type { TabType } from "@/features/inventory/types"

export type InventoryTabMeta = {
  key: TabType
  icon: React.ElementType
  color: string
}

export const INVENTORY_TAB_META: InventoryTabMeta[] = [
  { key: "items", icon: PackageSearch, color: "text-blue-500" },
  { key: "movements", icon: ArrowRightLeft, color: "text-amber-500" },
  { key: "suppliers", icon: Truck, color: "text-emerald-500" },
  { key: "categories", icon: FolderTree, color: "text-indigo-500" },
  { key: "unit_definitions", icon: Scale, color: "text-rose-500" },
  { key: "fefo_report", icon: FileSpreadsheet, color: "text-orange-500" },
]

export const INVENTORY_NAV_SEARCH = {
  parentHref: "/inventory",
  parentLabelKey: "inventoryManagement",
  parentGroupLabelKey: "stockWarehouse",
  operationalKey: "inventory" as const,
  tabs: INVENTORY_TAB_META.map((t) => ({
    key: t.key,
    href: `/inventory?tab=${t.key}`,
    labelKey: `nav.tabs.${t.key}.label`,
    shortLabelKey: `nav.tabs.${t.key}.shortLabel`,
  })),
}
