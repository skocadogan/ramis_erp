/**
 * WebSocket URL oluşturma utility'si.
 *
 * Backend hem ham hem de base64 encode edilmiş ?token= değerini kabul eder.
 * Base64 encoding sadece log gizleme amaçlıdır; gerçek güvenlik değildir.
 * True security için backend'de kısa ömürlü WS token desteği önerilir.
 */
export function buildWsUrl(
  baseApiUrl: string,
  path: string,
  params: Record<string, string | number | boolean | null | undefined>,
  token?: string
): string {
  const wsBase = baseApiUrl
    .replace("http://", "ws://")
    .replace("https://", "wss://")
    .split("/api")[0];

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    query.set(key, String(value));
  }

  if (token) {
    const encodedToken = typeof btoa !== "undefined" ? btoa(token) : token;
    query.set("token", encodedToken);
  }

  const queryString = query.toString();
  return `${wsBase}${path}${queryString ? `?${queryString}` : ""}`;
}
