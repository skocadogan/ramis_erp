"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, Monitor, Moon, Sun, Eye, SunMedium, Layers, Maximize, Minimize } from "lucide-react";
import { useTheme, type ThemePreference } from "@/components/shell/ThemeProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { cn } from "@/lib/utils";

function TriggerIcon({ preference }: { preference: ThemePreference }) {
  if (preference === "dark") return <Moon size={18} />;
  if (preference === "light") return <Sun size={18} />;
  if (preference === "high-contrast") return <Eye size={18} />;
  if (preference === "outdoor") return <SunMedium size={18} />;
  return <Monitor size={18} />;
}

export function ThemeMenu({ className }: { className?: string } = {}) {
  const t = useTranslations("common.theme");
  const { preference, setPreference, density, setDensity } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Hydration mismatch hatasını önlemek için mounted kontrolü
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground shadow-sm transition-all hover:border-primary/50 hover:bg-muted hover:text-foreground",
          className
        )}
        aria-label={t("triggerAriaLabel")}
        title={t("triggerTitle")}
      >
        {mounted ? <TriggerIcon preference={preference} /> : <div className="h-[18px] w-[18px]" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[13rem]">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-ui-semibold text-muted-foreground">
            {t("colorTheme")}
          </DropdownMenuLabel>
          <DropdownMenuItem
            className="gap-2"
            onClick={() => setPreference("light")}
          >
            <Sun size={16} className="text-amber-500" />
            <span>{t("light")}</span>
            {preference === "light" ? (
              <CheckIcon className="ml-auto size-4 text-primary" />
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onClick={() => setPreference("dark")}
          >
            <Moon size={16} className="text-indigo-400" />
            <span>{t("dark")}</span>
            {preference === "dark" ? (
              <CheckIcon className="ml-auto size-4 text-primary" />
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onClick={() => setPreference("high-contrast")}
          >
            <Eye size={16} className="text-red-500" />
            <span>{t("highContrast")}</span>
            {preference === "high-contrast" ? (
              <CheckIcon className="ml-auto size-4 text-primary" />
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onClick={() => setPreference("outdoor")}
          >
            <SunMedium size={16} className="text-orange-600" />
            <span>{t("outdoor")}</span>
            {preference === "outdoor" ? (
              <CheckIcon className="ml-auto size-4 text-primary" />
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onClick={() => setPreference("system")}
          >
            <Monitor size={16} className="text-muted-foreground" />
            <span>{t("system")}</span>
            {preference === "system" ? (
              <CheckIcon className="ml-auto size-4 text-primary" />
            ) : null}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-ui-semibold text-muted-foreground">
            {t("density")}
          </DropdownMenuLabel>
          <DropdownMenuItem
            className="gap-2"
            onClick={() => setDensity("compact")}
          >
            <Minimize size={16} className="text-muted-foreground" />
            <span>{t("densityCompact")}</span>
            {density === "compact" ? (
              <CheckIcon className="ml-auto size-4 text-primary" />
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onClick={() => setDensity("comfortable")}
          >
            <Layers size={16} className="text-muted-foreground" />
            <span>{t("densityComfortable")}</span>
            {density === "comfortable" ? (
              <CheckIcon className="ml-auto size-4 text-primary" />
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onClick={() => setDensity("spacious")}
          >
            <Maximize size={16} className="text-muted-foreground" />
            <span>{t("densitySpacious")}</span>
            {density === "spacious" ? (
              <CheckIcon className="ml-auto size-4 text-primary" />
            ) : null}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
