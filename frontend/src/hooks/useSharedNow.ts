"use client";

import { useSyncExternalStore } from "react";

/**
 * POS masa kartları için paylaşımlı saat (varsayılan 30 sn).
 * Her OCCUPIED kartta ayrı setInterval yerine tek timer.
 *
 * Önemli: useSyncExternalStore getSnapshot değeri her çağrıda aynı referans/
 * primitive olmalı. Date.now() doğrudan dönmek "Maximum update depth exceeded"
 * üretir.
 */

type Listener = () => void;

const intervals = new Map<
  number,
  {
    timer: ReturnType<typeof setInterval>;
    listeners: Set<Listener>;
    now: number;
  }
>();

/** subscribe öncesi getSnapshot için sabit tohum (Date.now tek sefer). */
const pendingSnapshots = new Map<number, number>();

function readNow(intervalMs: number): number {
  const entry = intervals.get(intervalMs);
  if (entry) return entry.now;
  let seed = pendingSnapshots.get(intervalMs);
  if (seed === undefined) {
    seed = Date.now();
    pendingSnapshots.set(intervalMs, seed);
  }
  return seed;
}

function subscribe(intervalMs: number, onStoreChange: Listener): () => void {
  let entry = intervals.get(intervalMs);
  if (!entry) {
    const now = pendingSnapshots.get(intervalMs) ?? Date.now();
    pendingSnapshots.delete(intervalMs);
    entry = {
      now,
      listeners: new Set(),
      timer: setInterval(() => {
        const cur = intervals.get(intervalMs);
        if (!cur) return;
        cur.now = Date.now();
        cur.listeners.forEach((l) => l());
      }, intervalMs),
    };
    intervals.set(intervalMs, entry);
  }
  entry.listeners.add(onStoreChange);
  return () => {
    const cur = intervals.get(intervalMs);
    if (!cur) return;
    cur.listeners.delete(onStoreChange);
    if (cur.listeners.size === 0) {
      clearInterval(cur.timer);
      intervals.delete(intervalMs);
    }
  };
}

function getServerSnapshot(): number {
  return 0;
}

/** Paylaşımlı duvar saati (ms). `intervalMs <= 0` ise abone olmaz. */
export function useSharedNow(intervalMs = 30_000): number {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (!intervalMs || intervalMs <= 0) return () => {};
      return subscribe(intervalMs, onStoreChange);
    },
    () => (intervalMs > 0 ? readNow(intervalMs) : 0),
    getServerSnapshot,
  );
}
