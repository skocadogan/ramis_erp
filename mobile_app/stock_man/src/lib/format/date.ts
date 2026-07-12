// ============================================================
// Stock Man — Date formatters
//
// Three flavours:
//   - `formatDate`     → short, e.g. `14 Haz 2026`
//   - `formatDateTime` → date + time, e.g. `14 Haz 2026 19:42`
//   - `formatRelative` → "in 3 days" / "2 hours ago" (auto-scaling)
// Plus `daysUntil` for the SKT dashboard counters.
// ============================================================

import type { Language } from "@/i18n";

const LOCALES: Record<Language, string> = {
  tr: "tr-TR",
  en: "en-US",
  bg: "bg-BG",
  sq: "sq-AL",
};

/** Short date (e.g. `14 Haz 2026`). Returns `—` for null/invalid. */
export function formatDate(iso: string | Date | null | undefined, locale: Language = "tr"): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALES[locale], {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(d);
}

/** Date + time (e.g. `14 Haz 2026 19:42`). */
export function formatDateTime(iso: string | Date | null | undefined, locale: Language = "tr"): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALES[locale], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Relative time (`bugün`, `2 gün önce`, `in 3 days`, etc.).
 * Auto-scales from hours → days → months; the auto-scaling is
 * coarse on purpose — exact times use `formatDateTime`.
 */
export function formatRelative(iso: string | Date | null | undefined, locale: Language = "tr"): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "—";
  const diff = d.getTime() - Date.now();
  const days = Math.round(diff / (1000 * 60 * 60 * 24));
  const rtf = new Intl.RelativeTimeFormat(LOCALES[locale], { numeric: "auto" });
  if (Math.abs(days) < 1) {
    const hours = Math.round(diff / (1000 * 60 * 60));
    return rtf.format(hours, "hour");
  }
  if (Math.abs(days) < 30) return rtf.format(days, "day");
  const months = Math.round(days / 30);
  return rtf.format(months, "month");
}

/**
 * Whole days between now and the given date (positive = future,
 * negative = past). Returns `null` for null/invalid input.
 */
export function daysUntil(iso: string | Date | null | undefined): number | null {
  if (!iso) return null;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is a real calendar date in `YYYY-MM-DD` form. */
export function isValidIsoDate(value: string | null | undefined): boolean {
  if (!value || !ISO_DATE_RE.test(value)) return false;
  const parts = value.split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 0;
  const day = parts[2] ?? 0;
  const dt = new Date(year, month - 1, day);
  return (
    dt.getFullYear() === year &&
    dt.getMonth() === month - 1 &&
    dt.getDate() === day
  );
}

/** Parse `YYYY-MM-DD` as local calendar date (no UTC drift). */
export function parseIsoDate(value: string): Date {
  if (isValidIsoDate(value)) {
    const parts = value.split("-").map(Number);
    return new Date(parts[0]!, parts[1]! - 1, parts[2]!);
  }
  return new Date();
}

/** Format a Date as `YYYY-MM-DD` for API query params. */
export function toIsoDate(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return toIsoDate(new Date());
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Return a valid ISO date string or `undefined` for API params. */
export function normalizeIsoDate(
  value: string | null | undefined
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !isValidIsoDate(trimmed)) return undefined;
  return trimmed;
}
