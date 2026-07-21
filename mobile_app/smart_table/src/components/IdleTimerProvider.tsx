// ============================================================
// Smart Table — Idle Timer Provider
//
// 1) Idle timeout: no touch for N seconds → navigate to /
// 2) Payment detection: all orders cleared → navigate to /
// ============================================================

import { useEffect, useRef, useCallback, type ReactNode } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useUIStore } from "@/store/ui-store";
import { useOrderStore } from "@/store/order-store";

interface IdleTimerProviderProps {
  children: ReactNode;
}

export default function IdleTimerProvider({
  children,
}: IdleTimerProviderProps) {
  const idleTimeout = useUIStore((s) => s.idleTimeout);
  const isIdleTimerActive = useUIStore((s) => s.isIdleTimerActive);
  const resetIdleTimer = useUIStore((s) => s.resetIdleTimer);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const navigateToWelcome = useCallback(() => {
    router.replace("/" as never);
  }, []);

  // ── 1. Idle timeout ──
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!isIdleTimerActive || idleTimeout <= 0) return;

    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - useUIStore.getState().lastActivity) / 1000;
      if (elapsed >= idleTimeout) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        navigateToWelcome();
      }
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [idleTimeout, isIdleTimerActive, navigateToWelcome]);

  // ── 2. Payment detection: payment clear → welcome ──
  useEffect(() => {
    const unsub = useOrderStore.subscribe((state, prevState) => {
      const hadOrders = prevState.activeOrders.length > 0;
      const hasOrdersNow = state.activeOrders.length > 0;
      if (
        hadOrders &&
        !hasOrdersNow &&
        state.lastClearReason === "payment" &&
        useUIStore.getState().isIdleTimerActive
      ) {
        navigateToWelcome();
      }
    });

    return () => unsub();
  }, [navigateToWelcome]);

  return (
    <View
      style={{ flex: 1 }}
      onTouchStart={resetIdleTimer}
      onStartShouldSetResponderCapture={() => {
        resetIdleTimer();
        return false;
      }}
    >
      {children}
    </View>
  );
}
