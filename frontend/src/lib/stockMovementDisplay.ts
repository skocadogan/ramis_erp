import type { StockMovement } from "@/features/inventory/types"

const STOCK_RETURN_CANCEL_REASON_CODES = [
  "EXPIRED",
  "DAMAGED",
  "SUPPLIER_ERROR",
  "ORDER_CANCELLED",
  "QUALITY_ISSUE",
  "RECALL",
  "OTHER",
] as const

type ReasonCode = (typeof STOCK_RETURN_CANCEL_REASON_CODES)[number]

const MOVEMENT_TYPE_KEYS: StockMovement["movement_type"][] = [
  "IN",
  "OUT",
  "ADJUSTMENT",
  "TRANSFER",
  "WASTE",
  "RETURN",
  "CANCEL",
  "DISPOSAL",
]

export type MovementTypeTranslateFn = (key: StockMovement["movement_type"]) => string
export type ReasonTranslateFn = (key: ReasonCode) => string

type MovementQuantityFields = Pick<
  StockMovement,
  "movement_type" | "quantity" | "reference"
> & {
  signed_quantity?: number | null
}

const ADJUSTMENT_DIFF_RE = /:\s*([+-]?\d+(?:[.,]\d+)?)\s*$/

/** Hareketin stok üzerindeki işaretli miktarı (net etki). */
export function getStockMovementSignedQuantity(movement: MovementQuantityFields): number {
  if (movement.signed_quantity != null && !Number.isNaN(Number(movement.signed_quantity))) {
    return Number(movement.signed_quantity)
  }

  const qty = Math.abs(Number(movement.quantity) || 0)

  switch (movement.movement_type) {
    case "IN":
    case "RETURN":
      return qty
    case "OUT":
    case "WASTE":
    case "DISPOSAL":
    case "CANCEL":
      return -qty
    case "ADJUSTMENT": {
      const ref = (movement.reference || "").trim()
      const match = ref.match(ADJUSTMENT_DIFF_RE)
      if (match) {
        const diff = Number.parseFloat(match[1].replace(",", "."))
        if (!Number.isNaN(diff)) return diff
      }
      return qty
    }
    default:
      return qty
  }
}

/** Miktar sütunu metin rengi — sıfır nötr, pozitif yeşil, negatif kırmızı. */
export function stockMovementQuantityTextClass(movement: MovementQuantityFields): string {
  const signed = getStockMovementSignedQuantity(movement)
  if (signed > 0) return "text-emerald-600 dark:text-emerald-400"
  if (signed < 0) return "text-rose-600 dark:text-rose-400"
  return "text-muted-foreground"
}

export function formatStockMovementQuantitySign(movement: MovementQuantityFields): string {
  const signed = getStockMovementSignedQuantity(movement)
  if (signed > 0) return "+"
  if (signed < 0) return "-"
  return ""
}

function isReturnCancelReasonCode(value: string | null | undefined): value is ReasonCode {
  if (!value) return false
  return (STOCK_RETURN_CANCEL_REASON_CODES as readonly string[]).includes(value.trim().toUpperCase())
}

/** Hareket tipi etiketi — `inventory.movementType` namespace'i ile kullanın. */
export function getStockMovementTypeLabel(
  mt: StockMovement["movement_type"],
  t: MovementTypeTranslateFn,
): string {
  if (MOVEMENT_TYPE_KEYS.includes(mt)) {
    return t(mt)
  }
  return mt
}

/** Referans alanındaki neden kodlarını çevirir; diğer referanslar olduğu gibi kalır. */
export function formatStockMovementReference(
  reference: string | null | undefined,
  notes: string | null | undefined,
  tReason: ReasonTranslateFn,
): string {
  const ref = (reference || "").trim()
  if (!ref) {
    return notes?.trim() || "—"
  }
  if (isReturnCancelReasonCode(ref)) {
    const label = tReason(ref)
    const extra = (notes || "").trim()
    if (ref === "OTHER" && extra) return extra
    if (extra) return `${label} — ${extra}`
    return label
  }
  if (ref.startsWith("KDS:")) {
    return notes?.trim() || ref
  }
  return ref
}

/** Badge renk sınıfları — tip bazlı. */
export function stockMovementTypeBadgeClass(mt: StockMovement["movement_type"]): string {
  switch (mt) {
    case "IN":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
    case "OUT":
      return "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
    case "ADJUSTMENT":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
    case "TRANSFER":
      return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300"
    case "RETURN":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
    case "CANCEL":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300"
    case "DISPOSAL":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
    case "WASTE":
    default:
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
  }
}
