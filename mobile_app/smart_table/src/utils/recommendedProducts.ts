// Önerilen ürün fiyat / birim / sepet yardımcıları

import type {
  CartItem,
  Product,
  ProductRecommendation,
  ProductUnitInfo,
} from "@/types";
import {
  getDefaultProductUnit,
  getSelectableProductUnits,
  getUnitSalePrice,
  resolveProductUnit,
} from "@/utils/pricing";

export function productHasRecommendations(product: Product): boolean {
  return (
    !!product.hasRecommendations && (product.recommendations?.length ?? 0) > 0
  );
}

export function recommendationProductIds(product: Product): string[] {
  return (product.recommendations ?? []).map((rec) => rec.productId);
}

/** Önerilen ürün satırları (modifier'sız) sepetten temizlenir. */
export function isRecommendationCartItem(
  item: CartItem,
  recommendationIds: string[],
): boolean {
  return (
    recommendationIds.includes(item.productId) && item.modifiers.length === 0
  );
}

export function recommendationDefaultUnitId(product: Product): string {
  return getDefaultProductUnit(product).id;
}

function mapRecommendationUnits(
  units: ProductRecommendation["units"],
): ProductUnitInfo[] {
  return units.map((u, idx) => ({
    ...u,
    isDefault: idx === 0,
  }));
}

/** Katalogda yoksa öneri verisinden minimal ürün üretir. */
function buildProductFromRecommendation(rec: ProductRecommendation): Product {
  const units = mapRecommendationUnits(rec.units);
  return {
    id: rec.productId,
    categoryId: "",
    categoryName: "",
    name: rec.name,
    nameEn: rec.name,
    description: "",
    descriptionEn: "",
    ingredients: "",
    ingredientsEn: "",
    basePrice: rec.basePrice,
    grossPrice: rec.basePrice,
    taxRate: 0,
    discountRate:
      rec.hasDiscount && rec.discountedPrice != null && rec.basePrice > 0
        ? Math.round((1 - rec.discountedPrice / rec.basePrice) * 100)
        : 0,
    hasDiscount: rec.hasDiscount,
    discountedPrice: rec.discountedPrice ?? undefined,
    imageUrl: "",
    images: [],
    units,
    variants: [],
    modifierGroups: [],
    allergens: [],
    isAllergenic: false,
    isCombined: false,
    isActive: true,
    showOnPos: true,
    combinedItems: [],
  };
}

export function resolveRecommendationProduct(
  rec: ProductRecommendation,
  catalog: Product[],
): Product {
  return (
    catalog.find((p) => p.id === rec.productId) ??
    buildProductFromRecommendation(rec)
  );
}

export function recommendationUnitSalePrice(
  product: Product,
  unitId: string,
): number {
  const unit = resolveProductUnit(product, unitId);
  return getUnitSalePrice(unit, product);
}

export function resolveRecommendationUnit(
  product: Product,
  unitId: string,
): ProductUnitInfo {
  return resolveProductUnit(product, unitId);
}

export function getRecommendationSelectableUnits(
  product: Product,
): ProductUnitInfo[] {
  return getSelectableProductUnits(product);
}

export function productDisplayDescription(
  product: Product,
  language: "tr" | "en",
): string {
  return language === "en" && product.descriptionEn.trim()
    ? product.descriptionEn
    : product.description;
}

export function productHasDisplayDescription(
  product: Product,
  language: "tr" | "en",
): boolean {
  return Boolean(productDisplayDescription(product, language).trim());
}
