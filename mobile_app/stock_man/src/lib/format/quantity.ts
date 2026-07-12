// ============================================================
// Stock Man — Quantity formatters
//
// Localised decimal formatting for stock quantities, unit
// multipliers and the g→kg / ml→L auto-upscale helper. All
// functions take a `Language` so they work outside React
// (e.g. in a service or store) — see `useFormatters` for the
// React-side hook that reads the active language from i18n.
// ============================================================

import type { Language } from "@/i18n";

const LOCALES: Record<Language, string> = {
  tr: "tr-TR",
  en: "en-US",
  bg: "bg-BG",
  sq: "sq-AL",
};

/**
 * Format a stock quantity with up to 6 decimal places,
 * trimming trailing zeros so `0.500` becomes `0,5`.
 */
export function formatQuantity(value: number | string | null | undefined, locale: Language = "tr"): string {
  if (value == null) return "0";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!isFinite(n)) return "0";
  // 6 decimal precision max, trim trailing zeros
  const fixed = n.toFixed(6);
  const trimmed = fixed.replace(/\.?0+$/, "");
  return new Intl.NumberFormat(LOCALES[locale], {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(parseFloat(trimmed));
}

/** Format a unit multiplier (kg→g conversion factor etc.). */
export function formatMultiplier(value: number | string, locale: Language = "tr"): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!isFinite(n)) return "0";
  return new Intl.NumberFormat(LOCALES[locale], {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(n);
}

/**
 * Smart quantity+unit formatter:
 *   - If the value is >= 1000 and the unit is a sub-unit (g, ml),
 *     upscales to the parent (kg, L) for readability.
 *   - If the value is 0 < n < 1 and the unit is a parent unit (kg, L),
 *     downscales to the sub-unit (g, ml) for readability.
 *   - Otherwise returns the value with its original unit.
 */
export function formatQuantityWithUnit(
  value: number | string,
  unit: string,
  locale: Language = "tr"
): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!isFinite(n)) return `0 ${unit}`;

  const u = unit.toLowerCase();

  // Auto-upscale: büyük gram/ml değerlerini kg/L'ye çevir
  if (n >= 1000) {
    if (u === "g") return `${formatQuantity(n / 1000, locale)} kg`;
    if (u === "ml") return `${formatQuantity(n / 1000, locale)} L`;
  }

  // Auto-downscale: 0 < n < 1 kg/L değerlerini gram/ml'ye çevir
  if (n > 0 && n < 1) {
    if (u === "kg") return `${formatQuantity(n * 1000, locale)} g`;
    if (u === "l") return `${formatQuantity(n * 1000, locale)} ml`;
  }

  return `${formatQuantity(n, locale)} ${unit}`;
}
