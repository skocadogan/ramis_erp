// ============================================================
// Stock Man — Combined formatters hook
//
// Wraps the pure formatter functions in a single memoised
// object so screens / list cells can do:
//
//   const { currency, qtyWithUnit, date } = useFormatters();
//   <Text>{currency(item.total)}</Text>
//
// instead of importing each function individually. The
// underlying functions remain pure and importable for
// non-React code (stores, services, native modules).
// ============================================================

import { useMemo } from "react";
import { useI18n, type Language } from "@/i18n";
import {
  formatCurrency,
  formatQuantity,
  formatMultiplier,
  formatQuantityWithUnit,
  formatDate,
  formatDateTime,
  formatRelative,
  daysUntil,
} from "@/lib/format";

export function useFormatters() {
  const { language } = useI18n();
  const lang = language as Language;
  return useMemo(
    () => ({
      language: lang,
      currency: (value: number | string) => formatCurrency(value, lang),
      quantity: (value: number | string) => formatQuantity(value, lang),
      multiplier: (value: number | string) => formatMultiplier(value, lang),
      qtyWithUnit: (value: number | string, unit: string) =>
        formatQuantityWithUnit(value, unit, lang),
      date: (iso: string | Date | null | undefined) => formatDate(iso, lang),
      dateTime: (iso: string | Date | null | undefined) =>
        formatDateTime(iso, lang),
      relative: (iso: string | Date | null | undefined) =>
        formatRelative(iso, lang),
      daysUntil: (iso: string | Date | null | undefined) => daysUntil(iso),
    }),
    [lang]
  );
}
