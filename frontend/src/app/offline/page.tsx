"use client";

import { useTranslations } from "next-intl";

export default function OfflinePage() {
  const t = useTranslations("common.offline");
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-ui-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        {t("description")}
      </p>
    </div>
  );
}
