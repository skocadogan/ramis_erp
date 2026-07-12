// ============================================================
// Stock Man — useUIStore birim testleri
// ============================================================
//
// UI tercihi (dil, tema) SecureStore'a yazılır; hydrateFromStorage
// boot'ta geri yükler. Testlerde SecureStore zaten mock'lu
// (jest.setup.ts).
// ============================================================

import { useUIStore } from "@/store/useUIStore";
import * as SecureStore from "expo-secure-store";

const getItemAsync = SecureStore.getItemAsync as unknown as jest.Mock;
const setItemAsync = SecureStore.setItemAsync as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // Default state'e döndür
  useUIStore.setState({ language: "tr", themePreference: "system" });
  getItemAsync.mockResolvedValue(null);
});

describe("başlangıç durumu", () => {
  it("language='tr', themePreference='system'", () => {
    const s = useUIStore.getState();
    expect(s.language).toBe("tr");
    expect(s.themePreference).toBe("system");
  });
});

describe("setLanguage", () => {
  it("state'i günceller", async () => {
    await useUIStore.getState().setLanguage("en");
    expect(useUIStore.getState().language).toBe("en");
  });

  it("SecureStore'a yazar", async () => {
    await useUIStore.getState().setLanguage("en");
    expect(setItemAsync).toHaveBeenCalledWith("stockman_language", "en");
  });

  it("tüm desteklenen diller kabul edilir", async () => {
    for (const lang of ["tr", "en", "bg", "sq"] as const) {
      await useUIStore.getState().setLanguage(lang);
      expect(useUIStore.getState().language).toBe(lang);
    }
  });
});

describe("setThemePreference", () => {
  it("light/dark/system hepsi kabul", async () => {
    for (const t of ["light", "dark", "system"] as const) {
      await useUIStore.getState().setThemePreference(t);
      expect(useUIStore.getState().themePreference).toBe(t);
      expect(setItemAsync).toHaveBeenCalledWith("stockman_theme", t);
    }
  });
});

describe("hydrateFromStorage", () => {
  it("SecureStore'dan okur ve state'i günceller", async () => {
    getItemAsync.mockImplementation(async (key: string) => {
      if (key === "stockman_language") return "bg";
      if (key === "stockman_theme") return "dark";
      return null;
    });

    await useUIStore.getState().hydrateFromStorage();

    const s = useUIStore.getState();
    expect(s.language).toBe("bg");
    expect(s.themePreference).toBe("dark");
  });

  it("null dönen anahtarlar default kalır", async () => {
    getItemAsync.mockResolvedValue(null);
    await useUIStore.getState().hydrateFromStorage();
    const s = useUIStore.getState();
    expect(s.language).toBe("tr");
    expect(s.themePreference).toBe("system");
  });

  it("her iki anahtarı birden okur (Promise.all)", async () => {
    const getItemSpy = jest.spyOn(SecureStore, "getItemAsync");
    getItemSpy.mockImplementation(async (key: string) => {
      if (key === "stockman_language") return "en";
      if (key === "stockman_theme") return "light";
      return null;
    });

    await useUIStore.getState().hydrateFromStorage();
    expect(getItemSpy).toHaveBeenCalledWith("stockman_language");
    expect(getItemSpy).toHaveBeenCalledWith("stockman_theme");
  });
});

describe("hata yönetimi", () => {
  it("setLanguage SecureStore throw ederse crash etmez, state yine değişir", async () => {
    setItemAsync.mockRejectedValue(new Error("keystore down"));
    await expect(useUIStore.getState().setLanguage("en")).resolves.toBeUndefined();
    expect(useUIStore.getState().language).toBe("en");
  });

  it("setThemePreference SecureStore throw ederse crash etmez", async () => {
    setItemAsync.mockRejectedValue(new Error("keystore down"));
    await expect(useUIStore.getState().setThemePreference("dark")).resolves.toBeUndefined();
    expect(useUIStore.getState().themePreference).toBe("dark");
  });

  it("hydrateFromStorage SecureStore throw ederse default'lara düşer", async () => {
    getItemAsync.mockRejectedValue(new Error("keystore down"));
    await expect(useUIStore.getState().hydrateFromStorage()).resolves.toBeUndefined();
    const s = useUIStore.getState();
    expect(s.language).toBe("tr");
    expect(s.themePreference).toBe("system");
  });
});
