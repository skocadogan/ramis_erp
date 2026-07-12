/**
 * i18n konfigürasyonu — desteklenen diller, varsayılan dil, RTL listesi.
 * Burayı değiştirerek yeni dil eklenebilir/çıkarılabilir.
 */

export const locales = ['tr', 'en', 'bg', 'sq'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'tr';

/** Sağdan sola yazılan diller */
/*export const rtlLocales: Locale[] = ['ar'];*/

/** Locale → görünen ad (dil seçici UI için) */
export const localeLabels: Record<Locale, string> = {
  tr: 'Türkçe',
  en: 'English',
  bg: 'Български',
  sq: 'Shqip',
};

/** Locale → bayrak emoji */
export const localeFlags: Record<Locale, string> = {
  tr: '🇹🇷',
  en: '🇬🇧',
  bg: '🇧🇬',
  sq: '🇦🇱',
};

/** Cookie adı */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** Cookie max-age: 1 yıl (saniye) */
export const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
