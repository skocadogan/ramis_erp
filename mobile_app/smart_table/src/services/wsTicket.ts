// ============================================================
// Smart Table — Kısa ömürlü WebSocket ticket
// JWT'nin query string'e konmasını önler (waiter ile aynı sözleşme).
// ============================================================

import { api } from "./api";

export async function fetchWsTicket(): Promise<string> {
  const response = await api.post<{ ticket: string; expires_in?: number }>(
    "/auth/ws-ticket/",
  );
  if (response.error || !response.data?.ticket) {
    throw new Error(response.error || "WS ticket alınamadı");
  }
  return response.data.ticket;
}
