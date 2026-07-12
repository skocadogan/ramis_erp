import { renderHook, act } from "@testing-library/react-native";
import {
  findCartLineItem,
  totalLineQuantity,
  useProductDetailCartLine,
} from "@/hooks/useProductDetailCartLine";
import { useCartStore } from "@/store/cart-store";
import type { CartItem, Product, ProductUnitInfo } from "@/types";

function makeItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: "line-1",
    productId: "burger-1",
    productName: "Burger",
    productNameEn: "Burger",
    imageUrl: "",
    unit: {
      id: "u1",
      name: "Adet",
      nameEn: "Piece",
      type: "PIECE",
      multiplier: 1,
      price: 100,
      isDefault: true,
    },
    quantity: 1,
    modifiers: [],
    productSalePrice: 100,
    unitPrice: 100,
    totalPrice: 100,
    ...overrides,
  };
}

describe("totalLineQuantity", () => {
  it("sums quantity across modifier variants for same product line", () => {
    const items = [
      makeItem({ id: "a", modifiers: [], quantity: 1 }),
      makeItem({
        id: "b",
        modifiers: [
          {
            groupId: "g1",
            groupName: "Ekstra",
            modifierId: "m1",
            modifierName: "Peynir",
            price: 10,
          },
        ],
        quantity: 2,
        productSalePrice: 100,
        unitPrice: 110,
        totalPrice: 220,
      }),
    ];

    expect(totalLineQuantity(items, "burger-1", "u1")).toBe(3);
  });

  it("returns 0 when product line is absent", () => {
    expect(totalLineQuantity([], "burger-1", "u1")).toBe(0);
  });
});

describe("findCartLineItem", () => {
  it("matches exact modifier combination", () => {
    const withMod = makeItem({
      id: "b",
      modifiers: [
        {
          groupId: "g1",
          groupName: "Ekstra",
          modifierId: "m1",
          modifierName: "Peynir",
          price: 10,
        },
      ],
    });
    const items = [makeItem({ id: "a" }), withMod];

    expect(findCartLineItem(items, "burger-1", "u1", undefined, [])?.id).toBe(
      "a",
    );
    expect(
      findCartLineItem(items, "burger-1", "u1", undefined, withMod.modifiers)
        ?.id,
    ).toBe("b");
  });
});

describe("useProductDetailCartLine", () => {
  const product = {
    id: "burger-1",
    name: "Burger",
    nameEn: "Burger",
    imageUrl: "",
    basePrice: 100,
    hasDiscount: false,
    discountRate: 0,
    discountedPrice: null,
  } as unknown as Product;

  const unit = {
    id: "u1",
    name: "Adet",
    nameEn: "Piece",
    type: "PIECE",
    multiplier: 1,
    price: 100,
    isDefault: true,
  } as ProductUnitInfo;

  beforeEach(() => {
    useCartStore.setState({
      items: [makeItem({ quantity: 1 })],
      tableId: null,
      note: "",
    });
  });

  it("adet degisikliklerini commit edilene kadar storea yazmaz", () => {
    const { result } = renderHook(() =>
      useProductDetailCartLine(product, unit, undefined, []),
    );

    expect(result.current.quantity).toBe(1);
    expect(useCartStore.getState().items[0]?.quantity).toBe(1);

    act(() => {
      result.current.onIncrease();
    });

    expect(result.current.quantity).toBe(2);
    expect(useCartStore.getState().items[0]?.quantity).toBe(1);

    act(() => {
      result.current.commitDraft();
    });

    expect(useCartStore.getState().items[0]?.quantity).toBe(2);
  });
});
