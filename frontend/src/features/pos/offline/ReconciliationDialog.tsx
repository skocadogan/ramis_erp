"use client";

import { useCallback, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslations } from "next-intl";
import { RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { discardQueueOperation, flushOfflineQueue, retryQueueOperation } from "./queueService";
import { useOfflineQueueState } from "./useOfflineQueue";
import type { QueuedOperation } from "./types";

const ROW_ESTIMATE_PX = 72;

function statusLabel(
  t: ReturnType<typeof useTranslations<"pos.offlineQueue">>,
  status: QueuedOperation["status"]
) {
  switch (status) {
    case "pending":
      return t("status.pending");
    case "syncing":
      return t("status.syncing");
    case "failed":
      return t("status.failed");
    case "conflict":
      return t("status.conflict");
    default:
      return status;
  }
}

function QueueRow({
  op,
  onRetry,
  onDiscard,
}: {
  op: QueuedOperation;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const t = useTranslations("pos.offlineQueue");

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3 border-border bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{op.label}</p>
          <p className="text-xs text-muted-foreground">{statusLabel(t, op.status)}</p>
        </div>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide bg-muted text-muted-foreground">
          {op.type.replace("_", " ")}
        </span>
      </div>
      {op.lastError ? (
        <p className="text-xs text-rose-600 dark:text-rose-400">{op.lastError}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        {(op.status === "failed" || op.status === "conflict" || op.status === "pending") && (
          <Button type="button" size="sm" variant="outline" onClick={() => onRetry(op.id)}>
            <RefreshCw size={14} className="mr-1" />
            {t("actions.retry")}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={() => onDiscard(op.id)}>
          <Trash2 size={14} className="mr-1" />
          {t("actions.discard")}
        </Button>
      </div>
    </div>
  );
}

export function ReconciliationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("pos.offlineQueue");
  const { operations, counts, canSync, reload } = useOfflineQueueState();
  const scrollRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: operations.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 6,
  });

  const handleRetry = useCallback(
    async (id: string) => {
      await retryQueueOperation(id);
      await reload();
    },
    [reload]
  );

  const handleDiscard = useCallback(
    async (id: string) => {
      await discardQueueOperation(id);
      await reload();
    },
    [reload]
  );

  const handleFlushAll = useCallback(async () => {
    await flushOfflineQueue();
    await reload();
  }, [reload]);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("dialog.title")}</DialogTitle>
          <DialogDescription>{t("dialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>{t("summary.pending", { count: counts.pending })}</span>
          <span>{t("summary.failed", { count: counts.failed })}</span>
          <span>{t("summary.conflict", { count: counts.conflict })}</span>
          {!canSync ? (
            <span className="font-semibold text-amber-700 dark:text-amber-400">
              {t("summary.offline")}
            </span>
          ) : null}
        </div>

        <div
          ref={scrollRef}
          className="min-h-[200px] flex-1 overflow-y-auto rounded-lg border border-border /50 p-2 border-border bg-card/40"
        >
          {operations.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t("dialog.empty")}</p>
          ) : (
            <div
              style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}
            >
              <div style={{ paddingTop, paddingBottom }}>
                {virtualItems.map((virtualRow) => {
                  const op = operations[virtualRow.index];
                  if (!op) return null;
                  return (
                    <div
                      key={op.id}
                      ref={rowVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      className="pb-2"
                    >
                      <QueueRow op={op} onRetry={handleRetry} onDiscard={handleDiscard} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("actions.close")}
          </Button>
          <Button type="button" onClick={() => void handleFlushAll()} disabled={!canSync || counts.pending === 0}>
            {t("actions.syncNow")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
