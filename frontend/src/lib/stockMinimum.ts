/**
 * Backend ile uyumlu: minimum_quantity === -1 → sınırsız (kritik stok kontrollerinde yok sayılır).
 */

export const MINIMUM_UNLIMITED_SENTINEL = -1

export function isMinimumUnlimited(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined || value === "") return false
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."))
  return !Number.isNaN(n) && n === MINIMUM_UNLIMITED_SENTINEL
}

function hasPositiveMinimumThreshold(
  value: string | number | null | undefined,
): boolean {
  if (isMinimumUnlimited(value)) return false
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."))
  return Number.isFinite(n) && n > 0
}

/** Backend `is_quantity_below_minimum` ile uyumlu: eşitlik dahil değil. */
export function isQuantityBelowMinimum(
  quantity: number,
  minimum: string | number | null | undefined,
): boolean {
  if (!hasPositiveMinimumThreshold(minimum)) return false
  const min =
    typeof minimum === "number" ? minimum : Number(String(minimum).replace(",", "."))
  if (!Number.isFinite(min)) return false
  return quantity < min
}

/** Tablo / özet için kısa etiket */
export function formatMinimumQuantityDisplay(
  value: string | number | null | undefined,
  unit?: string,
): string {
  if (isMinimumUnlimited(value)) return "Sınırsız"
  const u = unit ? ` ${unit}` : ""
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."))
  if (Number.isNaN(n)) return `—${u}`
  return `${Number.isInteger(n) ? n : n.toFixed(2)}${u}`
}
