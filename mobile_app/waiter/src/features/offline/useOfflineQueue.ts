import { useCallback, useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { isOfflineQueueEnabled, OFFLINE_QUEUE_FLUSH_INTERVAL_MS } from "./config";
import { getCanSyncNow, useWaiterConnectivity } from "./connectivity";
import {
  flushOfflineQueue,
  getQueueCounts,
  listActiveQueueOperations,
  reconcileWithServer,
  subscribeOfflineQueue,
} from "./queueService";
import { beginSyncSession, endSyncSession, updateSyncSessionProgress } from "./syncSession";
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
  const enabled = isOfflineQueueEnabled();
  const { canSync } = useWaiterConnectivity();
  const [counts, setCounts] = useState<QueueCounts>(EMPTY_COUNTS);
  const [operations, setOperations] = useState<QueuedOperation[]>([]);
  const syncSessionRunningRef = useRef(false);
  const prevCanSyncRef = useRef(canSync);

  const reload = useCallback(
    async (opts?: { includeOperations?: boolean }) => {
      if (!enabled) {
        setCounts(EMPTY_COUNTS);
        setOperations([]);
        return;
      }
      const nextCounts = await getQueueCounts();
      setCounts(nextCounts);
      if (opts?.includeOperations) {
        const ops = await listActiveQueueOperations();
        setOperations(ops);
      }
    },
    [enabled]
  );

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
      await flushOfflineQueue({
        onProgress: ({ total, completed, currentLabel }) => {
          updateSyncSessionProgress(completed, currentLabel || null);
          if (completed >= total && total > 0) {
            updateSyncSessionProgress(total, null);
          }
        },
        shouldContinue: () => getCanSyncNow(),
      });
    } catch (err) {
      console.warn("[OfflineQueue] sync cycle failed:", err);
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
    const interval = setInterval(() => void run(), OFFLINE_QUEUE_FLUSH_INTERVAL_MS);
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void run();
      }
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      unsubscribe();
    };
  }, [enabled, canSync, runSyncCycle]);

  return { enabled, canSync, counts, operations, reload };
}
