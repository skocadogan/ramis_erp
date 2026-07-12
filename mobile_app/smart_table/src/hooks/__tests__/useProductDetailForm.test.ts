import {
  buildCartModifiersFromSelection,
  computeModifierToggle,
} from "@/hooks/useProductDetailForm";
import type { Product } from "@/types";

const product = {
  id: "p1",
  modifierGroups: [
    {
      id: "g1",
      name: "Ekstra",
      nameEn: "Extra",
      isRequired: false,
      isMultiple: false,
      maxSelection: 1,
      minSelection: 0,
      modifiers: [
        { id: "m1", name: "Peynir", nameEn: "Cheese", price: 10 },
        { id: "m2", name: "Sos", nameEn: "Sauce", price: 5 },
      ],
    },
    {
      id: "g2",
      name: "Çoklu",
      nameEn: "Multiple",
      isRequired: false,
      isMultiple: true,
      maxSelection: 2,
      minSelection: 0,
      modifiers: [
        { id: "m3", name: "A", nameEn: "A", price: 1 },
        { id: "m4", name: "B", nameEn: "B", price: 2 },
      ],
    },
  ],
} as Product;

describe("computeModifierToggle", () => {
  it("selects single-choice modifier", () => {
    expect(computeModifierToggle({}, "g1", "m1", product)).toEqual({
      g1: ["m1"],
    });
  });

  it("replaces single-choice selection in same group", () => {
    expect(computeModifierToggle({ g1: ["m1"] }, "g1", "m2", product)).toEqual({
      g1: ["m2"],
    });
  });

  it("deselects single-choice modifier when tapped again", () => {
    expect(computeModifierToggle({ g1: ["m1"] }, "g1", "m1", product)).toEqual(
      {},
    );
  });

  it("toggles multiple-choice modifiers within max", () => {
    expect(computeModifierToggle({}, "g2", "m3", product)).toEqual({
      g2: ["m3"],
    });
    expect(computeModifierToggle({ g2: ["m3"] }, "g2", "m4", product)).toEqual({
      g2: ["m3", "m4"],
    });
    expect(
      computeModifierToggle({ g2: ["m3", "m4"] }, "g2", "m3", product),
    ).toEqual({
      g2: ["m4"],
    });
  });
});

describe("buildCartModifiersFromSelection", () => {
  it("maps selected modifier ids to cart modifier payload", () => {
    expect(buildCartModifiersFromSelection(product, { g1: ["m1"] })).toEqual([
      {
        groupId: "g1",
        groupName: "Ekstra",
        modifierId: "m1",
        modifierName: "Peynir",
        price: 10,
      },
    ]);
  });
});
