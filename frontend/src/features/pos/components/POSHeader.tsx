"use client";

import React, { lazy, Suspense, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useAuthStore } from "@/store/useAuthStore";
import { usePosStore } from "@/store/usePosStore";
import { useShallow } from "zustand/react/shallow";
import { usePosBranches } from "@/features/pos/hooks/usePosBranches";
import {
  Utensils,
  Settings,
  LogOut,
  ArrowRightLeft,
  Home,
  ChefHat,
  ClipboardList,
  Users,
  MoreHorizontal,
  Monitor,
  Sun,
  Moon,
  Eye,
  SunMedium,
  CheckIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PosShiftClose } from "@/features/pos/components/PosShiftClose";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PERMISSION_POS_MANAGE_CONNECTIONS, hasKdsShortcutAccess } from "@/lib/constants";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBackendHealth } from "@/components/shell/BackendHealthProvider";
import { useTheme } from "@/components/shell/ThemeProvider";
import { locales, localeFlags, localeLabels, type Locale } from "@/i18n/config";
import type { PosTerminalSwitchRow } from "@/features/pos/components/PosTerminalSwitchDialog";
import { PrinterStatusIndicator } from "./PrinterStatusIndicator";
import { OfflineQueueIndicator } from "@/features/pos/offline/OfflineQueueIndicator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import BranchSelector from "./POSHeader/BranchSelector";
import NotificationButtons from "./POSHeader/NotificationButtons";

const PosTerminalSwitchDialog = lazy(() =>
  import("@/features/pos/components/PosTerminalSwitchDialog").then((m) => ({
    default: m.PosTerminalSwitchDialog,
  }))
);
const PosSettingsDialog = lazy(() =>
  import("@/features/pos/components/PosSettingsDialog").then((m) => ({
    default: m.PosSettingsDialog,
  }))
);
const ProductionStatusModal = lazy(() =>
  import("@/features/production-planning/components/ProductionStatusModal").then((m) => ({
    default: m.ProductionStatusModal,
  }))
);
const ConnectedUsersModal = lazy(() =>
  import("./ConnectedUsersModal").then((m) => ({
    default: m.ConnectedUsersModal,
  }))
);

function setNextLocaleCookie(locale: string) {
  const maxAge = 365 * 24 * 60 * 60;
  document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=${maxAge};SameSite=Lax`;
}

const POSHeader = React.memo(function POSHeader({
  variant = "pos",
  kitchenBadgeCount = 0,
  waiterCallBadgeCount = 0,
  onKitchenToggle,
  onWaiterCallToggle,
}: {
  variant?: "pos" | "waiter";
  kitchenBadgeCount?: number;
  waiterCallBadgeCount?: number;
  onKitchenToggle?: () => void;
  onWaiterCallToggle?: () => void;
} = {}) {
  const t = useTranslations("pos.header");
  const themeT = useTranslations("common.theme");
  const locale = useLocale();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const router = useRouter();
  const { data: branches = [] } = usePosBranches();
  const { activeBranchId, setActiveBranchId, posTerminalUuid } = usePosStore(useShallow((state) => ({
    activeBranchId: state.activeBranchId,
    setActiveBranchId: state.setActiveBranchId,
    posTerminalUuid: state.posTerminalUuid,
  })));

  const { status: backendStatus, recheck: recheckBackend } = useBackendHealth();
  const { preference: themePreference, setPreference, density, setDensity } = useTheme();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTerminalSwitchOpen, setIsTerminalSwitchOpen] = useState(false);
  const [isProductionStatusOpen, setIsProductionStatusOpen] = useState(false);
  const [isConnectedUsersOpen, setIsConnectedUsersOpen] = useState(false);

  const switchLocale = (loc: Locale) => {
    setNextLocaleCookie(loc);
    api.patch("/api/v1/users/me/", { preferred_language: loc }).catch(() => {});
    window.location.reload();
  };

  const bidHeader = activeBranchId || user?.branch_id || "";
  const { data: headerTerminals = [] } = useQuery({
    queryKey: ["pos-terminals", bidHeader],
    queryFn: async () => {
      const { data } = await api.get<unknown>("/pos-display/terminals/", {
        params: { branch_id: bidHeader },
      });
      if (Array.isArray(data)) return data as PosTerminalSwitchRow[];
      const d = data as { results?: PosTerminalSwitchRow[] };
      return d.results ?? [];
    },
    select: (data) => data.filter((t) => t.is_active),
    enabled: Boolean(bidHeader && user),
    staleTime: isTerminalSwitchOpen ? 0 : 25_000,
    refetchOnWindowFocus: true,
    refetchInterval: isTerminalSwitchOpen ? 6_000 : false,
  });
  const { canManage } = useModulePermissions();
  const canShowKdsHeaderLink = hasKdsShortcutAccess(user?.permissions, user?.is_superuser);
  /** `pos.manage_connections` — store’daki `permissions` AuthGuard üzerinden /auth/me/ ile güncellenir */
  const canOpenConnectedUsers = canManage(PERMISSION_POS_MANAGE_CONNECTIONS);

  const currentTerminal = headerTerminals.find((term) => term.id === posTerminalUuid);

  const terminalBlock = currentTerminal ? (
    <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5">
      <div className="h-2 w-2 rounded-full bg-primary" />
      <span className="text-xs font-bold text-primary uppercase tracking-tight">
        {currentTerminal.name}
      </span>
    </div>
  ) : null;

  const branchList = user?.is_superuser ? branches : (user?.available_branches || []);
  const selId = activeBranchId || user?.branch_id || "";
  const noBranchLabel = t("noBranch");

  const branchBlock = (
    <BranchSelector
      branches={branches}
      userBranches={branchList}
      selectedBranchId={selId}
      userBranchName={user?.branch_name}
      isSuperuser={!!user?.is_superuser}
      variant={variant}
      terminalBlock={terminalBlock}
      onSelect={setActiveBranchId}
      label={noBranchLabel}
    />
  );

  return (
    <>
      <header
        className={cn(
          "z-10 shrink-0 border-b border-border bg-background shadow-sm",
          variant === "waiter"
            ? "flex flex-col gap-2.5 px-3 py-2.5 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:px-6 lg:py-0"
            : "flex min-h-14 items-center justify-between gap-x-4 gap-y-3 px-4 py-3 sm:min-h-16 sm:px-6 lg:gap-6"
        )}
      >
        {variant === "waiter" ? (
          <>
            <div className="flex w-full min-w-0 items-center gap-1 lg:min-w-0 lg:flex-1 lg:gap-4">
              <Link href="/panel" className="flex min-w-0 shrink-0 items-center gap-2 transition-opacity hover:opacity-80">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                  <Utensils size={18} />
                </div>
                <h1 className="hidden truncate text-base font-bold tracking-tight text-foreground sm:text-lg md:block lg:text-xl">
                  {t("waiter")}
                </h1>
              </Link>
              <div className="hidden min-w-0 flex-1 lg:block">{branchBlock}</div>
              <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
                <PosShiftClose />
                <OfflineQueueIndicator labelBreakpoint="sm" />

                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary sm:h-10 sm:w-10"
                    aria-label={t("moreActions")}
                    title={t("moreActions")}
                  >
                    <MoreHorizontal size={18} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={8} className="w-56 bg-popover text-popover-foreground">
                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); recheckBackend(); }} className="gap-2 cursor-pointer">
                      <Monitor size={16} className={cn(
                        "shrink-0",
                        backendStatus === "ok" && "text-emerald-500",
                        backendStatus === "down" && "text-red-500",
                        backendStatus === "checking" && "text-muted-foreground/60"
                      )} />
                      <span className="flex-1">{t("healthStatus")}</span>
                      <span className={cn(
                        "text-xs font-semibold",
                        backendStatus === "down" && "text-red-500",
                        backendStatus === "checking" && "text-muted-foreground",
                        backendStatus === "ok" && "text-emerald-600"
                      )}>
                        {backendStatus === "ok" ? "OK" : backendStatus === "down" ? "DOWN" : "..."}
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2">
                        {themePreference === "dark" ? <Moon size={16} className="shrink-0" />
                          : themePreference === "light" ? <Sun size={16} className="shrink-0 text-amber-500" />
                          : themePreference === "high-contrast" ? <Eye size={16} className="shrink-0 text-red-500" />
                          : themePreference === "outdoor" ? <SunMedium size={16} className="shrink-0 text-orange-600" />
                          : <Monitor size={16} className="shrink-0 text-muted-foreground" />}
                        <span>{t("theme")}</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="min-w-[13rem]">
                        <DropdownMenuItem onClick={() => setPreference("light")} className="gap-2">
                          <Sun size={16} className="text-amber-500" />
                          <span>{themeT("light")}</span>
                          {themePreference === "light" && <CheckIcon className="ml-auto size-4 text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setPreference("dark")} className="gap-2">
                          <Moon size={16} className="text-indigo-400" />
                          <span>{themeT("dark")}</span>
                          {themePreference === "dark" && <CheckIcon className="ml-auto size-4 text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setPreference("high-contrast")} className="gap-2">
                          <Eye size={16} className="text-red-500" />
                          <span>{themeT("highContrast")}</span>
                          {themePreference === "high-contrast" && <CheckIcon className="ml-auto size-4 text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setPreference("outdoor")} className="gap-2">
                          <SunMedium size={16} className="text-orange-600" />
                          <span>{themeT("outdoor")}</span>
                          {themePreference === "outdoor" && <CheckIcon className="ml-auto size-4 text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setPreference("system")} className="gap-2">
                          <Monitor size={16} className="text-muted-foreground" />
                          <span>{themeT("system")}</span>
                          {themePreference === "system" && <CheckIcon className="ml-auto size-4 text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setDensity("compact")} className="gap-2">
                          <span className="text-muted-foreground text-xs">▬</span>
                          <span>{themeT("densityCompact")}</span>
                          {density === "compact" && <CheckIcon className="ml-auto size-4 text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDensity("comfortable")} className="gap-2">
                          <span className="text-muted-foreground text-xs">▬▬</span>
                          <span>{themeT("densityComfortable")}</span>
                          {density === "comfortable" && <CheckIcon className="ml-auto size-4 text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDensity("spacious")} className="gap-2">
                          <span className="text-muted-foreground text-xs">▬▬▬</span>
                          <span>{themeT("densitySpacious")}</span>
                          {density === "spacious" && <CheckIcon className="ml-auto size-4 text-primary" />}
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2">
                        <span className="text-base shrink-0">{localeFlags[locale as Locale]}</span>
                        <span>{localeLabels[locale as Locale]}</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="min-w-[160px]">
                        {locales.map((loc) => (
                          <DropdownMenuItem
                            key={loc}
                            onClick={() => switchLocale(loc)}
                            className="gap-2 cursor-pointer"
                          >
                            <span>{localeFlags[loc]}</span>
                            <span>{localeLabels[loc]}</span>
                            {loc === locale && <CheckIcon className="ml-auto size-4 text-primary" />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setIsProductionStatusOpen(true)} className="gap-2 cursor-pointer">
                      <ClipboardList size={16} />
                      <span>{t("productionStatus")}</span>
                    </DropdownMenuItem>
                    {posTerminalUuid && canOpenConnectedUsers && (
                      <DropdownMenuItem onClick={() => setIsConnectedUsersOpen(true)} className="gap-2 cursor-pointer">
                        <Users size={16} />
                        <span>{t("connectedDevices")}</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setIsSettingsOpen(true)} className="gap-2 cursor-pointer">
                      <Settings size={16} />
                      <span>{t("settings")}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <button
                  onClick={async () => {
                    try {
                      const { default: axios } = await import('axios');
                      const { getRuntimeConfig } = await import('@/lib/runtimeConfig');
                      await axios.post(getRuntimeConfig().apiBaseUrl + "/auth/logout/", {}, { withCredentials: true });
                    } catch { }
                    logout();
                    router.push("/");
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive sm:h-10 sm:w-auto sm:gap-2 sm:px-3"
                  title={t("logout")}
                >
                  <LogOut size={16} />
                  <span className="hidden lg:inline text-sm font-medium">{t("logout")}</span>
                </button>
              </div>
            </div>
            <div className="w-full border-t border-border pt-2.5 lg:hidden">
              {branchBlock}
            </div>
          </>
        ) : (
          <>
            <div className="scrollbar-thin flex min-w-0 flex-1 flex-nowrap items-center gap-x-3 overflow-x-auto pb-1 sm:gap-x-6 sm:pb-0 lg:overflow-visible">
              <Link href="/panel" className="flex min-w-0 shrink-0 items-center gap-2 transition-opacity hover:opacity-80">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Utensils size={18} />
                </div>
                <h1 className="truncate text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  {t("pos")}
                </h1>
              </Link>
              <div className="hidden h-6 w-px shrink-0 bg-border md:block" />
              <div className="min-w-0 max-w-[min(100%,12rem)] shrink sm:max-w-[min(100%,16rem)] md:max-w-[min(100%,20rem)] lg:max-w-[min(100%,24rem)]">
                {branchBlock}
              </div>
              {canShowKdsHeaderLink && (
                <>
                    <div className="hidden h-6 w-px shrink-0 bg-border lg:block" aria-hidden />
                  <nav className="relative z-10 hidden shrink-0 items-center gap-2 lg:flex xl:pl-2">
                      <Link
                      href="/panel"
                      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-primary fullhd:px-3"
                      title={t("home")}
                    >
                      <Home size={18} className="shrink-0 text-muted-foreground/60 fullhd:hidden" aria-hidden />
                      <span className="sr-only fullhd:hidden">{t("home")}</span>
                      <span className="hidden fullhd:inline">{t("home")}</span>
                    </Link>
                    <Link
                      href="/kds"
                      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-primary fullhd:px-3"
                      title={t("kitchen")}
                    >
                      <ChefHat size={18} className="shrink-0 text-muted-foreground/60 fullhd:hidden" aria-hidden />
                      <span className="sr-only fullhd:hidden">{t("kitchen")}</span>
                      <span className="hidden fullhd:inline">{t("kitchen")}</span>
                    </Link>
                  </nav>
                </>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
              {variant === "pos" && headerTerminals.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setIsTerminalSwitchOpen(true)}
                  className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-2 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary/20"
                  title={currentTerminal ? t("switchTerminalTitle") : t("switchTerminal")}
                >
                  <ArrowRightLeft size={16} className="text-primary" />
                  {currentTerminal ? (
                    <span className="flex items-center gap-1.5">
                      <span className="hidden sm:inline">{currentTerminal.name}</span>
                      <span className="sm:hidden">{t("switchTerminal")}</span>
                    </span>
                  ) : (
                    <span>{t("switchTerminal")}</span>
                  )}
                </button>
              ) : null}
              <PosShiftClose labelBreakpoint="fullhd" />
              <OfflineQueueIndicator labelBreakpoint="fullhd" />
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                  aria-label={t("moreActions")}
                  title={t("moreActions")}
                >
                  <MoreHorizontal size={20} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="w-56 bg-popover text-popover-foreground">
                  <div className="px-2 py-1.5">
                    <PrinterStatusIndicator branchId={bidHeader} />
                  </div>
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); recheckBackend(); }} className="gap-2 cursor-pointer">
                    <Monitor size={16} className={cn(
                      "shrink-0",
                      backendStatus === "ok" && "text-emerald-500",
                      backendStatus === "down" && "text-red-500",
                      backendStatus === "checking" && "text-muted-foreground/60"
                    )} />
                    <span className="flex-1">{t("healthStatus")}</span>
                    <span className={cn(
                      "text-xs font-semibold",
                      backendStatus === "down" && "text-red-500",
                      backendStatus === "checking" && "text-muted-foreground",
                      backendStatus === "ok" && "text-emerald-600"
                    )}>
                      {backendStatus === "ok" ? "OK" : backendStatus === "down" ? "DOWN" : "..."}
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2">
                      {themePreference === "dark" ? <Moon size={16} className="shrink-0" />
                        : themePreference === "light" ? <Sun size={16} className="shrink-0 text-amber-500" />
                        : themePreference === "high-contrast" ? <Eye size={16} className="shrink-0 text-red-500" />
                        : themePreference === "outdoor" ? <SunMedium size={16} className="shrink-0 text-orange-600" />
                        : <Monitor size={16} className="shrink-0 text-muted-foreground" />}
                      <span>{t("theme")}</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="min-w-[13rem]">
                      <DropdownMenuItem onClick={() => setPreference("light")} className="gap-2">
                        <Sun size={16} className="text-amber-500" />
                        <span>{themeT("light")}</span>
                        {themePreference === "light" && <CheckIcon className="ml-auto size-4 text-primary" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setPreference("dark")} className="gap-2">
                        <Moon size={16} className="text-indigo-400" />
                        <span>{themeT("dark")}</span>
                        {themePreference === "dark" && <CheckIcon className="ml-auto size-4 text-primary" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setPreference("high-contrast")} className="gap-2">
                        <Eye size={16} className="text-red-500" />
                        <span>{themeT("highContrast")}</span>
                        {themePreference === "high-contrast" && <CheckIcon className="ml-auto size-4 text-primary" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setPreference("outdoor")} className="gap-2">
                        <SunMedium size={16} className="text-orange-600" />
                        <span>{themeT("outdoor")}</span>
                        {themePreference === "outdoor" && <CheckIcon className="ml-auto size-4 text-primary" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setPreference("system")} className="gap-2">
                        <Monitor size={16} className="text-muted-foreground" />
                        <span>{themeT("system")}</span>
                        {themePreference === "system" && <CheckIcon className="ml-auto size-4 text-primary" />}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setDensity("compact")} className="gap-2">
                        <span className="text-muted-foreground text-xs">▬</span>
                        <span>{themeT("densityCompact")}</span>
                        {density === "compact" && <CheckIcon className="ml-auto size-4 text-primary" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDensity("comfortable")} className="gap-2">
                        <span className="text-muted-foreground text-xs">▬▬</span>
                        <span>{themeT("densityComfortable")}</span>
                        {density === "comfortable" && <CheckIcon className="ml-auto size-4 text-primary" />}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDensity("spacious")} className="gap-2">
                        <span className="text-muted-foreground text-xs">▬▬▬</span>
                        <span>{themeT("densitySpacious")}</span>
                        {density === "spacious" && <CheckIcon className="ml-auto size-4 text-primary" />}
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2">
                      <span className="text-base shrink-0">{localeFlags[locale as Locale]}</span>
                      <span>{localeLabels[locale as Locale]}</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="min-w-[160px]">
                      {locales.map((loc) => (
                        <DropdownMenuItem
                          key={loc}
                          onClick={() => switchLocale(loc)}
                          className="gap-2 cursor-pointer"
                        >
                          <span>{localeFlags[loc]}</span>
                          <span>{localeLabels[loc]}</span>
                          {loc === locale && <CheckIcon className="ml-auto size-4 text-primary" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setIsProductionStatusOpen(true)} className="gap-2 cursor-pointer">
                    <ClipboardList size={16} />
                    <span>{t("productionStatus")}</span>
                  </DropdownMenuItem>
                  {canOpenConnectedUsers && posTerminalUuid && (
                    <DropdownMenuItem onClick={() => setIsConnectedUsersOpen(true)} className="gap-2 cursor-pointer">
                      <Users size={16} />
                      <span>{t("connectedDevices")}</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setIsSettingsOpen(true)} className="gap-2 cursor-pointer">
                    <Settings size={16} />
                    <span>{t("settings")}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {variant === "pos" && (
                <NotificationButtons
                  kitchenBadgeCount={kitchenBadgeCount}
                  waiterCallBadgeCount={waiterCallBadgeCount}
                  onKitchenToggle={onKitchenToggle}
                  onWaiterCallToggle={onWaiterCallToggle}
                />
              )}

              <div
                className="flex items-center gap-2 rounded-full border border-border bg-muted px-2 py-1.5 fullhd:gap-3 fullhd:px-4"
                title={user?.username || t("staff")}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  {user?.username ? user.username.charAt(0).toUpperCase() : "P"}
                </div>
                <span className="hidden max-w-[10rem] truncate text-sm font-semibold text-foreground fullhd:inline">{user?.username || t("staff")}</span>
              </div>

              <button
                onClick={async () => {
                  try {
                    const { default: axios } = await import('axios');
                    const { getRuntimeConfig } = await import('@/lib/runtimeConfig');
                    await axios.post(getRuntimeConfig().apiBaseUrl + "/auth/logout/", {}, { withCredentials: true });
                  } catch { }
                  logout();
                  router.push("/");
                }}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive fullhd:px-4"
                title={t("logout")}
              >
                <LogOut size={16} />
                <span className="hidden fullhd:inline">{t("logout")}</span>
              </button>
            </div>
          </>
        )}
      </header>

      {isTerminalSwitchOpen && (
        <Suspense fallback={null}>
          <PosTerminalSwitchDialog
            open={isTerminalSwitchOpen}
            onOpenChange={setIsTerminalSwitchOpen}
            terminals={headerTerminals}
            currentTerminalUuid={posTerminalUuid}
          />
        </Suspense>
      )}

      {isSettingsOpen ? (
        <Suspense fallback={null}>
          <PosSettingsDialog
            open={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
            branchId={bidHeader}
            terminals={headerTerminals}
            variant={variant}
          />
        </Suspense>
      ) : null}

      {isProductionStatusOpen && (
        <Suspense fallback={null}>
          <ProductionStatusModal
            isOpen={isProductionStatusOpen}
            onClose={() => setIsProductionStatusOpen(false)}
            branchId={bidHeader}
          />
        </Suspense>
      )}

      {isConnectedUsersOpen && posTerminalUuid && canOpenConnectedUsers && (
        <Suspense fallback={null}>
          <ConnectedUsersModal
            isOpen={isConnectedUsersOpen}
            onClose={() => setIsConnectedUsersOpen(false)}
            terminalId={posTerminalUuid}
          />
        </Suspense>
      )}
    </>
  );
});

export { POSHeader };
