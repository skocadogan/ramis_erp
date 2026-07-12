import { getRuntimeConfig } from "@/lib/runtimeConfig";

/**
 * Genel erişilebilirlik (AllowAny). Başarı: HTTP 200 ve JSON { "status": "ok" }.
 */
export async function checkBackendHealth(signal?: AbortSignal): Promise<boolean> {
  const url = `${getRuntimeConfig().apiBaseUrl}/health/`;
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string };
    return data.status === "ok";
  } catch {
    return false;
  }
}
