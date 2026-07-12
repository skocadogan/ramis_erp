// ============================================================
// Smart Table — API Response Mappers
// Converts RAMIS backend JSON → Smart Table TypeScript types
// ============================================================

import type {
  Category,
  CombinedProductItem,
  Product,
  ProductRecommendation,
  ProductUnitInfo,
  ProductVariant,
  ModifierGroup,
  Allergen,
  ProductImage,
} from "@/types";
import { resolveMediaUrl } from "@/utils/mediaUrl";

// ─── Raw API Types (what the backend actually returns) ──────

export interface ApiCategory {
  id: string;
  name: string;
  name_en?: string | null;
  description: string | null;
  is_active: boolean;
  order: number;
  color: string;
  station: string | null;
  station_name: string | null;
  parent: string | null;
  parent_name: string | null;
  created_at: string;
  updated_at: string;
}

interface ApiUnit {
  id: string;
  name: string;
  name_en?: string | null;
  multiplier: string;
  price_override: string | null;
  order: number;
  calculated_price: string;
}

interface ApiVariant {
  id: string;
  product: string;
  name: string;
  name_en?: string | null;
  price_adjustment: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ApiModifierItem {
  id: string;
  name: string;
  name_en?: string | null;
  price_adjustment: string;
}

interface ApiModifierGroup {
  id: string;
  name: string;
  name_en?: string | null;
  is_multiple: boolean;
  is_required: boolean;
  is_active: boolean;
  modifiers: ApiModifierItem[];
  product_ids: string[];
  created_at: string;
  updated_at: string;
}

interface ApiAllergen {
  id: string;
  name: string;
  name_en?: string | null;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

interface ApiCombinedProductItem {
  id: string;
  product: string;
  product_name: string;
  product_name_en?: string | null;
  quantity: string;
  product_unit?: string | null;
  product_unit_name?: string | null;
  product_unit_name_en?: string | null;
}

export interface ApiProduct {
  id: string;
  category: string;
  category_name: string;
  category_color: string;
  name: string;
  name_en?: string | null;
  description: string | null;
  description_en?: string | null;
  base_price: string;
  gross_price: string;
  tax_rate: string;
  discount_rate: string;
  discounted_price: number | null;
  has_discount: boolean;
  is_active: boolean;
  show_on_pos: boolean;
  is_show_on_menu: boolean;
  is_featured: boolean;
  is_popular: boolean;
  is_chef_recommendation: boolean;
  is_combined: boolean;
  image: string | null;
  order: number;
  units: ApiUnit[];
  combined_items?: ApiCombinedProductItem[];
  variants: ApiVariant[];
  modifier_groups: ApiModifierGroup[];
  allergens: ApiAllergen[];
  is_allergenic: boolean;
  availability_mode: string;
  /** availability_mode === "LIMITED" iken kalan porsiyon */
  remaining_portions: number | string | null;
  preparation_time: number | null;
  is_reserved_out: boolean;
  updated_at: string;
  has_recommendations?: boolean;
  recommendations?: ApiProductRecommendation[];
  calories?: number | null;
}

interface ApiProductRecommendation {
  id: string;
  product_id: string;
  name: string;
  base_price: string;
  has_discount: boolean;
  discounted_price: number | null;
  units: ApiUnit[];
  product_unit_id: string | null;
  product_unit_name: string | null;
  order: number;
}

// ─── Mapper Functions ───────────────────────────────────────

function mapRecommendationUnit(api: ApiUnit, idx: number): ProductUnitInfo {
  return {
    id: api.id,
    name: api.name,
    nameEn: api.name_en?.trim() || api.name,
    type: "PORTION",
    multiplier: parseFloat(api.multiplier),
    price: parseFloat(api.calculated_price),
    isDefault: idx === 0,
  };
}

function mapRecommendation(
  api: ApiProductRecommendation,
): ProductRecommendation {
  const basePrice = parseFloat(api.base_price);
  const discountedPrice =
    api.discounted_price != null
      ? parseFloat(String(api.discounted_price))
      : null;

  return {
    id: api.id,
    productId: api.product_id,
    name: api.name,
    basePrice,
    hasDiscount: api.has_discount,
    discountedPrice,
    units: api.units.map(mapRecommendationUnit),
    productUnitId: api.product_unit_id,
    productUnitName: api.product_unit_name,
    order: api.order,
  };
}

function mapCombinedProductItem(
  api: ApiCombinedProductItem,
): CombinedProductItem {
  return {
    id: api.id,
    productId: api.product,
    productName: api.product_name,
    productNameEn: api.product_name_en?.trim() || api.product_name,
    quantity: parseFloat(api.quantity),
    productUnitId: api.product_unit ?? null,
    productUnitName: api.product_unit_name ?? null,
    productUnitNameEn:
      api.product_unit_name_en?.trim() || api.product_unit_name || null,
  };
}

/**
 * Map API category → Smart Table Category
 * Backend'de olmayan alanlar için fallback değerler kullanılır.
 */
export function mapCategory(api: ApiCategory): Category {
  return {
    id: api.id,
    name: api.name,
    nameEn: api.name_en?.trim() || api.name,
    description: api.description ?? "",
    descriptionEn: api.description ?? "",
    order: api.order,
    color: api.color || "#6B7280",
    imageUrl: undefined,
    iconName: getCategoryIcon(api.name),
    productCount: 0,
    parentId: api.parent ?? null,
  };
}

/**
 * Map API product → Smart Table Product
 */
export function mapProduct(api: ApiProduct): Product {
  const units: ProductUnitInfo[] = api.units.map((u, idx) => ({
    id: u.id,
    name: u.name,
    nameEn: u.name_en?.trim() || u.name,
    type: "PORTION",
    multiplier: parseFloat(u.multiplier),
    price: parseFloat(u.calculated_price),
    isDefault: idx === 0, // İlk unit default
  }));

  const variants: ProductVariant[] = api.variants
    .filter((v) => v.is_active)
    .map((v, idx) => ({
      id: v.id,
      name: v.name,
      nameEn: v.name_en?.trim() || v.name,
      priceAdjustment: parseFloat(v.price_adjustment),
      isDefault: idx === 0, // İlk variant default
    }));

  const modifierGroups: ModifierGroup[] = api.modifier_groups
    .filter((mg) => mg.is_active)
    .map((mg) => ({
      id: mg.id,
      name: mg.name,
      nameEn: mg.name_en?.trim() || mg.name,
      isRequired: mg.is_required,
      isMultiple: mg.is_multiple,
      maxSelection: mg.is_multiple ? 99 : 1,
      minSelection: mg.is_required ? 1 : 0,
      modifiers: mg.modifiers.map((m) => ({
        id: m.id,
        name: m.name,
        nameEn: m.name_en?.trim() || m.name,
        price: parseFloat(m.price_adjustment) || 0,
        isDefault: false,
      })),
    }));

  const allergens: Allergen[] = api.allergens.map((a) => ({
    id: a.id,
    name: a.name,
    nameEn: a.name_en?.trim() || a.name,
    icon: undefined,
    severity: a.severity,
  }));

  const resolvedImage = resolveMediaUrl(api.image);

  // images: Backend'de sadece tek `image` alanı var
  const images: ProductImage[] = resolvedImage
    ? [{ id: `${api.id}-img`, url: resolvedImage, isPrimary: true }]
    : [];

  const calories =
    api.calories != null &&
    Number.isFinite(Number(api.calories)) &&
    Number(api.calories) > 0
      ? Math.round(Number(api.calories))
      : undefined;

  return {
    id: api.id,
    categoryId: api.category,
    categoryName: api.category_name,
    name: api.name,
    nameEn: api.name_en?.trim() || api.name,
    description: api.description ?? "",
    descriptionEn: (api.description_en?.trim() || api.description) ?? "",
    ingredients: "", // Backend'de yok
    ingredientsEn: "", // Backend'de yok
    basePrice: parseFloat(api.base_price),
    grossPrice: parseFloat(api.gross_price),
    taxRate: parseFloat(api.tax_rate),
    discountRate: parseFloat(api.discount_rate),
    hasDiscount: api.has_discount,
    discountedPrice:
      api.discounted_price != null
        ? parseFloat(String(api.discounted_price))
        : undefined,
    imageUrl: resolvedImage,
    images,
    units,
    variants,
    modifierGroups,
    allergens,
    nutritionalInfo: calories != null ? { calories } : undefined,
    isAllergenic: api.is_allergenic,
    isCombined: api.is_combined,
    isActive: api.is_active,
    showOnPos: api.show_on_pos,
    preparationTime: api.preparation_time ?? undefined,
    rating: undefined, // Backend'de yok
    ratingCount: undefined, // Backend'de yok
    isFeatured: api.is_featured,
    isPopular: api.is_popular,
    isChefRecommendation: api.is_chef_recommendation,
    isNew: false, // Backend'de yok
    availabilityMode:
      (api.availability_mode as Product["availabilityMode"]) ?? undefined,
    remainingPortions:
      api.remaining_portions != null ? Number(api.remaining_portions) : null,
    posBlockMode: undefined, // menuService'ten eklenebilir; şimdilik undefined
    hasRecommendations:
      api.has_recommendations ?? (api.recommendations?.length ?? 0) > 0,
    recommendations: api.recommendations?.map(mapRecommendation),
    combinedItems: api.combined_items?.map(mapCombinedProductItem) ?? [],
  };
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Kategori adına göre uygun bir icon name döndürür.
 */
function getCategoryIcon(categoryName: string): string {
  const name = categoryName.toLowerCase();

  if (name.includes("başlangıç") || name.includes("starter"))
    return "utensils-crossed";
  if (name.includes("salata") || name.includes("salad")) return "salad";
  if (name.includes("çorba") || name.includes("soup")) return "soup";
  if (
    name.includes("ana yemek") ||
    name.includes("main") ||
    name.includes("ızgara") ||
    name.includes("grill")
  )
    return "beef";
  if (
    name.includes("deniz") ||
    name.includes("sea") ||
    name.includes("balık") ||
    name.includes("fish")
  )
    return "fish";
  if (
    name.includes("tatlı") ||
    name.includes("dessert") ||
    name.includes("baklava")
  )
    return "cake";
  if (
    name.includes("içecek") ||
    name.includes("beverage") ||
    name.includes("kahve") ||
    name.includes("drink")
  )
    return "coffee";
  if (name.includes("kahvaltı") || name.includes("breakfast")) return "sunrise";
  if (name.includes("pizza")) return "pizza";
  if (name.includes("makarna") || name.includes("pasta")) return "pasta";
  if (name.includes("burger")) return "hamburger";
  if (name.includes("vegan") || name.includes("vejetaryen")) return "leaf";

  return "utensils-crossed";
}
