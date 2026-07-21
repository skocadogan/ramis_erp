// ============================================================
// Smart Table — cart-store unit price / modifier sözleşmesi
// ============================================================

import { useCartStore } from "../cart-store";
import type { Product, ProductUnitInfo } from "@/types";

const product = {
  id: "p1",
  name: "Burger",
  nameEn: "Burger",
  description: "",
  descriptionEn: "",
  ingredients: "",
  ingredientsEn: "",
  categoryId: "c1",
  categoryName: "Food",
  imageUrl: "",
  images: [],
  basePrice: 100,
  grossPrice: 100,
  taxRate: 0,
  discountRate: 0,
  units: [],
  variants: [],
  modifierGroups: [],
  allergens: [],
  isAllergenic: false,
  isCombined: false,
  isActive: true,
  showOnPos: true,
} as Product;

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
