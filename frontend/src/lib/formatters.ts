/**
 * Merkezi biçimlendirme: para, miktar, birim çarpanı, tarih.
 *
 * Kurallar (varsayılan tr-TR; locale parametresi ile değiştirilebilir):
 * - Para: tam 2 ondalık — `formatCurrency`
 * - Miktar (stok, reçete, hareket vb.): tam 2 ondalık — `formatQuantity`
 * - Birim çarpanı (StockUnit.multiplier): tam 3 ondalık — `formatUnitMultiplier`
 *
 * Para gösteriminde doğrudan `toLocaleString` kullanmayın; tutarlılık için bu modülü kullanın.
 *
 * NOT: `formatCurrency`, `formatNumber` vb. fonksiyonlar locale parametresi ALMAZSA
 * otomatik olarak `_currentLocale` değişkenini kullanır. Bu değişken varsayılan "tr" olup
 * uygulama başlangıcında `setCurrentLocale()` ile güncellenir (bkz: providers.tsx).
 */
"use client";

/**
 * Locale kodu → BCP 47 etiket.
 * next-intl locale değerini ("tr", "en" vb.) Intl API'si için dönüştürür.
 */
import { useLocale } from "next-intl";

/** Module-level mevcut locale — varsayılan "tr", `setCurrentLocale()` ile değişir. */
let _currentLocale: string = 'tr';

/**
 * Mevcut locale'i günceller. next-intl `useLocale()` değiştiğinde çağrılmalıdır.
 * Bu sayede locale parametresi geçilmeyen tüm formatCurrency/formatNumber çağrıları
 * otomatik olarak güncel locale'i kullanır.
 */
export function setCurrentLocale(locale: string) {
  _currentLocale = locale;
}

function resolveLocaleTag(locale?: string): string {
  const map: Record<string, string> = {
    tr: 'tr-TR',
    en: 'en-US',
    ar: 'ar-SA',
    de: 'de-DE',
    ru: 'ru-RU',
    bg: 'bg-BG',
    sq: 'sq-AL',
  };
  return map[locale ?? _currentLocale] ?? 'tr-TR';
}

/** Locale → para birimi sembolü haritası. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  tr: '₺',
  en: '₺',
  ar: '₺',
  de: '₺',
  ru: '₺',
  bg: '€',
  sq: 'L',
};

/**
 * Locale'e göre para birimi sembolü döndürür.
 * @param locale  Opsiyonel locale. Varsayılan: `_currentLocale`.
 */
export function getCurrencySymbol(locale?: string): string {
  return CURRENCY_SYMBOLS[locale ?? _currentLocale] ?? '₺';
}

/**
 * Para tutarını locale'e duyarlı biçimlendirir, para birimi sembolünü ekler.
 * @param locale  Opsiyonel locale ("tr", "en", "ar", "de", "ru", "bg", "sq").
 *                Varsayılan: `_currentLocale` (setCurrentLocale ile güncellenir).
 * @example 1234.56 -> "₺1.234,56" (tr) | "₺1,234.56" (en) | "€1.234,56" (bg) | "L1.234,56" (sq)
 */
export const formatCurrency = (value: number | string, locale?: string): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  const loc = locale ?? _currentLocale;
  if (isNaN(num)) return `${getCurrencySymbol(loc)}0,00`;
  const sym = getCurrencySymbol(loc);
  const formatted = num.toLocaleString(resolveLocaleTag(loc), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sym}${formatted}`;
};

/** `financial.view_amount` yokken gösterilecek tutar maskesi */
export const AMOUNT_DISPLAY_MASK = "***";

/**
 * Tutar görüntüleme iznine göre para metni veya mask.
 * İzin yoksa `***`; varsa `formatCurrency` ile locale-uyumlu sembollü tutar.
 *
 * @example formatAmount(1234.56, true) → "₺1.234,56" | formatAmount(1234.56, false) → "***"
 */
export function formatAmount(
  value: number | string,
  canViewAmounts: boolean
): string {
  if (!canViewAmounts) return AMOUNT_DISPLAY_MASK;
  return formatCurrency(value);
}

export type FormatNumberOptions = {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

/**
 * Genel sayı biçimlendirmesi. Varsayılan 2 ondalık (min=max=2).
 * İleri düzey kullanım için ikinci argüman sayı veya min/max objesi.
 * @param locale  Opsiyonel locale. Varsayılan: `_currentLocale`.
 */
export function formatNumber(
  value: number | string,
  decimalsOrOptions: number | FormatNumberOptions = 2,
  locale?: string
): string {
  const num =
    typeof value === "number"
      ? value
      : Number(value.trim().replace(/\s/g, "").replace(",", "."));

  if (!Number.isFinite(num)) {
    return typeof value === "string" ? value.trim() : "0";
  }

  const tag = resolveLocaleTag(locale ?? _currentLocale);

  if (typeof decimalsOrOptions === "number") {
    return num.toLocaleString(tag, {
      minimumFractionDigits: decimalsOrOptions,
      maximumFractionDigits: decimalsOrOptions,
    });
  }

  const min = decimalsOrOptions.minimumFractionDigits ?? 0;
  const max = decimalsOrOptions.maximumFractionDigits ?? 2;
  return num.toLocaleString(tag, {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
}

/**
 * Stok / reçete / hareket miktarı — her zaman 2 ondalık.
 */
export function formatQuantity(value: number | string): string {
  return formatNumber(value, 2);
}

/**
 * Birim tanımı çarpanı (StockUnit.multiplier) — 3 ondalık.
 */
export function formatUnitMultiplier(value: number | string): string {
  return formatNumber(value, 3);
}

/**
 * Miktar + birim gösterimi: küçük değerlerde büyük birimden küçük birime otomatik dönüşüm.
 *
 * Kural: değerin mutlak değeri 1'den küçükse ve birim bir üst birimse küçük birime çevrilir.
 *   - kg < 1  → gram (g) gösterimi  (örn: 0,003 kg → 3 g)
 *   - Lt < 1  → mililitre (ml) gösterimi  (örn: 0,010 Lt → 10 ml)
 *
 * İşaret (+/-) çağıran tarafça eklenmeli; bu fonksiyon mutlak değer üzerinde çalışır.
 *
 * @param value   Gösterilecek miktar (mutlak değer veya işaretli)
 * @param unit    Stok kaleminin birimi (StockUnit.short_name)
 * @returns       Biçimlendirilmiş "miktar birim" dizisi, örn: "3 g", "2,99 kg", "10 ml"
 */
const QUANTITY_UNIT_CONVERSIONS: Record<string, { smallerUnit: string; factor: number }> = {
  kg: { smallerUnit: 'g', factor: 1000 },
  Lt: { smallerUnit: 'ml', factor: 1000 },
};

export function formatQuantityWithUnit(value: number | string, unit: string): string {
  const num =
    typeof value === 'number'
      ? value
      : Number(String(value).trim().replace(/\s/g, '').replace(',', '.'));

  if (!Number.isFinite(num)) return `${value} ${unit ?? ''}`.trim();

  const absNum = Math.abs(num);
  const conv = QUANTITY_UNIT_CONVERSIONS[unit];

  if (conv && absNum > 0 && absNum < 1) {
    const converted = absNum * conv.factor;
    const formatted = formatNumber(converted, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    });
    return `${formatted} ${conv.smallerUnit}`;
  }

  return `${formatNumber(absNum, 2)} ${unit ?? ''}`.trim();
}

/**
 * Formats a date string into a localized short or long format.
 * @param locale  Opsiyonel locale. Varsayılan: "tr".
 */
export const formatDate = (
  date: string | Date,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' },
  locale?: string
): string => {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString(resolveLocaleTag(locale), options);
  } catch {
    return 'Geçersiz Tarih';
  }
};

// ---------------------------------------------------------------------------
// Convenience hook: client bileşenlerinde locale-aware formatlama
// ---------------------------------------------------------------------------

/**
 * Aktif locale'e göre bağlı formatlay ıcılar döner (client component'lar için).
 * Kullanım: const { formatCurrency, formatDate } = useLocalizedFormatters();
 */
export function useLocalizedFormatters() {
  const locale = useLocale();

  return {
    formatCurrency: (v: number | string) => formatCurrency(v, locale),
    formatNumber: (v: number | string, dec?: number | FormatNumberOptions) =>
      formatNumber(v, dec, locale),
    formatQuantity: (v: number | string) => formatNumber(v, 2, locale),
    formatDate: (d: string | Date, opts?: Intl.DateTimeFormatOptions) =>
      formatDate(d, opts, locale),
  };
}
