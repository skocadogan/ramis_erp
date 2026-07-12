import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from "./constants";

export const PERMISSION_DENIED_MESSAGES: Record<SupportedLocale, string> = {
  tr: "KDS uygulaması için kullanıcının izinleri yeterli değil.",
  en: "This user does not have sufficient permissions for the KDS application.",
  bg: "Потребителят няма достатъчни права за KDS приложението.",
  sq: "Ky përdorues nuk ka leje të mjaftueshme për aplikacionin KDS.",
};

export function resolveLocale(locale?: string): SupportedLocale {
  if (locale && (SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
    return locale as SupportedLocale;
  }
  return DEFAULT_LOCALE;
}

export function permissionDeniedMessage(locale?: string): string {
  return PERMISSION_DENIED_MESSAGES[resolveLocale(locale)];
}
