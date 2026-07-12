/**
 * server_url (örn. http://192.168.0.11:8000/api/v1) → ESP'nin beklediği host:port
 */
export function extractRamisHostPort(serverUrl: string): string {
  const trimmed = serverUrl.trim();
  if (!trimmed) {
    throw new Error("empty_server_url");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("invalid_server_url");
  }

  if (url.port) {
    return `${url.hostname}:${url.port}`;
  }

  if (url.protocol === "https:") {
    return url.hostname;
  }

  return url.hostname;
}
