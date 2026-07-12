import {
  Warehouse as WarehouseIcon,
  ShoppingCart,
  PackageCheck,
  ArrowRightLeft,
  ClipboardCheck,
  BarChart3,
  AlertCircle,
  ChefHat,
  Clock,
  RotateCcw,
  Sparkles,
  TrendingUp,
} from "lucide-react"
import type React from "react"
import type { WarehouseTabType } from "@/features/warehouse/types"
import {
  PERMISSION_INVENTORY_VIEW_EXPIRY_RISK,
  PERMISSION_INVENTORY_VIEW_RETURN_CANCEL,
  PERMISSION_WAREHOUSE_VIEW_PURCHASE_RECOMMENDATION,
} from "@/lib/constants"

export type WarehouseExtendedTab = WarehouseTabType | "summary"

export type WarehouseTabMeta = {
  key: WarehouseExtendedTab
  icon: React.ElementType
  color: string
}

const WAREHOUSE_TAB_META: WarehouseTabMeta[] = [
  { key: "summary", icon: BarChart3, color: "text-blue-500" },
  { key: "deficiency_reports", icon: AlertCircle, color: "text-amber-500" },
  { key: "purchase_recommendations", icon: Sparkles, color: "text-violet-500" },
  { key: "price_increases", icon: TrendingUp, color: "text-orange-500" },
  { key: "purchase_orders", icon: ShoppingCart, color: "text-amber-500" },
  { key: "goods_receiving", icon: PackageCheck, color: "text-emerald-500" },
  { key: "warehouses", icon: WarehouseIcon, color: "text-blue-500" },
  { key: "transfers", icon: ArrowRightLeft, color: "text-indigo-500" },
  { key: "stock_counting", icon: ClipboardCheck, color: "text-rose-500" },
  { key: "expiring_lots", icon: Clock, color: "text-amber-500" },
  { key: "kitchen_closing", icon: ChefHat, color: "text-orange-500" },
  { key: "waste_reports", icon: AlertCircle, color: "text-red-500" },
  { key: "return_cancel_reports", icon: RotateCcw, color: "text-violet-500" },
]

export function filterWarehouseTabsByPermission(
  userPermissions: string[] | undefined,
  isSuperuser: boolean | undefined,
): WarehouseTabMeta[] {
  if (isSuperuser) return WAREHOUSE_TAB_META
  const perms = userPermissions ?? []
  return WAREHOUSE_TAB_META.filter((m) => {
    if (m.key === "purchase_recommendations") {
      return perms.includes(PERMISSION_WAREHOUSE_VIEW_PURCHASE_RECOMMENDATION)
    }
    if (m.key === "expiring_lots") {
      return perms.includes(PERMISSION_INVENTORY_VIEW_EXPIRY_RISK)
    }
    if (m.key === "return_cancel_reports") {
      return perms.includes(PERMISSION_INVENTORY_VIEW_RETURN_CANCEL)
    }
    return true
  })
}

export const WAREHOUSE_NAV_SEARCH = {
  parentHref: "/warehouse",
  parentLabelKey: "warehouseManagement",
  parentGroupLabelKey: "stockWarehouse",
  operationalKey: "warehouse" as const,
}
