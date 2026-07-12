import {
  isRecommendationCartItem,
  recommendationProductIds,
} from "@/utils/recommendedProducts";
import type { CartItem, Product } from "@/types";

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: "c1",
    productId: "wine-1",
    productName: "Şarap",
    productNameEn: "Wine",
    imageUrl: "",
    unit: {
      id: "u1",
      name: "Porsiyon",
      nameEn: "Portion",
      type: "PORTION",
      multiplier: 1,
      price: 500,
      isDefault: true,
    },
    quantity: 1,
    modifiers: [],
    productSalePrice: 500,
    unitPrice: 500,
    totalPrice: 500,
    ...overrides,
  };
}

const productWithRecommendations = {
  id: "main-1",
  recommendations: [{ productId: "wine-1" }, { productId: "salad-2" }],
} as Product;

describe("recommendationProductIds", () => {
  it("returns recommendation product ids", () => {
    expect(recommendationProductIds(productWithRecommendations)).toEqual([
      "wine-1",
      "salad-2",
    ]);
  });
});

describe("isRecommendationCartItem", () => {
  it("matches recommendation product without modifiers", () => {
    const item = makeCartItem({ productId: "wine-1" });
    expect(isRecommendationCartItem(item, ["wine-1", "salad-2"])).toBe(true);
  });

  it("does not match when modifiers exist", () => {
    const item = makeCartItem({
      productId: "wine-1",
      modifiers: [
        {
          groupId: "g1",
          groupName: "Ekstra",
          modifierId: "m1",
          modifierName: "Sos",
          price: 10,
        },
      ],
    });
    expect(isRecommendationCartItem(item, ["wine-1"])).toBe(false);
  });

  it("does not match unrelated products", () => {
    const item = makeCartItem({ productId: "main-1" });
    expect(isRecommendationCartItem(item, ["wine-1"])).toBe(false);
  });
});
