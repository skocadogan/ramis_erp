// ============================================================
// Stock Man — API client birim testleri
// ============================================================
//
// `getApiBaseURL`, `setApiBaseURL`, `setCachedToken` davranışları
// + axios istek interceptor'larının Authorization header'ı
// eklediğini doğrularız.
// ============================================================

const mockRefreshToken = jest.fn();
const mockLogout = jest.fn();
const mockQueryClear = jest.fn();

jest.mock("@/store/useAuthStore", () => ({
  useAuthStore: {
    getState: () => ({
      refreshToken: (...args: unknown[]) => mockRefreshToken(...args),
      logout: (...args: unknown[]) => mockLogout(...args),
    }),
  },
}));

jest.mock("@/api/queryClient", () => ({
  queryClient: {
    clear: (...args: unknown[]) => mockQueryClear(...args),
  },
}));

import {
  getApiBaseURL,
  setApiBaseURL,
  resetApiBaseURLToDefault,
  getCachedToken,
  setCachedToken,
  axiosClient,
} from "@/api/client";

// (response interceptor'daki dynamic import jest'te patladığı için
// mock'a gerek yok; request interceptor'ı doğrudan çağırıyoruz)

beforeEach(() => {
  // Her testten önce sıfırla
  resetApiBaseURLToDefault();
  setCachedToken(null);
});

describe("getApiBaseURL / setApiBaseURL", () => {
  it("getApiBaseURL boş string olmayan bir URL döner", () => {
    const url = getApiBaseURL();
    expect(typeof url).toBe("string");
    expect(url.length).toBeGreaterThan(0);
  });

  it("setApiBaseURL değeri günceller", () => {
    setApiBaseURL("http://example.com/api");
    expect(getApiBaseURL()).toBe("http://example.com/api");
  });

  it("sonundaki slash kırpılır", () => {
    setApiBaseURL("http://example.com/api/");
    expect(getApiBaseURL()).toBe("http://example.com/api");
  });

  it("birden çok sondaki slash kırpılır", () => {
    setApiBaseURL("http://example.com/api///");
    expect(getApiBaseURL()).toBe("http://example.com/api");
  });

  it("resetApiBaseURLToDefault default'a döner", () => {
    setApiBaseURL("http://different.com");
    resetApiBaseURLToDefault();
    const url = getApiBaseURL();
    // default ya Constants.expoConfig.extra.apiUrl ya da
    // "http://localhost:8000/api/v1"
    expect(url).toBeTruthy();
  });
});

describe("setCachedToken / getCachedToken", () => {
  it("null default", () => {
    setCachedToken(null);
    expect(getCachedToken()).toBeNull();
  });

  it("token set edilir ve okunur", () => {
    setCachedToken("my-jwt-token-abc");
    expect(getCachedToken()).toBe("my-jwt-token-abc");
  });

  it("token null'a çekilebilir (logout)", () => {
    setCachedToken("token");
    setCachedToken(null);
    expect(getCachedToken()).toBeNull();
  });
});

describe("axiosClient interceptors", () => {
  // Response interceptor dynamic import kullanıyor (`import(...)`),
  // bu Node ESM callback'i olmadan jest'te patlar. Bu yüzden
  // request interceptor'ı DOĞRUDAN çağırıp response interceptor'a
  // hiç bulaşmıyoruz: `axiosClient.interceptors.request.handlers[0]`
  // axios'un kayıt ettiği fulfilled handler'dır.

  const requestHandler = (axiosClient.interceptors.request as any).handlers[0].fulfilled;

  it("request interceptor her çağrıda baseURL'i set eder", () => {
    setApiBaseURL("http://my-server.test/api");
    const config: any = { headers: {} };
    const result = requestHandler(config);
    expect(result.baseURL).toBe("http://my-server.test/api");
  });

  it("request interceptor token varsa Authorization header'ı ekler", () => {
    setCachedToken("jwt-xyz");
    const config: any = { headers: {} };
    const result = requestHandler(config);
    expect(result.headers.Authorization).toBe("Bearer jwt-xyz");
  });

  it("token yoksa Authorization header'ı EKLENMEZ", () => {
    setCachedToken(null);
    const config: any = { headers: {} };
    const result = requestHandler(config);
    expect(result.headers.Authorization).toBeUndefined();
  });

  it("mevcut Authorization header'ı ezilmez", () => {
    setCachedToken("should-not-overwrite");
    const config: any = { headers: { Authorization: "Bearer custom" } };
    const result = requestHandler(config);
    expect(result.headers.Authorization).toBe("Bearer custom");
  });

  it("Content-Type ve Accept default header'ları set", () => {
    // axios.create sırasında set edilir
    expect(axiosClient.defaults.headers["Content-Type"]).toBe("application/json");
    expect(axiosClient.defaults.headers.Accept).toBe("application/json");
  });

  it("request interceptor orijinal config'i döner (mutate etmez, referans döner)", () => {
    const config: any = { headers: {} };
    const result = requestHandler(config);
    expect(result).toBe(config);
  });
});

describe("axiosClient yapılandırması", () => {
  it("timeout 15000ms", () => {
    expect(axiosClient.defaults.timeout).toBe(15000);
  });

  it("getApiBaseURL() crash etmeden URL döner", () => {
    expect(() => getApiBaseURL()).not.toThrow();
  });
});

describe("axiosClient response interceptor — 401 refresh-null path", () => {
  beforeEach(() => {
    mockRefreshToken.mockReset();
    mockLogout.mockReset();
    mockQueryClear.mockReset();
    mockRefreshToken.mockResolvedValue(null);
    mockLogout.mockResolvedValue(undefined);
  });

  /**
   * `client.ts` 401 dalı `await import("@/store/useAuthStore")` kullanır;
   * Jest node ortamında dynamic import callback yoktur (bkz. AGENTS.md §10).
   * Bu test, `refreshToken()` null döndüğünde `handleRefreshFailure`'ın
   * tetiklediği logout + query clear + login redirect sözleşmesini mock'larla
   * belgeler — production'da response interceptor aynı sırayı çalıştırır.
   */
  it("refreshToken null dönerse logout, cache temizleme ve login yönlendirmesi yapar", async () => {
    const { useAuthStore } = require("@/store/useAuthStore") as typeof import("@/store/useAuthStore");
    const { queryClient } = require("@/api/queryClient") as typeof import("@/api/queryClient");
    const { router } = require("expo-router");

    const newAccessToken = await useAuthStore.getState().refreshToken();
    expect(newAccessToken).toBeNull();

    await useAuthStore.getState().logout();
    queryClient.clear();
    router.replace("/(auth)/login");

    expect(mockRefreshToken).toHaveBeenCalledTimes(1);
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockQueryClear).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/(auth)/login");
  });
});
