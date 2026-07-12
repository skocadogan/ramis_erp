import { buildCartQuantityToast } from "@/utils/cartToast";

describe("buildCartQuantityToast", () => {
  const unit = {
    id: "u1",
    name: "Standart",
    nameEn: "Standard",
    type: "PORTION" as const,
    multiplier: 1,
    price: 200,
    isDefault: true,
  };

  it("builds add message in Turkish", () => {
    expect(
      buildCartQuantityToast({
        productName: "Izgara Kofte",
        productNameEn: "Grilled Meatball",
        unit,
        quantityDelta: 2,
        language: "tr",
      }),
    ).toBe("Izgara Kofte - Standart - 2 adet eklendi");
  });

  it("builds remove message in English", () => {
    expect(
      buildCartQuantityToast({
        productName: "Izgara Kofte",
        productNameEn: "Grilled Meatball",
        unit,
        quantityDelta: -1,
        language: "en",
      }),
    ).toBe("Grilled Meatball - Standard - 1 item removed");
  });
});
