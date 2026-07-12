// ============================================================
// Stock Man — Currency formatter + RBAC maske testleri
// ============================================================

import { renderHook } from "@testing-library/react-native";
import {
  formatCurrency,
  getCurrencySymbol,
  useFormatCurrency,
  AMOUNT_MASK,
} from "@/lib/format/currency";
import { useUIStore } from "@/store/useUIStore";

const mockState: { canView: boolean } = { canView: true };
jest.mock("@/hooks/usePermission", () => ({
  useCanViewAmounts: () => mockState.canView,
}));

beforeEach(() => {
  mockState.canView = true;
  useUIStore.setState({ language: "tr", themePreference: "system" });
});

describe("getCurrencySymbol", () => {
  it("tr → ₺", () => {
    expect(getCurrencySymbol("tr")).toBe("₺");
  });

  it("en → ₺", () => {
    expect(getCurrencySymbol("en")).toBe("₺");
  });

  it("bg → €", () => {
    expect(getCurrencySymbol("bg")).toBe("€");
  });

  it("sq → L", () => {
    expect(getCurrencySymbol("sq")).toBe("L");
  });
});

describe("formatCurrency (saf fonksiyon)", () => {
  describe("TR locale (varsayılan)", () => {
    it("₺ sembolü ve TR biçimi: binlik nokta, ondalık virgül", () => {
      expect(formatCurrency(1234.5, "tr")).toBe("₺1.234,50");
    });

    it("sıfır → ₺0,00", () => {
      expect(formatCurrency(0)).toBe("₺0,00");
    });

    it("string girdi kabul eder", () => {
      expect(formatCurrency("99.5", "tr")).toBe("₺99,50");
    });
  });

  describe("diğer localeler", () => {
    it("en → ₺ sembolü, en-US sayı biçimi", () => {
      expect(formatCurrency(1234.5, "en")).toBe("₺1,234.50");
    });

    it("bg → € sembolü sonda", () => {
      const result = formatCurrency(1234.5, "bg");
      expect(result).toContain("€");
      expect(result).toContain("1");
      expect(result).toContain(",50");
    });

    it("sq → L sembolü sonda", () => {
      const result = formatCurrency(1234.5, "sq");
      expect(result).toContain("L");
      expect(result).toContain(",50");
    });
  });

  describe("uç durumlar", () => {
    it("NaN → '0'", () => {
      expect(formatCurrency(NaN)).toBe("0");
    });

    it("Infinity → '0'", () => {
      expect(formatCurrency(Infinity)).toBe("0");
      expect(formatCurrency(-Infinity)).toBe("0");
    });

    it("negatif sayılar başında eksi ile", () => {
      const result = formatCurrency(-100, "tr");
      expect(result).toContain("100,00");
      expect(result).toContain("₺");
    });
  });
});

describe("AMOUNT_MASK sabiti", () => {
  it("'•••' değerinde", () => {
    expect(AMOUNT_MASK).toBe("•••");
  });
});

describe("useFormatCurrency (React hook)", () => {
  it("izin varsa gerçek değer döner", () => {
    const { result } = renderHook(() => useFormatCurrency());
    expect(result.current(1234.5)).toBe("₺1.234,50");
  });

  it("izin yoksa her zaman AMOUNT_MASK döner", () => {
    mockState.canView = false;
    const { result } = renderHook(() => useFormatCurrency());
    expect(result.current(1234.5)).toBe(AMOUNT_MASK);
    expect(result.current(999999)).toBe(AMOUNT_MASK);
  });

  it("izin durumu değişirse davranış değişir", () => {
    mockState.canView = true;
    const { result, rerender } = renderHook(() => useFormatCurrency());
    expect(result.current(10)).toBe("₺10,00");

    mockState.canView = false;
    rerender(undefined);
    expect(result.current(10)).toBe(AMOUNT_MASK);
  });
});
