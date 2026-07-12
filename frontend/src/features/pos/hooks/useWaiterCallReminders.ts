import { useCallback, useEffect, useRef } from "react";
import { usePosStore } from "@/store/usePosStore";
import { playNotificationSound } from "@/lib/notificationSounds";

/** Görülmemiş garson çağrıları için tekrar hatırlatma aralığı */
const WAITER_CALL_REMINDER_MS = 60_000;

function playWaiterCallReminderSound() {
  playNotificationSound("table-calling");
}

/**
 * Görülmemiş (kapatılmamış) garson çağrıları için periyodik ses + UI nabız hatırlatması.
 */
export function useWaiterCallReminders(enabled: boolean) {
  const onReminderRef = useRef<(() => void) | null>(null);

  const registerReminderListener = useCallback((fn: (() => void) | null) => {
    onReminderRef.current = fn;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      const st = usePosStore.getState();
      if (!st.showWaiterCallNotifs || st.waiterCallNotifs.length === 0) return;

      st.pulseWaiterCallReminders();
      if (st.playNotifSound) {
        playWaiterCallReminderSound();
      }
      onReminderRef.current?.();
    };

    const id = window.setInterval(tick, WAITER_CALL_REMINDER_MS);
    return () => window.clearInterval(id);
  }, [enabled]);

  return { registerReminderListener };
}
