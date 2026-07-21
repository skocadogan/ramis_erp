/**
 * WebSocket URL oluşturma utility'si.
 *
 * JWT query string'e konmaz. Kısa ömürlü `ticket` (POST /auth/ws-ticket/) kullanılır.
 */
export function buildWsUrl(
  baseApiUrl: string,
  path: string,
  params: Record<string, string | number | boolean | null | undefined>,
  ticket?: string | null
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

  if (ticket) {
    query.set("ticket", ticket);
  }

  const queryString = query.toString();
  return `${wsBase}${path}${queryString ? `?${queryString}` : ""}`;
}
