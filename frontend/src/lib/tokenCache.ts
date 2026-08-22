/**
 * Access JWT bellek önbelleği.
 * POS'ta her istekte localStorage okumamak için; login/logout ile senkron tutulur.
 */

let cachedToken: string | null = null;
/** Logout sonrası persist yazılana kadar localStorage'dan token okunmasın. */
let skipStorageRead = false;

export function clearTokenCache(): void {
  cachedToken = null;
  skipStorageRead = true;
}

export function setCachedAccessToken(token: string | null): void {
  cachedToken = token;
  skipStorageRead = false;
}

export function refreshTokenCache(): void {
  skipStorageRead = false;
  if (typeof window === "undefined") {
    cachedToken = null;
    return;
  }
  try {
    const authData = localStorage.getItem("auth-storage");
    if (authData) {
      const parsed = JSON.parse(authData);
      cachedToken = parsed?.state?.token ?? null;
    } else {
      cachedToken = null;
    }
  } catch {
    cachedToken = null;
  }
}

export function readAccessToken(): string | null {
  if (skipStorageRead) {
    return null;
  }
  if (!cachedToken) {
    refreshTokenCache();
  }
  return cachedToken;
}
