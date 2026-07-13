"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Monitor, RefreshCw } from "lucide-react";
import { checkBackendHealth } from "@/lib/healthCheck";
import { publishBackendHealthStatus } from "@/features/pos/offline/healthSnapshot";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type BackendHealthStatus = "checking" | "ok" | "down";

const POLL_MS = 120_000;

function isBrowserOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

type BackendHealthContextValue = {
  status: BackendHealthStatus;
  recheck: () => void;
};

const BackendHealthContext = createContext<BackendHealthContextValue | null>(null);

export function BackendHealthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BackendHealthStatus>("checking");
  const mounted = useRef(true);

  const runCheck = useCallback(async () => {
    if (!isBrowserOnline()) {
      if (!mounted.current) return;
      setStatus("down");
      return;
    }
    const ok = await checkBackendHealth();
    if (!mounted.current) return;
    setStatus(ok ? "ok" : "down");
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!isBrowserOnline()) {
      setStatus("down");
    } else {
      void runCheck();
    }
    const id = setInterval(() => void runCheck(), POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void runCheck();
    };
    const onOnline = () => void runCheck();
    const onOffline = () => {
      if (!mounted.current) return;
      setStatus("down");
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      mounted.current = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [runCheck]);

  const recheck = useCallback(() => {
    setStatus("checking");
    void runCheck();
  }, [runCheck]);

  useEffect(() => {
    publishBackendHealthStatus(status);
  }, [status]);

  // Context value her render'da yeni bir obje olmamalı — aksi halde useBackendHealth()
  // kullanan tüm bileşenler gereksiz re-render olur. status ve recheck değişmediği sürece
  // aynı referansı paylaşır.
  const value = useMemo<BackendHealthContextValue>(
    () => ({ status, recheck }),
    [status, recheck]
  );

  return (
    <BackendHealthContext.Provider value={value}>
      {children}
    </BackendHealthContext.Provider>
  );
}

export function useBackendHealth(): BackendHealthContextValue {
  const ctx = useContext(BackendHealthContext);
  if (!ctx) {
    throw new Error("useBackendHealth: BackendHealthProvider ile sarılmalı (providers.tsx).");
  }
  return ctx;
}

/** Tema düğmesinin yanında: yeşil = /api/v1/health/ ok, kırmızı = yanıt yok. Tıklanınca yeniden kontrol. */
export function BackendHealthIndicator({ className }: { className?: string }) {
  const t = useTranslations("common.backendHealth");
  const { status, recheck } = useBackendHealth();
  const label =
    status === "ok"
      ? t("statusOk")
      : status === "down"
        ? t("statusDown")
        : t("statusChecking");

  return (
    <button
      type="button"
      onClick={() => recheck()}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
        className
      )}
    >
      <Monitor
        strokeWidth={2}
        className={cn(
          "size-4 transition-[color,filter]",
          status === "ok" && "text-emerald-500 [filter:drop-shadow(0_0_5px_rgba(34,197,94,0.55))]",
          status === "down" && "text-red-500 [filter:drop-shadow(0_0_5px_rgba(239,68,68,0.5))]",
          status === "checking" && "text-muted-foreground/60"
        )}
      />
    </button>
  );
}

/** Sunucu kapalıyken tam genişlik uyarı şeridi */
export function BackendHealthBanner({ className }: { className?: string }) {
  const t = useTranslations("common.backendHealth");
  const { status, recheck } = useBackendHealth();
  if (status !== "down") return null;

  return (
    <div
      role="alert"
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-center gap-2 border-b border-red-800/80 bg-red-600 px-3 py-2 text-center text-xs font-medium text-white sm:text-sm sm:gap-3",
        className
      )}
    >
      <span className="min-w-0 flex-1 sm:flex-none">{t("banner")}</span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-7 shrink-0 gap-1 bg-white/90 text-xs text-red-700 hover:bg-white"
        onClick={() => recheck()}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {t("retry")}
      </Button>
    </div>
  );
}
