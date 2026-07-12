import { app } from "electron";
import path from "path";

/** Uygulama adı */
export const APP_NAME = "Ramis POS";

/** Desteklenen diller (frontend next-intl ile aynı) */
export const SUPPORTED_LOCALES = ["tr", "en", "bg", "sq"] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];
export const DEFAULT_LOCALE: SupportedLocale = "tr";

/** next-intl tarafından kullanılan çerez adı */
export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

/** Next.js standalone sunucu dizini */
export function getServerDir(): string {
  if (!app.isPackaged) {
    return path.join(__dirname, "..", "..", "src");
  }
  return path.join(process.resourcesPath, "src");
}

/** Public dosyalarının yolu */
export function getPublicDir(): string {
  return path.join(getServerDir(), "public");
}

/** POS giriş URL'si */
export const POS_BASE_PATH = "/pos";

/** POS Electron girişi için zorunlu RBAC izni */
export const POS_REQUIRED_PERMISSION = "pos.view_pos";

/** POS için varsayılan port (0 = rastgele boş port) */
export const SERVER_PORT = 0;
