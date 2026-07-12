// ============================================================
// Smart Table — API Token Cache
// Module-level token storage. Extracted from api.ts to break
// require cycle: auth-store → api → auth-store.
// Uses a mutable object (not bare let exports) so importers can
// reassign properties without TypeScript read-only errors.
// ============================================================

export const tokenState = {
  access: null as string | null,
  refresh: null as string | null,
  refreshPromise: null as Promise<boolean> | null,
};

export function setCachedToken(token: string | null) {
  tokenState.access = token;
}

export function setCachedRefreshToken(refreshToken: string | null) {
  tokenState.refresh = refreshToken;
}
