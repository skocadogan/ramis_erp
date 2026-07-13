"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSyncSessionState, subscribeSyncSession } from "./syncSession";

function useSyncSession() {
  return useSyncExternalStore(subscribeSyncSession, getSyncSessionState, () => getSyncSessionState());
}

export function SyncProgressDialog() {
  const t = useTranslations("pos.offlineQueue.syncProgress");
  const session = useSyncSession();

  if (!session.active) return null;

  const percent =
    session.total > 0 ? Math.round((session.completed / session.total) * 100) : 0;

  return (
    <Dialog
      open
      modal
      disablePointerDismissal
      onOpenChange={(_, eventDetails) => {
        eventDetails.cancel();
      }}
    >
      <DialogContent showCloseButton={false} className="max-w-md gap-4">
        <DialogHeader className="items-center text-center">
          <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/40">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400" />
          </div>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-slate-200 bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={t("title")}
          >
            <div
              className="h-full rounded-full bg-blue-600 transition-[width] duration-300 ease-out dark:bg-blue-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate pr-2">
              {session.currentLabel ?? t("processing")}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              {session.completed}/{session.total}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
