import { useCallback } from "react";
import { usePosStore } from "../store/usePosStore";
import tr from "./tr.json";
import en from "./en.json";
import bg from "./bg.json";
import sq from "./sq.json";

const translations: Record<string, Record<string, unknown>> = { tr, en, bg, sq };

export function useI18n() {
  const language = usePosStore((state) => state.language || "tr");

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const keys = key.split(".");
      let value: unknown = translations[language];

      for (const k of keys) {
        if (typeof value === "object" && value && k in value) {
          value = (value as Record<string, unknown>)[k];
        } else {
          return key;
        }
      }

      if (typeof value !== "string") return key;

      let result = value as string;
      if (params) {
        Object.keys(params).forEach((param) => {
          result = result.replace(`{${param}}`, String(params[param]));
        });
      }

      return result;
    },
    [language]
  );

  return { t, language };
}

export type UseI18n = ReturnType<typeof useI18n>;
