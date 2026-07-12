// ============================================================
// Smart Table — Menu Normalizer Tests
// ============================================================

import {
  normalizeMenuData,
  getFilteredProducts,
  resolveDefaultCategory,
  POPULAR_CATEGORY_ID,
} from "../menuNormalizer";
import type { Category, Product } from "@/types";

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-1",
    name: "Test",
    nameEn: "Test",
    description: "",
    descriptionEn: "",
    order: 0,
    color: "#000",
    productCount: 0,
    parentId: null,
    ...overrides,
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    categoryId: "cat-1",
    categoryName: "Test",
    name: "Test Product",
    nameEn: "Test Product",
    description: "",
    descriptionEn: "",
    ingredients: "",
    ingredientsEn: "",
    basePrice: 100,
    grossPrice: 118,
    taxRate: 18,
    discountRate: 0,
    imageUrl: "",
    images: [],
    units: [],
    variants: [],
    modifierGroups: [],
    allergens: [],
    isAllergenic: false,
    isCombined: false,
    isActive: true,
    showOnPos: true,
    combinedItems: [],
    ...overrides,
  };
}

describe("normalizeMenuData", () => {
  it("builds categoriesById map", () => {
    const cat = makeCategory();
    const result = normalizeMenuData([cat], []);
    expect(result.categoriesById.get("cat-1")).toEqual(cat);
  });

  it("builds productsByCategory with only active products", () => {
    const active = makeProduct({ id: "a", isActive: true });
    const inactive = makeProduct({ id: "b", isActive: false });
    const result = normalizeMenuData([makeCategory()], [active, inactive]);
    expect(result.productsByCategory.get("cat-1")?.length).toBe(1);
    expect(result.productsByCategory.get("cat-1")?.[0].id).toBe("a");
  });

  it("separates root and child categories", () => {
    const parent = makeCategory({ id: "p1" });
    const child = makeCategory({ id: "c1", parentId: "p1" });
    const result = normalizeMenuData([parent, child], []);
    expect(result.rootCategories.length).toBe(1);
    expect(result.rootCategories[0].id).toBe("p1");
    expect(result.childCategories.get("p1")?.length).toBe(1);
    expect(result.childCategories.get("p1")?.[0].id).toBe("c1");
  });

  it("computes descendantIdsCache recursively", () => {
    const parent = makeCategory({ id: "p1" });
    const child = makeCategory({ id: "c1", parentId: "p1" });
    const grandchild = makeCategory({ id: "gc1", parentId: "c1" });
    const result = normalizeMenuData([parent, child, grandchild], []);
    const descendants = result.descendantIdsCache.get("p1");
    expect(descendants?.has("p1")).toBe(true);
    expect(descendants?.has("c1")).toBe(true);
    expect(descendants?.has("gc1")).toBe(true);
  });
});

describe("getFilteredProducts", () => {
  it("returns featured products for POPULAR_CATEGORY_ID", () => {
    const featured = [makeProduct({ id: "f1", isFeatured: true })];
    const empty = normalizeMenuData([makeCategory()], []);
    const result = getFilteredProducts(POPULAR_CATEGORY_ID, empty, featured);
    expect(result).toEqual(featured);
  });

  it("returns products from category and all descendants", () => {
    const p1 = makeCategory({ id: "p1" });
    const c1 = makeCategory({ id: "c1", parentId: "p1" });
    const prod1 = makeProduct({ id: "a", categoryId: "p1", isActive: true });
    const prod2 = makeProduct({ id: "b", categoryId: "c1", isActive: true });
    const normalized = normalizeMenuData([p1, c1], [prod1, prod2]);
    const result = getFilteredProducts("p1", normalized, []);
    expect(result.length).toBe(2);
  });

  it("returns empty for unknown category", () => {
    const normalized = normalizeMenuData([makeCategory()], []);
    const result = getFilteredProducts("unknown", normalized, []);
    expect(result).toEqual([]);
  });
});

describe("resolveDefaultCategory", () => {
  it("returns previous valid category", () => {
    expect(resolveDefaultCategory("cat-1", [makeCategory()], [])).toBe("cat-1");
  });

  it("returns POPULAR if featured products exist", () => {
    const featured = makeProduct({ isFeatured: true });
    expect(
      resolveDefaultCategory(null, [makeCategory()], [featured]),
    ).toBe(POPULAR_CATEGORY_ID);
  });

  it("returns first root category if no featured", () => {
    expect(resolveDefaultCategory(null, [makeCategory()], [])).toBe("cat-1");
  });

  it("ignores POPULAR_CATEGORY_ID as previous", () => {
    const featured = makeProduct({ isFeatured: true });
    expect(
      resolveDefaultCategory(POPULAR_CATEGORY_ID, [makeCategory()], [featured]),
    ).toBe(POPULAR_CATEGORY_ID);
  });
});
