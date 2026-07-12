/** POS terminalleri: Providers.tsx varsayılanı (60s stale + focus kapalı) kapı ekranında eski kalır. */
export const posTerminalsGateQueryOverrides = {
  staleTime: 0,
  refetchOnWindowFocus: true as const,
  /** Admin vb. başka sekmede değişiklikleri yakalamak için */
  refetchInterval: 8_000 as const,
};

/** Admin vb. diğer sekmelerde terminal listesi güncellenince POS/waiter önbelleğini tetikler. */
export function broadcastPosTerminalsUpdatedSignal() {
  try {
    localStorage.setItem("pos_terminals_updated_signal", String(Date.now()));
  } catch {
    /* private mode */
  }
}
