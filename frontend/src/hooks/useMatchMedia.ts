"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * `window.matchMedia` aboneliği — resize breakpoint’leri ve prefers-* sorguları için.
 * SSR / hidrasyonda sunucu snapshot’ı `defaultValue` (genelde false).
 */
export function useMatchMedia(query: string, defaultValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const m = window.matchMedia(query)
      m.addEventListener("change", onChange)
      return () => m.removeEventListener("change", onChange)
    },
    [query]
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => defaultValue
  )
}
