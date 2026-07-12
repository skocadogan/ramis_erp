import type { CartItem, DisplayRecommendedModalSync, Product, ProductRecommendationPos } from "@/types/pos";

export const POS_STANDARD_UNIT = "__standard__";

export function productHasRecommendations(product: Product): boolean {
  return !!product.has_recommendations && (product.recommendations?.length ?? 0) > 0;
}

export function posUnitDisplayPrice(
  product: Product,
  unitId: string | null | undefined,
): number {
  const base =
    product.has_discount && product.discounted_price != null
      ? product.discounted_price
      : product.base_price;
  if (!unitId || unitId === POS_STANDARD_UNIT) return base;
  const unit = product.units?.find((u) => u.id === unitId);
  if (!unit) return base;
  if (unit.price_override != null) return unit.price_override;
  return base * (unit.multiplier || 1);
}

export function recommendationDefaultUnitId(rec: ProductRecommendationPos): string {
  if (rec.product_unit_id) return rec.product_unit_id;
  return POS_STANDARD_UNIT;
}

export function unitIdToPosUnit(product: Product, unitId: string) {
  if (!unitId || unitId === POS_STANDARD_UNIT) return null;
  return product.units?.find((u) => u.id === unitId) ?? null;
}

export function cartQtyForRecommendation(
  cart: CartItem[],
  productId: string,
  unitId: string,
): number {
  const unit = unitId === POS_STANDARD_UNIT ? null : { id: unitId, name: "", multiplier: 1 };
  return cart
    .filter((item) => {
      if (item.product.id !== productId) return false;
      const itemUnitKey = item.selectedUnit?.id ?? "base";
      const targetKey = unit?.id ?? "base";
      return itemUnitKey === targetKey && (item.selectedModifiers?.length ?? 0) === 0;
    })
    .reduce((sum, item) => sum + item.quantity, 0);
}

/** Kasiyer öneri diyaloğu → müşteri ekranı WS payload. */
export function buildDisplayRecommendedModalPayload(
  sourceProduct: Product,
  cart: CartItem[],
  unitSelections: Record<string, string>,
  catalogProducts: Product[],
): DisplayRecommendedModalSync | null {
  if (!productHasRecommendations(sourceProduct)) return null;
  const items = (sourceProduct.recommendations ?? []).map((rec) => {
    const unitId = unitSelections[rec.product_id] ?? recommendationDefaultUnitId(rec);
    const catalogProduct = catalogProducts.find((p) => p.id === rec.product_id);
    const price = catalogProduct
      ? posUnitDisplayPrice(catalogProduct, unitId)
      : rec.discounted_price ?? rec.base_price;
    const unitName =
      unitId === POS_STANDARD_UNIT
        ? null
        : catalogProduct?.units?.find((u) => u.id === unitId)?.name ?? rec.product_unit_name ?? null;
    return {
      productId: rec.product_id,
      name: rec.name,
      unitName,
      price,
      quantityInCart: cartQtyForRecommendation(cart, rec.product_id, unitId),
    };
  });
  return {
    sourceProductName: sourceProduct.name,
    items,
  };
}
