// ============================================================
// Stock Man — useOfflineQueue hook (P5)
//
// Thin React adapter over the offline queue. Exposes:
//
//   - `pendingCount`  : current SQLite count (refreshed on mount
//                       and after every manual `sync()` call)
//   - `syncing`       : true while a sync sweep is in progress
//   - `lastSyncAt`    : `Date.now()` of the last completed sweep
//   - `refreshCount()`: force a recount (used by the modal "x items
//                       pending" badge after enqueueing)
//   - `sync()`        : kick a sweep; safe to call repeatedly
//
// Auto-sync is driven by a single effect that listens to both
// AppState foreground events AND health-store transitions.
// `isSyncing()` guards against concurrent sweeps. A ref-based
// edge-detector prevents sync from firing on every re-render.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { offlineQueue } from "@/lib/offline/queueService";
import { syncPending, isSyncing } from "@/lib/offline/syncSession";
import { useBackendHealthStore } from "@/store/useBackendHealthStore";

export function useOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const health = useBackendHealthStore((s) => s.status);

  const prevHealthRef = useRef(health);
  const didInitialSyncRef = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      const c = await offlineQueue.count();
      setPendingCount(c);
    } catch {
      // Count is purely cosmetic — never throw to the caller.
    }
  }, []);

  const sync = useCallback(async () => {
    if (isSyncing()) return undefined;
    setSyncing(true);
    try {
      const result = await syncPending();
      setLastSyncAt(Date.now());
      await refreshCount();
      return result;
    } catch (err) {
      console.warn("[OfflineQueue] sync failed:", err);
      return undefined;
    } finally {
      setSyncing(false);
    }
  }, [refreshCount]);

  // Initial count on mount.
  useEffect(() => {
    const t = setTimeout(() => {
      void refreshCount();
    }, 0);
    return () => clearTimeout(t);
  }, [refreshCount]);

  // Combined auto-sync: a single effect that watches both
  // AppState foreground transitions and health-store changes.
  // Previously split into two effects which could trigger
  // back-to-back sync sweeps.
  useEffect(() => {
    // Edge-detect health transitions: sync only when health
    // genuinely flips from non-ok to ok, not on every re-render.
    if (health === "ok" && prevHealthRef.current !== "ok") {
      void sync();
    }
    prevHealthRef.current = health;

    // AppState listener: sync when app returns to foreground
    // and backend is reachable.
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && health === "ok" && didInitialSyncRef.current) {
        void sync();
      }
      didInitialSyncRef.current = true;
    });

    return () => sub.remove();
  }, [health, sync]);

  return {
    pendingCount,
    syncing,
    lastSyncAt,
    refreshCount,
    sync,
  };
}
