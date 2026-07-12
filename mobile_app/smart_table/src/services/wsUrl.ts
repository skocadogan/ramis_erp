// ============================================================
// Smart Table — WebSocket URL builder
// Pattern: mobile_app/waiter useTableSync + backend ws_auth
// ============================================================

function encodeTokenForWs(token: string): string {
  try {
    if (typeof globalThis.btoa === "function") {
      return globalThis.btoa(token);
    }
  } catch {
    // Ham JWT ile devam (ws_auth geriye dönük uyumlu)
  }
  return token;
}

/**
 * POS sync kanalı — KDS sipariş durumu ve masa güncellemeleri.
 * GET ws://host/ws/pos/sync/?branch_id=&token=&platform=mobile
 */
export function buildPosSyncWsUrl(
  serverUrl: string,
  branchId: string,
  token: string,
): string {
  const trimmed = serverUrl.replace(/\/$/, "");
  const wsBase = trimmed
    .replace(/^http:\/\//i, "ws://")
    .replace(/^https:\/\//i, "wss://");

  const params = new URLSearchParams({
    branch_id: branchId,
    token: encodeTokenForWs(token),
    platform: "mobile",
  });

  return `${wsBase}/ws/pos/sync/?${params.toString()}`;
}
