// ============================================================
// Stock Man — Quantity formatter birim testleri
// ============================================================
//
// `formatQuantity`, `formatMultiplier` ve `formatQuantityWithUnit`
// fonksiyonlarının farklı localizasyonlarda ve uç durumlarda
// doğru çıktı verdiğini doğrular. Hedef: %100 line/branch coverage.
// ============================================================

import { formatQuantity, formatMultiplier, formatQuantityWithUnit } from "@/lib/format/quantity";

describe("formatQuantity", () => {
  // ─── TR locale (varsayılan) ────────────────────────────────
  describe("tr-TR (varsayılan)", () => {
    it("ondalık sayıyı TR yereline göre biçimlendirir (nokta→virgül)", () => {
      expect(formatQuantity(1234.5)).toBe("1.234,5");
    });

    it("sıfır değerini '0' olarak döner", () => {
      expect(formatQuantity(0)).toBe("0");
    });

    it("string girdi kabul eder", () => {
      expect(formatQuantity("1234.5")).toBe("1.234,5");
    });

    it("tamsayıyı ondalıksız yazar", () => {
      expect(formatQuantity(42)).toBe("42");
    });

    it("trailing-zero kırpılır (0.500 → 0,5)", () => {
      expect(formatQuantity(0.5)).toBe("0,5");
    });

    it("6 ondalık basamağa kadar yuvarlar", () => {
      expect(formatQuantity(1.123456789)).toBe("1,123457");
    });
  });

  // ─── Diğer localeler ───────────────────────────────────────
  describe("diğer localeler", () => {
    it("en-US: binlik virgül, ondalık nokta", () => {
      expect(formatQuantity(1234.5, "en")).toBe("1,234.5");
    });

    it("bg-BG: binlik ayracı yok, ondalık virgül", () => {
      expect(formatQuantity(1234.5, "bg")).toBe("1234,5");
    });

    it("sq-AL locale desteklenir", () => {
      expect(formatQuantity(100, "sq")).toBe("100");
    });

    it("en-US'te sıfır → '0'", () => {
      expect(formatQuantity(0, "en")).toBe("0");
    });
  });

  // ─── Uç durumlar ───────────────────────────────────────────
  describe("uç durumlar", () => {
    it("undefined → '0'", () => {
      // isFinite(undefined) === false → '0'
      expect(formatQuantity(undefined as unknown as number)).toBe("0");
    });

    it("null → '0'", () => {
      expect(formatQuantity(null as unknown as number)).toBe("0");
    });

    it("NaN → '0'", () => {
      expect(formatQuantity(NaN)).toBe("0");
    });

    it("Infinity → '0' (pozitif ve negatif)", () => {
      expect(formatQuantity(Infinity)).toBe("0");
      expect(formatQuantity(-Infinity)).toBe("0");
    });

    it("boş string → '0'", () => {
      expect(formatQuantity("")).toBe("0");
    });

    it("geçersiz sayı string'i → '0'", () => {
      expect(formatQuantity("abc")).toBe("0");
    });

    it("çok küçük pozitif sayılar küçük ondalıkla gösterilir", () => {
      expect(formatQuantity(0.001)).toBe("0,001");
    });

    it("negatif sayılar başında eksi ile gösterilir", () => {
      expect(formatQuantity(-1234.5)).toBe("-1.234,5");
    });
  });
});

describe("formatMultiplier", () => {
  it("tamsayıyı olduğu gibi döner", () => {
    expect(formatMultiplier(2)).toBe("2");
  });

  it("ondalık sayıyı TR localında biçimlendirir", () => {
    expect(formatMultiplier(1.5, "tr")).toBe("1,5");
  });

  it("string girdi kabul eder", () => {
    expect(formatMultiplier("3.14", "en")).toBe("3.14");
  });

  it("NaN → '0'", () => {
    expect(formatMultiplier(NaN)).toBe("0");
  });

  it("en-US localı tr'den farklıdır", () => {
    expect(formatMultiplier(1234.5, "en")).toBe("1,234.5");
  });
});

describe("formatQuantityWithUnit", () => {
  // ─── Auto-upscale / downscale (şartname davranışı) ────────
  describe("otomatik ölçek yükseltme (g/ml sub-units) ve düşürme (kg/L parent-units)", () => {
    it("n >= 1000 + 'g' → 1 kg formatında döner (n/1000 + kg)", () => {
      expect(formatQuantityWithUnit(1000, "g")).toBe("1 kg");
      expect(formatQuantityWithUnit(1500, "g")).toBe("1,5 kg");
    });
 
    it("n >= 1000 + 'ml' → 1.5 L formatında döner (n/1000 + L)", () => {
      expect(formatQuantityWithUnit(1500, "ml")).toBe("1,5 L");
    });
 
    it("büyük-küçük harf duyarsız (G, ML)", () => {
      expect(formatQuantityWithUnit(1000, "G")).toBe("1 kg");
      expect(formatQuantityWithUnit(1500, "ML")).toBe("1,5 L");
    });
 
    it("1000'den küçük değerler upscale olmaz", () => {
      expect(formatQuantityWithUnit(500, "g")).toBe("500 g");
      expect(formatQuantityWithUnit(0.5, "g")).toBe("0,5 g");
    });
 
    it("0 < n < 1 + 'kg'/'L' → downscale olur ve g/ml birimiyle döner", () => {
      expect(formatQuantityWithUnit(0.5, "kg")).toBe("500 g");
      expect(formatQuantityWithUnit(0.25, "L")).toBe("250 ml");
      expect(formatQuantityWithUnit(0.25, "l")).toBe("250 ml");
    });
 
    it("en-US localinde de aynı kurallar geçerlidir", () => {
      expect(formatQuantityWithUnit(1500, "g", "en")).toBe("1.5 kg");
      expect(formatQuantityWithUnit(0.5, "kg", "en")).toBe("500 g");
    });
  });
 
  // ─── Normalizasyon ─────────────────────────────────────────
  describe("normalizasyon", () => {
    it("n >= 1 → orijinal birimle döner", () => {
      expect(formatQuantityWithUnit(2.5, "kg")).toBe("2,5 kg");
    });
 
    it("kg/L gibi üst birimler 0 < n < 1 aralığında downscale olur", () => {
      expect(formatQuantityWithUnit(0.5, "kg")).toBe("500 g");
      expect(formatQuantityWithUnit(0.25, "L")).toBe("250 ml");
    });
 
    it("string input kabul eder", () => {
      expect(formatQuantityWithUnit("2.5", "kg")).toBe("2,5 kg");
    });
 
    it("rastgele birim (adet, kutu) upscale veya downscale olmaz", () => {
      expect(formatQuantityWithUnit(3, "adet")).toBe("3 adet");
      expect(formatQuantityWithUnit(0.5, "kutu")).toBe("0,5 kutu");
    });
  });

  // ─── Uç durumlar ───────────────────────────────────────────
  describe("uç durumlar", () => {
    it("NaN → '0 <unit>'", () => {
      expect(formatQuantityWithUnit(NaN, "kg")).toBe("0 kg");
    });

    it("Infinity → '0 <unit>'", () => {
      expect(formatQuantityWithUnit(Infinity, "kg")).toBe("0 kg");
    });

    it("sıfır → '0 <unit>' (upscale tetiklenmez çünkü 0 > 0 false)", () => {
      expect(formatQuantityWithUnit(0, "g")).toBe("0 g");
      expect(formatQuantityWithUnit(0, "kg")).toBe("0 kg");
    });
  });
});
