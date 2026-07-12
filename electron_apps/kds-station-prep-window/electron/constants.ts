import { app } from "electron";
import path from "path";

export const APP_NAME = "Ramis İstasyon Hazırlık";

export const SUPPORTED_LOCALES = ["tr", "en", "bg", "sq"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "tr";

export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

export function getServerDir(): string {
  if (!app.isPackaged) {
    return path.join(__dirname, "..", "..", "src");
  }
  return path.join(process.resourcesPath, "src");
}

export function getPublicDir(): string {
  return path.join(getServerDir(), "public");
}

/** Hazırlık kiosk ekranı route'u */
export const PREP_WINDOW_BASE_PATH = "/kds/prep-window";

export const SERVER_PORT = 0;

export const RESET_SETUP_CLI_FLAG = "--reset-setup";
