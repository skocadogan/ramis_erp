import {
  cartItemBaseUnitPrice,
  cartItemDisplayBaseUnitPrice,
  cartItemUnitPremium,
  getDefaultProductUnit,
  getProductListPrice,
  getProductSalePrice,
  getSelectableProductUnits,
  hasSelectableProductUnits,
  shouldShowCartUnitTag,
} from "@/utils/pricing";
import type { ProductUnitInfo } from "@/types";
import type { Product } from "@/types";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    categoryId: "c1",
    categoryName: "Ana",
    name: "Köfte",
    nameEn: "Meatball",
    description: "",
    descriptionEn: "",
    ingredients: "",
    ingredientsEn: "",
    basePrice: 200,
    grossPrice: 236,
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

describe("product list pricing", () => {
  it("uses base_price when product has no sales units", () => {
    const product = makeProduct({ basePrice: 185, units: [] });
    expect(getProductListPrice(product)).toBe(185);
    expect(getProductSalePrice(product)).toBe(185);
  });

  it("uses base_price when product has sales units with different multipliers", () => {
    const product = makeProduct({
      basePrice: 200,
      units: [
        {
          id: "u1",
          name: "Yarım",
          nameEn: "Half",
          type: "PORTION",
          multiplier: 0.5,
          price: 100,
          isDefault: true,
        },
      ],
    });

    expect(getProductListPrice(product)).toBe(200);
    expect(getProductSalePrice(product)).toBe(200);
  });

  it("applies discounted net sale price regardless of units", () => {
    const product = makeProduct({
      basePrice: 200,
      discountRate: 10,
      hasDiscount: true,
      discountedPrice: 180,
      units: [
        {
          id: "u1",
          name: "Porsiyon",
          nameEn: "Portion",
          type: "PORTION",
          multiplier: 1,
          price: 200,
          isDefault: true,
        },
      ],
    });

    expect(getProductListPrice(product)).toBe(200);
    expect(getProductSalePrice(product)).toBe(180);
  });
});

describe("selectable product units", () => {
  it("prepends the synthetic standard unit before custom sales units", () => {
    const product = makeProduct({
      basePrice: 200,
      units: [
        {
          id: "u1",
          name: "Yarım",
          nameEn: "Half",
          type: "PORTION",
          multiplier: 0.5,
          price: 100,
          isDefault: false,
        },
      ],
    });

    const units = getSelectableProductUnits(product);

    expect(hasSelectableProductUnits(product)).toBe(true);
    expect(units[0]).toEqual(getDefaultProductUnit(product));
    expect(units[1]?.id).toBe("u1");
  });
});

describe("cartItemBaseUnitPrice", () => {
  const defaultUnit: ProductUnitInfo = {
    id: "u1",
    name: "Porsiyon",
    nameEn: "Portion",
    type: "PORTION",
    multiplier: 1,
    price: 200,
    isDefault: true,
  };

  it("subtracts modifier prices from stored unit price", () => {
    expect(
      cartItemBaseUnitPrice({
        unitPrice: 220,
        modifiers: [{ price: 20 }, { price: 0 }],
        productSalePrice: 200,
        unit: defaultUnit,
      }),
    ).toBe(200);
  });

  it("uses product sale price when unit has a premium", () => {
    const portionUnit: ProductUnitInfo = {
      ...defaultUnit,
      id: "u2",
      name: "1,5 Porsiyon",
      multiplier: 1.5,
      price: 300,
      isDefault: false,
    };

    const item = {
      productSalePrice: 200,
      unitPrice: 320,
      modifiers: [{ price: 20 }],
      variant: undefined,
      unit: portionUnit,
    };

    expect(cartItemDisplayBaseUnitPrice(item)).toBe(200);
    expect(cartItemUnitPremium(item)).toBe(100);
    expect(shouldShowCartUnitTag(item)).toBe(true);
  });
});
