import { formatPrice } from "@/utils/format";

describe("formatPrice", () => {
  it("formats whole numbers without decimals", () => {
    expect(formatPrice(26)).toBe("26");
    expect(formatPrice(1250)).toBe("1.250");
  });

  it("preserves fractional prices", () => {
    expect(formatPrice(26.75)).toBe("26,75");
    expect(formatPrice(26.5)).toBe("26,5");
    expect(formatPrice(1250.99)).toBe("1.250,99");
  });

  it("handles invalid input", () => {
    expect(formatPrice(Number.NaN)).toBe("0");
  });
});
