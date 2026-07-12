// ============================================================
// Stock Man — i18n
//
// 4 languages (TR, EN, BG, SQ) with `useI18n()` React hook
// and `tSync()` helper for use outside React.
//
// Translation source-of-truth: `tr.json`. All other locale
// files must mirror the same key tree.
//
// Persistence: the active language lives in `useUIStore`
// (SecureStore-backed) and is hydrated at app boot.
// ============================================================

import { useUIStore } from "@/store/useUIStore";
import tr from "./tr.json";
import en from "./en.json";
import bg from "./bg.json";
import sq from "./sq.json";

import type { Language } from "./types";
export type { Language };

export const SUPPORTED_LANGUAGES: Language[] = ["tr", "en", "bg", "sq"];

export const LANGUAGE_LABELS: Record<Language, string> = {
  tr: "Türkçe",
  en: "English",
  bg: "Български",
  sq: "Shqip",
};

/** Native locale hints used by Intl.NumberFormat / Intl.DateTimeFormat. */
export const LANGUAGE_LOCALES: Record<Language, string> = {
  tr: "tr-TR",
  en: "en-US",
  bg: "bg-BG",
  sq: "sq-AL",
};

const dictionaries: Record<Language, Record<string, any>> = { tr, en, bg, sq };

/** React hook for translation. Subscribes to `useUIStore.language`. */
export function useI18n() {
  const language = useUIStore((s) => s.language) as Language;

  const t = (key: string, params?: Record<string, string | number>): string => {
    return tSync(key, language, params);
  };

  return {
    t,
    language,
    setLanguage: (l: Language) => {
      void useUIStore.getState().setLanguage(l);
    },
  };
}

/**
 * Synchronous translation lookup. Use this in non-React code
 * (Zustand store actions, native modules, etc.) where the
 * current language is known explicitly.
 */
export function tSync(
  key: string,
  language: Language,
  params?: Record<string, string | number>
): string {
  const dict = dictionaries[language] || dictionaries.tr;
  const keys = key.split(".");
  let value: any = dict;
  for (const k of keys) {
    if (value && typeof value === "object" && k in value) {
      value = value[k];
    } else {
      return key; // missing key — return the key so it's visible
    }
  }
  if (typeof value !== "string") return key;
  if (!params) return value;
  return Object.entries(params).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
    value
  );
}
