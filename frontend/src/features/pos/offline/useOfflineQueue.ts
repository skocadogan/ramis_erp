"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isPosOfflineQueueEnabled, OFFLINE_QUEUE_FLUSH_INTERVAL_MS } from "./config";
import { getCanSyncNow, usePosConnectivity } from "./connectivity";
import {
  flushOfflineQueue,
  getQueueSnapshot,
  listActiveQueueOperations,
  reconcileWithServer,
  subscribeOfflineQueue,
} from "./queueService";
import {
  beginSyncSession,
  endSyncSession,
  updateSyncSessionProgress,
} from "./syncSession";
import type { QueueCounts, QueuedOperation } from "./types";

const EMPTY_COUNTS: QueueCounts = {
  pending: 0,
  failed: 0,
  conflict: 0,
  syncing: 0,
  total: 0,
};

async function countSyncableOperations(): Promise<number> {
  const ops = await listActiveQueueOperations();
  return ops.filter((op) => op.status === "pending" || op.status === "failed").length;
}

export function useOfflineQueueState() {
  const enabled = isPosOfflineQueueEnabled();
  const { canSync } = usePosConnectivity();
  const [counts, setCounts] = useState<QueueCounts>(EMPTY_COUNTS);
  const [operations, setOperations] = useState<QueuedOperation[]>([]);
  const syncSessionRunningRef = useRef(false);
  const prevCanSyncRef = useRef(canSync);

  const reload = useCallback(async () => {
    if (!enabled) {
      setCounts(EMPTY_COUNTS);
      setOperations([]);
      return;
    }
    const { counts: c, operations: ops } = await getQueueSnapshot();
    setCounts(c);
    setOperations(ops);
  }, [enabled]);

  const runSyncCycle = useCallback(async () => {
    if (!enabled || !getCanSyncNow() || syncSessionRunningRef.current) return;

    const ops = await listActiveQueueOperations();
    if (!ops.length) return;

    await reconcileWithServer(ops.map((op) => op.idempotencyKey));
    if (!getCanSyncNow()) return;

    const syncableCount = await countSyncableOperations();
    if (!syncableCount) {
      await reload();
      return;
    }

    syncSessionRunningRef.current = true;
    beginSyncSession(syncableCount);

    try {
      const result = await flushOfflineQueue({
        onProgress: ({ total, completed, currentLabel }) => {
          updateSyncSessionProgress(completed, currentLabel || null);
          if (completed >= total && total > 0) {
            updateSyncSessionProgress(total, null);
          }
        },
        shouldContinue: () => getCanSyncNow(),
      });

      if (result.aborted || !getCanSyncNow()) {
        return;
      }
    } finally {
      endSyncSession();
      syncSessionRunningRef.current = false;
      await reload();
    }
  }, [enabled, reload]);

  useEffect(() => {
    void reload();
    return subscribeOfflineQueue(() => {
      void reload();
    });
  }, [reload]);

  useEffect(() => {
    if (!enabled) return;

    const wasOffline = !prevCanSyncRef.current;
    prevCanSyncRef.current = canSync;

    if (canSync && wasOffline) {
      void runSyncCycle();
    }
  }, [enabled, canSync, runSyncCycle]);

  useEffect(() => {
    if (!enabled || !canSync) return;

    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      await runSyncCycle();
    };

    void run();
    const onOnline = () => void run();
    window.addEventListener("online", onOnline);
    const onVis = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVis);
    const id = setInterval(() => void run(), OFFLINE_QUEUE_FLUSH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(id);
    };
  }, [enabled, canSync, runSyncCycle]);

  return { enabled, canSync, counts, operations, reload };
}
