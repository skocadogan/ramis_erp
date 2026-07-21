/** Axios transient retry kararları — birim test edilebilir saf yardımcılar. */

const RETRYABLE_HTTP_STATUSES = new Set([502, 503, 504]);

const SAFE_METHODS = new Set(["get", "head", "options"]);

export function isSafeHttpMethod(method: string | undefined): boolean {
  return SAFE_METHODS.has(String(method || "get").toLowerCase());
}

export function hasIdempotencyKeyHeader(
  headers: Record<string, unknown> | undefined
): boolean {
  if (!headers) return false;
  const keys = Object.keys(headers);
  return keys.some((k) => k.toLowerCase() === "idempotency-key" && Boolean(headers[k]));
}

/**
 * Network / 502-504 retry yalnızca güvenli method veya Idempotency-Key varken.
 * Aksi halde iptal/transfer/print gibi mutasyonlar çiftlenebilir.
 */
export function shouldRetryTransientRequest(opts: {
  method?: string;
  status?: number;
  hasResponse: boolean;
  code?: string;
  url?: string;
  headers?: Record<string, unknown>;
}): boolean {
  const url = String(opts.url ?? "");
  if (url.includes("/health/")) return false;
  if (opts.code === "ECONNABORTED") return false;

  const safeOrIdempotent =
    isSafeHttpMethod(opts.method) || hasIdempotencyKeyHeader(opts.headers);

  if (!safeOrIdempotent) return false;

  if (RETRYABLE_HTTP_STATUSES.has(opts.status ?? 0)) return true;
  if (!opts.hasResponse) return true;
  return false;
}

export { RETRYABLE_HTTP_STATUSES };
