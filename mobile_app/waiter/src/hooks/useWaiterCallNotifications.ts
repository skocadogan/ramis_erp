/**
 * @deprecated Use useUnifiedSync instead.
 */
import { useCallback, useEffect, useRef } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { usePosStore } from "../store/usePosStore";
import { getApiUrl } from "../api/client";
import { buildWsUrl } from "../api/wsUrl";
import { fetchWsTicket } from "../api/wsTicket";
import { fetchPendingWaiterCalls } from "../api/waiterApi";
import { playTableCallingSound } from "../utils/sound";
import { useWaiterPosPushStore } from "../store/useWaiterPosPushStore";
import { effectiveBranchId } from "../utils/branchScope";

/** WS kaçırılırsa bekleyen çağrıları periyodik REST ile yakala */
const PENDING_POLL_MS = 60_000;
const WS_HEARTBEAT_MS = 30_000;
const WS_STALE_TIMEOUT_MS = 95_000;

/**
 * Akıllı buton garson çağrısı — ``/ws/waiter/calls/`` (personel bildirim kanalından ayrı).
 * Açılışta ve periyodik olarak bekleyen çağrılar REST ile yüklenir.
 */
export function useWaiterCallNotifications(enabled: boolean) {
  const token = useAuthStore((s) => s.token);
  const userBranchId = useAuthStore((s) => s.user?.branchId);
  const activeBranchId = usePosStore((s) => s.activeBranchId);
  const branchId = effectiveBranchId(userBranchId, activeBranchId);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPongAtRef = useRef<number>(Date.now());
  const knownCallIdsRef = useRef<Set<string>>(new Set());

  const syncPendingCalls = useCallback(
    async (playSoundForNew: boolean) => {
      if (!branchId) return;
      const calls = await fetchPendingWaiterCalls(branchId);
      if (!usePosStore.getState().showWaiterCallNotifs) return;

      const store = useWaiterPosPushStore.getState();
      let played = false;
      for (const call of calls) {
        const id = call.call_id != null ? String(call.call_id) : "";
        if (!id) continue;
        const isNew = !knownCallIdsRef.current.has(id);
        knownCallIdsRef.current.add(id);
        if (isNew) {
          store.addWaiterCall(call);
          if (playSoundForNew && usePosStore.getState().playNotifSound && !played) {
            void playTableCallingSound();
            played = true;
          }
        }
      }
    },
    [branchId]
  );

  const stopSocketHealthChecks = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (staleTimerRef.current) {
      clearInterval(staleTimerRef.current);
      staleTimerRef.current = null;
    }
  }, []);

  const startSocketHealthChecks = useCallback(() => {
    stopSocketHealthChecks();
    lastPongAtRef.current = Date.now();
    heartbeatTimerRef.current = setInterval(() => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(JSON.stringify({ type: "ping" }));
      } catch (err) {
        console.warn("Waiter call WS ping send error:", err);
      }
    }, WS_HEARTBEAT_MS);
    staleTimerRef.current = setInterval(() => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastPongAtRef.current <= WS_STALE_TIMEOUT_MS) return;
      console.warn("Waiter call WS stale detected, reconnecting");
      socket.close();
    }, WS_HEARTBEAT_MS);
  }, [stopSocketHealthChecks]);

  useEffect(() => {
    if (!enabled || !token || !branchId) return;

    knownCallIdsRef.current.clear();
    let cancelled = false;

    void syncPendingCalls(false).catch((err) => {
      if (!cancelled) console.error("Pending waiter calls fetch error:", err);
    });

    const pollId = setInterval(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) return;
      void syncPendingCalls(true).catch((err) => {
        console.error("Pending waiter calls poll error:", err);
      });
    }, PENDING_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, [enabled, token, branchId, syncPendingCalls]);

  useEffect(() => {
    if (!enabled || !token || !branchId) return;

    let teardown = false;

    const connect = () => {
      if (teardown) return;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      void (async () => {
        let wsUrl: string;
        try {
          const ticket = await fetchWsTicket();
          wsUrl = buildWsUrl(
            getApiUrl(),
            "/ws/waiter/calls/",
            {
              branch_id: branchId,
            },
            ticket
          );
        } catch (err) {
          console.warn("WS ticket failed, retrying:", err);
          if (teardown) return;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30_000);
          reconnectAttemptRef.current += 1;
          reconnectTimerRef.current = setTimeout(connect, delay);
          return;
        }
        if (teardown) return;

        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

      socket.onmessage = (e) => {
        try {
          const message = JSON.parse(e.data);
          if (message.type === "pong") {
            lastPongAtRef.current = Date.now();
            return;
          }
          if (message.type === "waiter_call") {
            const data = message.data as Record<string, unknown> | undefined;
            if (!data) return;
            const callId = data.call_id != null ? String(data.call_id) : "";
            if (callId) {
              knownCallIdsRef.current.add(callId);
            }

            if (usePosStore.getState().showWaiterCallNotifs) {
              useWaiterPosPushStore.getState().addWaiterCall(data);
              if (usePosStore.getState().playNotifSound) {
                void playTableCallingSound();
              }
            }
            return;
          }

          if (message.type === "waiter_call_dismissed") {
            const data = message.data as Record<string, unknown> | undefined;
            if (!data) return;
            const dismissAll = Boolean(data.dismiss_all);
            const callIds = Array.isArray(data.call_ids)
              ? data.call_ids.map((id) => String(id))
              : [];
            if (dismissAll) {
              knownCallIdsRef.current.clear();
            } else {
              callIds.forEach((id) => knownCallIdsRef.current.delete(id));
            }
            useWaiterPosPushStore.getState().applyWaiterCallDismissed({ dismissAll, callIds });
          }
        } catch (err) {
          console.error("Waiter call WS parse error:", err, "| raw:", e.data?.slice?.(0, 200));
        }
      };

      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
        startSocketHealthChecks();
        void syncPendingCalls(false).catch((err) => {
          console.error("Pending waiter calls reconnect fetch error:", err);
        });
      };

      socket.onclose = () => {
        stopSocketHealthChecks();
        if (teardown) return;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30_000);
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        // WS error — onclose alınır, yeniden bağlanma reconnectTimer ile yönetilir
      };
      })();
    };

    connect();

    return () => {
      teardown = true;
      stopSocketHealthChecks();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [enabled, token, branchId, syncPendingCalls, startSocketHealthChecks, stopSocketHealthChecks]);
}
