"use client";

import Link from "next/link";
import { memo } from "react";
import { Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type GateHomeButtonProps = {
  className?: string;
};

/** Vardiya / POS seçim kapı ekranlarında panele dönüş. */
export const GateHomeButton = memo(function GateHomeButton({ className }: GateHomeButtonProps) {
  const t = useTranslations("pos.header");
  return (
    <Link
      href="/panel"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-ui-semibold text-slate-700 shadow-sm transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:bg-slate-800",
        className
      )}
    >
      <Home className="h-4 w-4 shrink-0" aria-hidden />
      {t("home")}
    </Link>
  );
});
