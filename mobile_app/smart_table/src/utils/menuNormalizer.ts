// ============================================================
// Smart Table — Menu Data Normalizer
// Builds O(1) lookup maps from flat Category[] and Product[].
// ============================================================

import type { Category, Product } from "@/types";

export interface NormalizedMenu {
  categoriesById: Map<string, Category>;
  productsByCategory: Map<string, Product[]>;
  descendantIdsCache: Map<string, Set<string>>;
  rootCategories: Category[];
  childCategories: Map<string, Category[]>;
}

export const POPULAR_CATEGORY_ID = "__popular__";

/** Build all lookup maps in a single pass. */
export function normalizeMenuData(
  categories: Category[],
  products: Product[],
): NormalizedMenu {
  const categoriesById = new Map<string, Category>();
  const productsByCategory = new Map<string, Product[]>();
  const childCategories = new Map<string, Category[]>();
  const rootCategories: Category[] = [];
  const descendantIdsCache = new Map<string, Set<string>>();

  // Index categories
  for (const cat of categories) {
    categoriesById.set(cat.id, cat);

    if (!cat.parentId) {
      rootCategories.push(cat);
    } else {
      const siblings = childCategories.get(cat.parentId) || [];
      siblings.push(cat);
      childCategories.set(cat.parentId, siblings);
    }
  }

  // Index active products by category
  for (const product of products) {
    if (!product.isActive) continue;
    const list = productsByCategory.get(product.categoryId) || [];
    list.push(product);
    productsByCategory.set(product.categoryId, list);
  }

  // Precompute descendant IDs for every category
  for (const cat of categories) {
    descendantIdsCache.set(
      cat.id,
      computeDescendantIds(cat.id, childCategories),
    );
  }

  return {
    categoriesById,
    productsByCategory,
    descendantIdsCache,
    rootCategories,
    childCategories,
  };
}

function computeDescendantIds(
  catId: string,
  childCategories: Map<string, Category[]>,
): Set<string> {
  const result = new Set<string>([catId]);
  const children = childCategories.get(catId);
  if (children) {
    for (const child of children) {
      const childIds = computeDescendantIds(child.id, childCategories);
      childIds.forEach((id) => result.add(id));
    }
  }
  return result;
}

/** Resolve which category to select by default after data loads. */
export function resolveDefaultCategory(
  previousId: string | null,
  categories: Category[],
  products: Product[],
): string | null {
  if (
    previousId &&
    previousId !== POPULAR_CATEGORY_ID &&
    categories.find((c) => c.id === previousId)
  ) {
    return previousId;
  }
  const hasFeatured = products.some((p) => p.isFeatured && p.isActive);
  if (hasFeatured) return POPULAR_CATEGORY_ID;
  const firstParent = categories.find((c) => !c.parentId);
  return firstParent?.id ?? categories[0]?.id ?? null;
}

/** Get filtered products for a given category (including descendants). O(1) lookup. */
export function getFilteredProducts(
  selectedCategoryId: string,
  normalized: NormalizedMenu,
  featuredProducts: Product[],
): Product[] {
  if (selectedCategoryId === POPULAR_CATEGORY_ID) return featuredProducts;
  const descendantIds = normalized.descendantIdsCache.get(selectedCategoryId);
  if (!descendantIds) return [];
  const result: Product[] = [];
  for (const catId of descendantIds) {
    const prods = normalized.productsByCategory.get(catId);
    if (prods) result.push(...prods);
  }
  return result;
}
