import { useEffect } from "react";
import { usePosStore } from "../store/usePosStore";
import { useWaiterPosPushStore } from "../store/useWaiterPosPushStore";
import { playTableCallingSound } from "../utils/sound";

/** Görülmemiş garson çağrıları için tekrar hatırlatma aralığı */
const WAITER_CALL_REMINDER_MS = 60_000;

/**
 * Görülmemiş garson çağrıları için periyodik ses hatırlatması.
 */
export function useWaiterCallReminders(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      const { showWaiterCallNotifs, playNotifSound } = usePosStore.getState();
      const { waiterCalls, pulseWaiterCalls } = useWaiterPosPushStore.getState();
      if (!showWaiterCallNotifs || waiterCalls.length === 0) return;

      pulseWaiterCalls();
      if (playNotifSound) {
        void playTableCallingSound();
      }
    };

    const id = setInterval(tick, WAITER_CALL_REMINDER_MS);
    return () => clearInterval(id);
  }, [enabled]);
}
