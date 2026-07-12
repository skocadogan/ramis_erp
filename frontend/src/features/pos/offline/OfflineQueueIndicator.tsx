"use client";

import { useState, useSyncExternalStore } from "react";
import { CloudOff, CloudUpload, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useOfflineQueueState } from "./useOfflineQueue";
import { ReconciliationDialog } from "./ReconciliationDialog";
import {
  getSyncSessionState,
  subscribeSyncSession,
  type SyncSessionState,
} from "./syncSession";

/** Subscribes to the sync session progress state. */
function useSyncSession(): SyncSessionState {
  return useSyncExternalStore(
    subscribeSyncSession,
    getSyncSessionState,
    getSyncSessionState
  );
}

type LabelBreakpoint = "sm" | "fullhd";

export function OfflineQueueIndicator({
  className,
  labelBreakpoint = "fullhd",
}: {
  className?: string;
  labelBreakpoint?: LabelBreakpoint;
}) {
  const t = useTranslations("pos.offlineQueue");
  const { enabled, counts, canSync } = useOfflineQueueState();
  const session = useSyncSession();
  const [open, setOpen] = useState(false);

  if (!enabled) return null;

  const actionCount = counts.pending + counts.failed + counts.conflict + counts.syncing;
  if (actionCount === 0 && canSync && !session.active) return null;

  const hasProblem = counts.failed > 0 || counts.conflict > 0;
  const isSyncing = counts.syncing > 0 || (counts.pending > 0 && canSync);

  const sessionPct = session.active && session.total > 0
    ? Math.round((session.completed / session.total) * 100)
    : 0;

  const title = hasProblem
    ? t("indicator.failed", { count: counts.failed + counts.conflict })
    : counts.pending > 0
      ? t("indicator.pending", { count: counts.pending })
      : t("indicator.offline");

  return (
    <>
      <div className="flex flex-col gap-0">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm font-ui-semibold shadow-sm transition-colors",
            hasProblem
              ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200",
            className
          )}
          title={title}
        >
          {isSyncing ? (
            <Loader2 size={16} className="shrink-0 animate-spin" />
          ) : hasProblem ? (
            <CloudOff size={16} className="shrink-0" />
          ) : (
            <CloudUpload size={16} className="shrink-0" />
          )}
          {actionCount > 0 ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-xs font-ui-bold text-white">
              {actionCount}
            </span>
          ) : null}
          <span className={cn(labelBreakpoint === "fullhd" ? "hidden fullhd:inline" : "hidden sm:inline")}>
            {title}
          </span>
        </button>

        {session.active && (
          <div className="w-full rounded-full bg-muted/50 h-1.5 overflow-hidden -mt-px">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300 ease-out",
                hasProblem ? "bg-amber-500" : "bg-blue-500"
              )}
              style={{ width: session.total > 0 ? `${sessionPct}%` : "0%" }}
              role="progressbar"
              aria-valuenow={sessionPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("indicator.syncing")}
            />
          </div>
        )}
      </div>

      <ReconciliationDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
