// ============================================================
// Smart Table — Performance Mark Hook
// Development-only render timing with 16ms (60fps) threshold.
// ============================================================

import { useEffect, useRef } from "react";

export function usePerformanceMark(name: string) {
  const startRef = useRef(0);

  useEffect(() => {
    if (!__DEV__) return;
    startRef.current = performance.now();
    return () => {
      const duration = performance.now() - startRef.current;
      if (duration > 16) {
        console.warn(`[Perf] ${name}: ${duration.toFixed(1)}ms`);
      }
    };
  }, [name]);
}
