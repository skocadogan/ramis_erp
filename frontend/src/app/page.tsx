import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ChefHat,
  LayoutDashboard,
  Package,
  Receipt,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { ThemeMenu } from "@/components/shell/ThemeMenu";

const FEATURE_ITEMS = [
  { icon: LayoutDashboard, title: "featurePosTitle" as const, text: "featurePosText" as const, color: "text-blue-600" },
  { icon: ChefHat, title: "featureKitchenTitle" as const, text: "featureKitchenText" as const, color: "text-indigo-600" },
  { icon: Receipt, title: "featureStockTitle" as const, text: "featureStockText" as const, color: "text-emerald-600" },
] as const;

const MODULE_LINKS = [
  { href: "/pos", label: "linkPosLabel" as const, sub: "linkPosSub" as const, icon: LayoutDashboard },
  { href: "/inventory", label: "linkInventoryLabel" as const, sub: "linkInventorySub" as const, icon: Package },
  { href: "/recipes", label: "linkRecipesLabel" as const, sub: "linkRecipesSub" as const, icon: ChefHat },
  { href: "/menu-management", label: "linkMenuLabel" as const, sub: "linkMenuSub" as const, icon: Receipt },
] as const;

export default async function Home() {
  const locale = await getLocale();
  const t = await getTranslations("auth.login");
  const tLand = await getTranslations("auth.landing");

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background selection:bg-primary/10">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ChefHat size={20} aria-hidden />
            </div>
            <span className="text-2xl font-bold tracking-tight text-foreground">
              Ramis
            </span>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-4">
            <LanguageSwitcher currentLocale={locale} variant="ghost" />
            <ThemeMenu />
            <div className="hidden h-4 w-px bg-border sm:block" />
            <Link
              href="/login"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              {t("submit")}
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 bg-background">
        <section className="relative overflow-hidden pt-16 pb-6 sm:pt-24 sm:pb-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center lg:text-start">
              <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
                {tLand("heroBefore")}{" "}
                <span className="text-primary">{tLand("heroHighlight")}</span>
                {tLand("heroAfter") ? <><br className="hidden lg:block" /> {tLand("heroAfter")}</> : null}
              </h1>
            </div>
          </div>

          <div className="absolute top-0 right-0 -z-10 translate-x-1/3 -translate-y-1/3 opacity-[0.03] dark:opacity-[0.05]">
            <ChefHat size={600} strokeWidth={0.5} />
          </div>
        </section>

        <section className="bg-muted/30 py-6 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-8 sm:grid-cols-3">
              {FEATURE_ITEMS.map(({ icon: Icon, title, text, color }) => (
                <div
                  key={title}
                  className="group relative flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border ${color}`}>
                    <Icon size={24} aria-hidden />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">
                      {tLand(title)}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {tLand(text)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-6 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                {tLand("modulesHeading")}
              </h2>
              <div className="h-px flex-1 border-t border-border mx-6 hidden sm:block" />
            </div>

            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:gap-6">
              {MODULE_LINKS.map(({ href, label, sub, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center transition-all hover:border-primary hover:bg-primary/5 active:scale-[0.98]"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted transition-colors group-hover:bg-primary/10 group-hover:text-primary text-muted-foreground">
                    <Icon size={20} aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground sm:text-base">
                      {tLand(label)}
                    </p>
                    <p className="text-2xs font-medium text-muted-foreground sm:text-xs">
                      {tLand(sub)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-card py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ChefHat size={14} />
              </div>
              <span className="text-sm font-bold tracking-tight">Ramis ERP</span>
            </div>
            <p className="text-xs text-muted-foreground sm:text-sub">
              © {new Date().getFullYear()} Ramis ERP. {tLand("heroBefore")} {tLand("heroHighlight")} {tLand("heroAfter")}.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
