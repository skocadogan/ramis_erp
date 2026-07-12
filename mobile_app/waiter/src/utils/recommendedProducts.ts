import type { CartItem } from "../store/usePosStore";
import type { Product, ProductRecommendation } from "../types/models";

export const STANDARD_UNIT = "__standard__";

export function productHasRecommendations(product: Product): boolean {
  return !!product.has_recommendations && (product.recommendations?.length ?? 0) > 0;
}

export function recommendationDefaultUnitId(rec: ProductRecommendation): string {
  if (rec.product_unit_id) return String(rec.product_unit_id);
  return STANDARD_UNIT;
}

function buildProductFromRecommendation(rec: ProductRecommendation): Product {
  const price =
    rec.has_discount && rec.discounted_price != null ? rec.discounted_price : rec.base_price;
  return {
    id: rec.product_id,
    name: rec.name,
    price: String(price),
    base_price: String(rec.base_price),
    discounted_price: rec.discounted_price != null ? String(rec.discounted_price) : null,
    has_discount: rec.has_discount,
    units: rec.units,
  };
}

export function resolveRecommendationProduct(
  rec: ProductRecommendation,
  catalog: Product[]
): Product {
  return (
    catalog.find((p) => String(p.id) === String(rec.product_id)) ??
    buildProductFromRecommendation(rec)
  );
}

export function unitDisplayPrice(product: Product, unitId: string): number {
  const base =
    product.has_discount && product.discounted_price != null
      ? parseFloat(String(product.discounted_price))
      : parseFloat(String(product.base_price ?? product.price ?? 0));
  if (unitId === STANDARD_UNIT) return base;
  const unit = (product.units ?? []).find((u) => String(u.id) === unitId);
  if (!unit) return base;
  if (unit.price_override != null) return parseFloat(String(unit.price_override));
  return base * parseFloat(String(unit.multiplier ?? 1));
}

export function unitIdToCartUnit(product: Product, unitId: string) {
  if (unitId === STANDARD_UNIT) return null;
  return (product.units ?? []).find((u) => String(u.id) === unitId) ?? null;
}

export function cartQtyForRecommendation(
  cart: CartItem[],
  productId: string,
  unitId: string
): number {
  const targetKey = unitId === STANDARD_UNIT ? "base" : unitId;
  return cart
    .filter((item) => {
      if (String(item.product?.id) !== String(productId)) return false;
      const itemUnitKey = item.selectedUnit?.id ?? "base";
      return itemUnitKey === targetKey && (item.selectedModifiers?.length ?? 0) === 0;
    })
    .reduce((sum, item) => sum + item.quantity, 0);
}

export function findCartItemForRecommendation(
  cart: CartItem[],
  productId: string,
  unitId: string
): CartItem | undefined {
  const targetKey = unitId === STANDARD_UNIT ? "base" : unitId;
  return cart.find((item) => {
    if (String(item.product?.id) !== String(productId)) return false;
    const itemUnitKey = item.selectedUnit?.id ?? "base";
    return itemUnitKey === targetKey && (item.selectedModifiers?.length ?? 0) === 0;
  });
}

export function productHasDisplayDescription(product: Product): boolean {
  return Boolean(product.description && String(product.description).trim());
}

export function formatDisplayPrice(amount: number): string {
  return amount.toFixed(2).replace(".", ",");
}
