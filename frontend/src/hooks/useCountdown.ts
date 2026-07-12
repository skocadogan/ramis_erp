"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hedef zamana kalan saniyeyi canlı sayan hook.
 *
 * `targetTime` değiştiğinde interval yeniden kurulmaz; ref üzerinden
 * en güncel hedef okunur (aynı anda birden fazla interval mount etmekten kaçınır).
 *
 * @returns {{ remaining: number; formatted: string }}
 *   - `remaining` — kalan saniye (negatif olmaz, süre dolunca 0)
 *   - `formatted`  — "MM:SS" biçiminde string; süre dolunca boş
 */
export function useCountdown(targetTime: string | Date | number | null) {
  const [remaining, setRemaining] = useState<number>(0);

  const targetRef = useRef(targetTime);

  // Prop değişince ref'i güncelle ve anlık state'i senkronla
  useEffect(() => {
    targetRef.current = targetTime;
    setRemaining(computeRemaining(targetTime));
  }, [targetTime]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setRemaining(computeRemaining(targetRef.current));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const formatted =
    remaining <= 0
      ? ""
      : remaining > 60
        ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
        : `0:${String(remaining).padStart(2, "0")}`;

  return { remaining, formatted };
}

function computeRemaining(target: string | Date | number | null): number {
  if (target === null || target === undefined) return 0;
  const targetMs = typeof target === "number" ? target : new Date(target).getTime();
  if (!Number.isFinite(targetMs)) return 0;
  return Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));
}
