// ============================================================
// Smart Table — cart-store unit price / modifier sözleşmesi
// ============================================================

import { useCartStore } from "../cart-store";
import type { Product, ProductUnitInfo } from "@/types";

const product: Product = {
  id: "p1",
  name: "Burger",
  nameEn: "Burger",
  description: "",
  descriptionEn: "",
  categoryId: "c1",
  categoryName: "Food",
  imageUrl: "",
  basePrice: 100,
  salePrice: 100,
  discountRate: 0,
  hasDiscount: false,
  isAvailable: true,
  rating: 0,
  ratingCount: 0,
  calories: null,
  allergens: [],
  units: [],
  variants: [],
  modifierGroups: [
    {
      id: "g1",
      name: "Extras",
      nameEn: "Extras",
      isRequired: false,
      isMultiple: true,
      minSelection: 0,
      maxSelection: 3,
      modifiers: [
        {
          id: "m1",
          name: "Cheese",
          nameEn: "Cheese",
          price: 10,
          isAvailable: true,
        },
      ],
    },
  ],
  recommendedProductIds: [],
  tags: [],
};

const unit: ProductUnitInfo = {
  id: "p1-standard",
  name: "Standart",
  nameEn: "Standard",
  type: "PORTION",
  multiplier: 1,
  price: 100,
  isDefault: true,
};

describe("cart-store unit_price contract", () => {
  beforeEach(() => {
    useCartStore.setState({
      items: [],
      tableId: null,
      note: "",
      totalAmount: 0,
      itemCount: 0,
    });
  });

  it("unitPrice modifiersız kalır; totalPrice modifier tutarını içerir", () => {
    useCartStore.getState().addItem(
      product,
      unit,
      undefined,
      [
        {
          groupId: "g1",
          groupName: "Extras",
          modifierId: "m1",
          modifierName: "Cheese",
          price: 10,
        },
      ],
      2,
    );

    const item = useCartStore.getState().items[0];
    expect(item.unitPrice).toBe(100);
    expect(item.totalPrice).toBe(220);
    expect(useCartStore.getState().totalAmount).toBe(220);
  });
});
