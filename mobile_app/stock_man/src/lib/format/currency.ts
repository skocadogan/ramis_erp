// ============================================================
// Stock Man — Currency formatters
//
// Sembol ve biçim şablonu aktif dilin çeviri dosyasından gelir
// (`currency.symbol`, `currency.code`, `currency.format`).
// ============================================================

import { useCanViewAmounts } from "@/hooks/usePermission";
import {
  LANGUAGE_LOCALES,
  tSync,
  useI18n,
  type Language,
} from "@/i18n";

export function getCurrencySymbol(language: Language): string {
  return tSync("currency.symbol", language);
}

function formatCurrencyAmount(value: number, language: Language): string {
  return new Intl.NumberFormat(LANGUAGE_LOCALES[language], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Aktif dile göre para formatı (ör. `₺1.234,50` veya `1 234,56 €`). */
export function formatCurrency(
  value: number | string,
  language: Language = "tr"
): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!isFinite(n)) return "0";

  const symbol = getCurrencySymbol(language);
  const amount = formatCurrencyAmount(n, language);
  const template = tSync("currency.format", language);

  if (template.includes("{symbol}") || template.includes("{amount}")) {
    return template.replace("{symbol}", symbol).replace("{amount}", amount);
  }

  return `${symbol}${amount}`;
}

/**
 * RBAC-aware currency formatter. When the user lacks
 * `financial.view_amount` the returned function always renders
 * the mask (`•••`), so call sites stay one-liners.
 */
export function useFormatCurrency() {
  const canView = useCanViewAmounts();
  const { language } = useI18n();

  return (value: number | string, locale?: Language) => {
    if (!canView) return AMOUNT_MASK;
    return formatCurrency(value, locale ?? language);
  };
}

/** Canonical mask string for amounts. Mirrors `Amount.tsx`. */
export const AMOUNT_MASK = "•••";
