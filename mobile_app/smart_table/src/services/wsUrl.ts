// ============================================================
// Smart Table — WebSocket URL builder
// JWT query string'e konmaz; kısa ömürlü ticket kullanılır.
// Pattern: mobile_app/waiter/src/api/wsUrl.ts
// ============================================================

/**
 * POS sync kanalı — KDS sipariş durumu ve masa güncellemeleri.
 * GET ws://host/ws/pos/sync/?branch_id=&ticket=&platform=mobile
 */
export function buildPosSyncWsUrl(
  serverUrl: string,
  branchId: string,
  ticket: string,
): string {
  const trimmed = serverUrl.replace(/\/$/, "");
  const wsBase = trimmed
    .replace(/^http:\/\//i, "ws://")
    .replace(/^https:\/\//i, "wss://");

  const params = new URLSearchParams({
    branch_id: branchId,
    ticket,
    platform: "mobile",
  });

  return `${wsBase}/ws/pos/sync/?${params.toString()}`;
}
