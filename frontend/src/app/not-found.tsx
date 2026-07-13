import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, SearchX } from "lucide-react";

export default async function NotFound() {
  const t = await getTranslations("common.notFound");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center bg-card">
      <div className="relative mb-8 rounded-full bg-blue-100 p-6 shadow-sm dark:bg-blue-900/20">
        <SearchX
          size={84}
          className="text-blue-600 dark:text-blue-500"
          strokeWidth={1.5}
        />
        <div className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-sm font-bold text-rose-600 shadow-md ring-4 ring-slate-50 dark:bg-rose-900/30 dark:text-rose-500 dark:ring-slate-950">
          404
        </div>
      </div>

      <h1 className="mb-3 text-4xl font-bold tracking-tight text-slate-900 md:text-5xl dark:text-white">
        {t("title")}
      </h1>

      <p className="max-w-md text-base leading-relaxed text-muted-foreground">
        {t("description")}
      </p>

      <div className="mt-10 flex flex-col gap-4 sm:flex-row">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 rounded-xl border border-border px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 border-border bg-card text-foreground dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <ArrowLeft size={18} />
          {t("goBack")}
        </Link>

        <Link
          href="/"
          className="flex items-center justify-center rounded-xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          {t("goHome")}
        </Link>
      </div>
    </div>
  );
}
