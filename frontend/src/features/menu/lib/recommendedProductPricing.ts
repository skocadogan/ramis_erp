import type { Product } from "@/features/menu/types"

const STANDARD_UNIT_VALUE = "__standard__"

export { STANDARD_UNIT_VALUE }

export function unitDisplayPrice(product: Product, unitId: string | null | undefined): number {
  const base =
    product.has_discount && product.discounted_price != null
      ? product.discounted_price
      : product.base_price
  if (!unitId || unitId === STANDARD_UNIT_VALUE) return base
  const unit = product.units?.find((u) => u.id === unitId)
  if (!unit) return base
  if (unit.price_override != null && String(unit.price_override).trim() !== "") {
    return Number(unit.price_override)
  }
  return base * (unit.multiplier || 1)
}

export function unitIdToApi(unitId: string | null | undefined): string | null {
  if (!unitId || unitId === STANDARD_UNIT_VALUE) return null
  return unitId
}

export function apiUnitIdToSelect(unitId: string | null | undefined): string {
  if (!unitId) return STANDARD_UNIT_VALUE
  return unitId
}
