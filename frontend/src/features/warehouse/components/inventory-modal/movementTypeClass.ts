import type { StockMovement } from "@/features/inventory/types"

export function movementTypeClass(t: StockMovement["movement_type"]) {
  switch (t) {
    case "IN":
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
    case "OUT":
      return "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
    case "ADJUSTMENT":
      return "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
    case "TRANSFER":
      return "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
    case "RETURN":
      return "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
    case "CANCEL":
      return "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
    case "DISPOSAL":
    case "WASTE":
      return "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
    default:
      return "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
  }
}
