import { axiosClient } from "@/api/client";

/** Kısa ömürlü WS ticket — JWT query string sızıntısını önler. */
export async function fetchWsTicket(): Promise<string> {
  const { data } = await axiosClient.post<{ ticket: string; expires_in?: number }>(
    "/auth/ws-ticket/"
  );
  if (!data?.ticket) {
    throw new Error("WS ticket alınamadı");
  }
  return data.ticket;
}
