// ============================================================
// Product pricing helpers — list vs sale (discounted) price
// ============================================================

import type { Product, ProductUnitInfo } from "@/types";

const PRICE_EPS = 0.009;
const STANDARD_PRODUCT_UNIT_ID_SUFFIX = "__standard_unit__";

/** Liste fiyatından düşük satış fiyatı var mı? */
export function hasReducedPrice(listPrice: number, salePrice: number): boolean {
  return salePrice + PRICE_EPS < listPrice;
}

/** Kart/detay için gösterilecek indirim yüzdesi. */
export function getDisplayDiscountRate(
  product: Product,
  listPrice: number,
  salePrice: number,
): number | null {
  if (!hasReducedPrice(listPrice, salePrice)) return null;
  if (product.discountRate > 0) return Math.round(product.discountRate);
  if (listPrice > 0) return Math.round((1 - salePrice / listPrice) * 100);
  return null;
}

export function productHasDiscount(product: Product): boolean {
  return Boolean(product.hasDiscount && product.discountRate > 0);
}

/** Kategori listesi / ürün kartı için indirim öncesi net satış fiyatı (API: base_price). */
export function getProductListPrice(product: Product): number {
  return product.basePrice;
}

/** Kategori listesi / ürün kartı için geçerli net satış fiyatı (indirim dahil). */
export function getProductSalePrice(product: Product): number {
  if (!productHasDiscount(product)) return product.basePrice;

  const discountFactor = 1 - product.discountRate / 100;
  return product.discountedPrice ?? product.basePrice * discountFactor;
}

function unitHasPriceOverride(
  unit: ProductUnitInfo,
  product: Product,
): boolean {
  const expected = product.basePrice * unit.multiplier;
  return Math.abs(unit.price - expected) > PRICE_EPS;
}

/** İndirim öncesi birim fiyatı (API: calculated_price veya base_price yedeği). */
export function getUnitListPrice(
  unit: ProductUnitInfo,
  product?: Product,
): number {
  if (unit.price > 0) return unit.price;
  return product?.basePrice ?? 0;
}

/** Ürün için her zaman baz fiyatlı sentetik "Standart" birimi üretir. */
export function getDefaultProductUnit(product: Product): ProductUnitInfo {
  return {
    id: `${product.id}-${STANDARD_PRODUCT_UNIT_ID_SUFFIX}`,
    name: "Standart",
    nameEn: "Standard",
    type: "PORTION",
    multiplier: 1,
    price: product.basePrice,
    isDefault: true,
  };
}

export function hasSelectableProductUnits(product: Product): boolean {
  return product.units.length > 0;
}

export function getSelectableProductUnits(product: Product): ProductUnitInfo[] {
  const defaultUnit = getDefaultProductUnit(product);
  return [
    defaultUnit,
    ...product.units.filter((unit) => unit.id !== defaultUnit.id),
  ];
}

/** Seçili birim id'si veya varsayılan birim. */
export function resolveProductUnit(
  product: Product,
  selectedUnitId?: string,
): ProductUnitInfo {
  if (selectedUnitId) {
    const picked = product.units.find((u) => u.id === selectedUnitId);
    if (picked) return picked;
  }
  return getDefaultProductUnit(product);
}

/** Müşterinin ödeyeceği birim fiyat (ürün indirimi dahil). */
export function getUnitSalePrice(
  unit: ProductUnitInfo,
  product: Product,
): number {
  const listPrice = getUnitListPrice(unit, product);
  if (!productHasDiscount(product)) return listPrice;

  const discountFactor = 1 - product.discountRate / 100;
  if (unitHasPriceOverride(unit, product)) {
    return listPrice * discountFactor;
  }

  const discountedBase =
    product.discountedPrice ?? product.basePrice * discountFactor;
  return discountedBase * unit.multiplier;
}

export function computeLineTotal(params: {
  unit: ProductUnitInfo;
  product: Product;
  variantAdjustment?: number;
  modifierTotal?: number;
  quantity?: number;
  useListPrice?: boolean;
}): number {
  const {
    unit,
    product,
    variantAdjustment = 0,
    modifierTotal = 0,
    quantity = 1,
    useListPrice = false,
  } = params;

  const base = useListPrice
    ? getUnitListPrice(unit, product)
    : getUnitSalePrice(unit, product);

  return (base + variantAdjustment + modifierTotal) * quantity;
}

/** Sepet satırında gösterilecek birim fiyat — ekstralar ayrı listelendiği için modifier tutarı düşülür. */
function cartItemModifierTotal(item: {
  modifiers: { price: number }[];
}): number {
  return item.modifiers.reduce((sum, mod) => sum + mod.price, 0);
}

function cartItemVariantAdjustment(item: {
  variant?: { priceAdjustment?: number };
}): number {
  return item.variant?.priceAdjustment ?? 0;
}

/** Ürün net satış fiyatı (satış birimi / ekstra farkı hariç). */
function cartItemProductSalePrice(item: {
  productSalePrice?: number;
  unitPrice: number;
  modifiers: { price: number }[];
  variant?: { priceAdjustment?: number };
  unit: ProductUnitInfo;
}): number {
  if (item.productSalePrice != null) {
    return item.productSalePrice;
  }
  const modifierTotal = cartItemModifierTotal(item);
  const variantAdj = cartItemVariantAdjustment(item);
  const unitComponent = item.unitPrice - modifierTotal - variantAdj;
  if (item.unit.isDefault && Math.abs(item.unit.multiplier - 1) < PRICE_EPS) {
    return unitComponent;
  }
  return unitComponent;
}

/** Seçili satış biriminin net satış fiyatına göre farkı. */
export function cartItemUnitPremium(item: {
  productSalePrice?: number;
  unitPrice: number;
  modifiers: { price: number }[];
  variant?: { priceAdjustment?: number };
  unit: ProductUnitInfo;
}): number {
  const modifierTotal = cartItemModifierTotal(item);
  const variantAdj = cartItemVariantAdjustment(item);
  const unitComponent = item.unitPrice - modifierTotal - variantAdj;
  const productSalePrice = cartItemProductSalePrice(item);
  return Math.max(0, unitComponent - productSalePrice);
}

export function shouldShowCartUnitTag(item: {
  productSalePrice?: number;
  unitPrice: number;
  modifiers: { price: number }[];
  variant?: { priceAdjustment?: number };
  unit: ProductUnitInfo;
}): boolean {
  if (cartItemUnitPremium(item) > PRICE_EPS) return true;
  if (!item.unit.isDefault) return true;
  return Math.abs(item.unit.multiplier - 1) > PRICE_EPS;
}

/** Sepet satırında gösterilecek birim fiyat — ürün net satış fiyatı. */
export function cartItemDisplayBaseUnitPrice(item: {
  productSalePrice?: number;
  unitPrice: number;
  modifiers: { price: number }[];
  variant?: { priceAdjustment?: number };
  unit: ProductUnitInfo;
}): number {
  return cartItemProductSalePrice(item);
}

/** @deprecated cartItemDisplayBaseUnitPrice kullanın */
export function cartItemBaseUnitPrice(item: {
  unitPrice: number;
  modifiers: { price: number }[];
  productSalePrice?: number;
  variant?: { priceAdjustment?: number };
  unit?: ProductUnitInfo;
}): number {
  if (item.unit) {
    return cartItemDisplayBaseUnitPrice({
      ...item,
      unit: item.unit,
    });
  }
  return item.unitPrice - cartItemModifierTotal(item);
}
