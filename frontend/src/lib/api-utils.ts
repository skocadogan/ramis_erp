import { isAxiosError } from 'axios';
import type { AxiosResponse } from 'axios';

const GENERIC_STATUS_MESSAGE_RE = /^Request failed with status code \d{3}$/i;
const ERROR_META_KEYS = new Set(['non_field_errors', 'detail', 'error', 'message']);

function isPrimitiveErrorMessage(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function formatErrorPath(path: Array<string | number>): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') {
      return `${acc}[${segment + 1}]`;
    }
    const key = segment.replaceAll('_', ' ');
    return acc ? `${acc}.${key}` : key;
  }, '');
}

function collectApiErrorMessages(
  value: unknown,
  path: Array<string | number> = [],
  messages: string[] = []
): string[] {
  if (isPrimitiveErrorMessage(value)) {
    const message = String(value).trim();
    if (!message) return messages;
    const prefix = path.length ? `${formatErrorPath(path)}: ` : '';
    messages.push(`${prefix}${message}`);
    return messages;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const nextPath = isPrimitiveErrorMessage(item) ? path : [...path, index];
      collectApiErrorMessages(item, nextPath, messages);
    });
    return messages;
  }

  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, nestedValue]) => {
      const nextPath = ERROR_META_KEYS.has(key) ? path : [...path, key];
      collectApiErrorMessages(nestedValue, nextPath, messages);
    });
  }

  return messages;
}

function extractStructuredApiError(data: unknown): string | null {
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
      return null;
    }
    return trimmed;
  }

  const messages = Array.from(new Set(collectApiErrorMessages(data)));
  if (messages.length === 0) return null;
  return messages.slice(0, 3).join(' | ');
}

/**
 * DRF paginated veya düz liste yanıtlarını güvenli şekilde dizi olarak açar.
 * Hem `{ results: T[] }` hem de `T[]` formatlarını destekler.
 *
 * @example
 *   const items = unwrapList<StockItem>(res);  // res.data.results || res.data
 */
export function unwrapList<T>(res: AxiosResponse): T[] {
  const d = res.data;
  if (Array.isArray(d)) return d as T[];
  if (d && Array.isArray(d.results)) return d.results as T[];
  return [];
}

/**
 * Axios veya bilinmeyen hatadan okunabilir bir mesaj çıkarır.
 * `detail`, `error`, `message` alanlarını sırayla kontrol eder.
 *
 * Production'da kullanıcıya göstermek için genelde `@/lib/operationalToast` içindeki `toastApiError` kullanılır.
 *
 * @example
 *   } catch (e) {
 *     toastApiError(e, "İşlem başarısız oldu.");
 *   }
 */
export function extractApiError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const extracted = extractStructuredApiError(err.response?.data);
    if (extracted) return extracted;
    if (err.message && !GENERIC_STATUS_MESSAGE_RE.test(err.message.trim())) return err.message;
    return fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
