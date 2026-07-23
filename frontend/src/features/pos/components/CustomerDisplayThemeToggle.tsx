"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type CustomerDisplayTheme = "dark" | "light";

export const CUSTOMER_DISPLAY_THEME_KEY = "customer-display-theme";

interface Props {
  theme: CustomerDisplayTheme;
  onThemeChange: (theme: CustomerDisplayTheme) => void;
}

/** CFD teması — sistem ThemeProvider'dan bağımsız; sağ üst sabit kontrol. */
export function CustomerDisplayThemeToggle({ theme, onThemeChange }: Props) {
  const t = useTranslations("pos.display");
  const isLight = theme === "light";

  return (
    <div
      className="fixed right-6 top-6 z-50 flex items-center gap-2.5 rounded-2xl border border-foreground/10 bg-card/90 px-3 py-2 shadow-lg"
      role="group"
      aria-label={t("themeToggleAria")}
    >
      <Moon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          !isLight ? "text-cfd-accent" : "text-muted-foreground"
        )}
        aria-hidden
      />
      <Switch
        size="default"
        checked={isLight}
        onCheckedChange={(checked) => onThemeChange(checked ? "light" : "dark")}
        aria-label={t("themeToggleAria")}
      />
      <Sun
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          isLight ? "text-cfd-accent" : "text-muted-foreground"
        )}
        aria-hidden
      />
    </div>
  );
}

export function readCustomerDisplayTheme(): CustomerDisplayTheme {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = localStorage.getItem(CUSTOMER_DISPLAY_THEME_KEY);
    return raw === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function persistCustomerDisplayTheme(theme: CustomerDisplayTheme): void {
  try {
    localStorage.setItem(CUSTOMER_DISPLAY_THEME_KEY, theme);
  } catch {
    /* ignore quota / private mode */
  }
}
