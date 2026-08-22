import { afterEach, describe, expect, it } from "vitest";
import {
  clearTokenCache,
  readAccessToken,
  refreshTokenCache,
  setCachedAccessToken,
} from "./tokenCache";

describe("tokenCache", () => {
  afterEach(() => {
    clearTokenCache();
  });

  it("logout sonrası önbellek Bearer üretmez", () => {
    setCachedAccessToken("stale-jwt");
    expect(readAccessToken()).toBe("stale-jwt");

    clearTokenCache();
    expect(readAccessToken()).toBeNull();
  });

  it("setCachedAccessToken skip bayrağını kapatır", () => {
    clearTokenCache();
    expect(readAccessToken()).toBeNull();
    setCachedAccessToken("rotated");
    expect(readAccessToken()).toBe("rotated");
  });

  it("refreshTokenCache skip bayrağını kaldırır", () => {
    setCachedAccessToken("keep-me");
    clearTokenCache();
    expect(readAccessToken()).toBeNull();
    refreshTokenCache();
    // jsdom yok: window tanımsız → cache null kalır, skip kapanır
    setCachedAccessToken("after-login");
    expect(readAccessToken()).toBe("after-login");
  });
});
