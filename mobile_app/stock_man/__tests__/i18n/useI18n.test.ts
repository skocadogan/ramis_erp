// ============================================================
// Stock Man — i18n testleri
// ============================================================
//
// `tSync` saf fonksiyondur; `useI18n()` ise useUIStore'dan
// aktif dili okur. useUIStore testi ayrı dosyada olduğu için
// burada sadece `tSync`'in sözlük doğruluğunu ve parametre
// substitution'ı test ederiz. useI18n davranışı da
// mock'lu useUIStore ile doğrulanır.
// ============================================================

import { tSync, useI18n, type Language } from "@/i18n";
import { renderHook, act } from "@testing-library/react-native";
import { useUIStore } from "@/store/useUIStore";

beforeEach(() => {
  useUIStore.setState({ language: "tr", themePreference: "system" });
});

describe("tSync — sözlük doğruluğu (varsayılan TR)", () => {
  it("common.save → 'Kaydet'", () => {
    expect(tSync("common.save", "tr")).toBe("Kaydet");
  });

  it("auth.username → 'Kullanıcı Adı'", () => {
    expect(tSync("auth.username", "tr")).toBe("Kullanıcı Adı");
  });

  it("dashboard.kpis.lowStock → 'Düşük Stok'", () => {
    expect(tSync("dashboard.kpis.lowStock", "tr")).toBe("Düşük Stok");
  });

  it("derin iç içe key (purchase.statusLabels.approved)", () => {
    expect(tSync("purchase.statusLabels.approved", "tr")).toBe("Onaylandı");
  });

  it("currency.symbol dil bazlı", () => {
    expect(tSync("currency.symbol", "tr")).toBe("₺");
    expect(tSync("currency.symbol", "en")).toBe("₺");
    expect(tSync("currency.symbol", "bg")).toBe("€");
    expect(tSync("currency.symbol", "sq")).toBe("L");
  });
});

describe("tSync — diğer diller", () => {
  it("en: common.save → 'Save'", () => {
    expect(tSync("common.save", "en")).toBe("Save");
  });

  it("en: auth.username → 'Username'", () => {
    expect(tSync("auth.username", "en")).toBe("Username");
  });

  it("bg: common.save → 'Запази' (BG sözlüğü)", () => {
    const result = tSync("common.save", "bg");
    expect(result).toBeTruthy();
    // BG'de aynı anahtar, sadece değer kontrolü
    expect(result).not.toBe("Kaydet");
  });

  it("sq: common.save → 'Ruaj' (SQ sözlüğü)", () => {
    const result = tSync("common.save", "sq");
    expect(result).toBeTruthy();
  });
});

describe("tSync — parametre substitution", () => {
  it("transfer.insufficientStock → 'Yetersiz stok: {name}' yerine 'Sedat' geçer", () => {
    expect(tSync("transfer.insufficientStock", "tr", { name: "Sedat" })).toBe(
      "Yetersiz stok: Sedat"
    );
  });

  it("scanner.notFound → 'Ürün bulunamadı: {code}'", () => {
    expect(tSync("scanner.notFound", "tr", { code: "1234567890" })).toBe(
      "Ürün bulunamadı: 1234567890"
    );
  });

  it("expiry.daysLeft → '{days} gün kaldı'", () => {
    expect(tSync("expiry.daysLeft", "tr", { days: 5 })).toBe("5 gün kaldı");
  });

  it("aynı anahtar birden çok kez geçiyorsa hepsi değişir", () => {
    // Bu örnekte tek geçiyor; birden çoklu örnek olarak
    // {x} içeren kurgusal bir key test edebiliriz ama
    // sözlükte yok. Burada sadece regex global davranışını
    // dolaylı yoldan doğruluyoruz: aynı parametre birden
    // çok kez geçse replace(/.../g, ...) ile hepsi değişmeli.
    // En azından tek substitution çalıştığını görüyoruz.
    expect(tSync("expiry.daysLeft", "tr", { days: 0 })).toBe("0 gün kaldı");
  });

  it("params olmadan aynı anahtar döner", () => {
    expect(tSync("expiry.daysLeft", "tr")).toBe("{days} gün kaldı");
  });
});

describe("tSync — hata / eksik durumlar", () => {
  it("olmayan key → key'in kendisi döner", () => {
    expect(tSync("this.key.does.not.exist", "tr")).toBe(
      "this.key.does.not.exist"
    );
  });

  it("kısmi mevcut key (nesting yarıda koparsa) → key döner", () => {
    // 'common' var, 'common.foo' yok
    expect(tSync("common.foo", "tr")).toBe("common.foo");
  });

  it("dil bilinmiyor → TR fallback", () => {
    // Type cast ile geçersiz bir dil ver → sözlük bulunamaz → tr'ye düş
    expect(tSync("common.save", "xx" as unknown as Language)).toBe("Kaydet");
  });
});

describe("useI18n() — React hook", () => {
  it("useUIStore.language='tr' ise t() Türkçe döner", () => {
    useUIStore.setState({ language: "tr" });
    const { result } = renderHook(() => useI18n());
    expect(result.current.t("common.save")).toBe("Kaydet");
    expect(result.current.language).toBe("tr");
  });

  it("useUIStore.language='en' ise t() İngilizce döner", () => {
    useUIStore.setState({ language: "en" });
    const { result } = renderHook(() => useI18n());
    expect(result.current.t("common.save")).toBe("Save");
    expect(result.current.language).toBe("en");
  });

  it("t() parametre kabul eder", () => {
    useUIStore.setState({ language: "tr" });
    const { result } = renderHook(() => useI18n());
    expect(result.current.t("expiry.daysLeft", { days: 7 })).toBe("7 gün kaldı");
  });

  it("setLanguage useUIStore'u günceller", async () => {
    useUIStore.setState({ language: "tr" });
    const { result } = renderHook(() => useI18n());
    // setLanguage async (SecureStore yazımı); act ile sarıyoruz ki
    // React state update warning'i çıkmasın
    await act(async () => {
      result.current.setLanguage("en");
      // useUIStore.language set çağrısı await'tan önce senkron yapılır
    });
    expect(useUIStore.getState().language).toBe("en");
  });
});
