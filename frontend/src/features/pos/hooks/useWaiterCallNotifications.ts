import { useCallback, useEffect, useRef } from "react";
import {
  getWaiterCallsWsUrl,
  resolveBranchIdForWs,
  subscribeSharedWebSocket,
  waiterCallsHubKey,
  acceptWsEvent,
} from "@/lib/ws";
import { useAuthStore } from "@/store/useAuthStore";
import { usePosStore } from "@/store/usePosStore";
import { handleWaiterCallPayload } from "@/features/pos/lib/waiterCallPayload";
import { handleWaiterCallDismissedPayload } from "@/features/pos/lib/waiterCallDismissPayload";
import { fetchPendingWaiterCalls } from "@/features/pos/services/waiterCallApi";
import { playNotificationSound } from "@/lib/notificationSounds";

/** WS kaçırılırsa bekleyen çağrıları periyodik REST ile yakala */
const PENDING_POLL_MS = 60_000;

function soundForWaiterSource(source?: string): "table-calling" | "guest-arrival" {
  if (source === "reservation_due" || source === "reservation_arrived") {
    return "guest-arrival";
  }
  return "table-calling";
}

/**
 * Akıllı buton garson çağrısı — ``/ws/waiter/calls/`` (personel bildirim / yazıcı API'sinden ayrı).
 * Açılışta ve periyodik olarak bekleyen çağrılar REST ile yüklenir (WS kaçırılan çağrılar).
 */
export function useWaiterCallNotifications(
  enabled: boolean,
  branchId?: string | null
) {
  const token = useAuthStore((s) => s.token);
  const hasToken = !!token;
  const activeBranchId = usePosStore((s) => s.activeBranchId);
  const effectiveBranchId = branchId ?? activeBranchId ?? null;
  const knownCallIdsRef = useRef<Set<string>>(new Set());

  const syncPendingCalls = useCallback(
    async (playSoundForNew: boolean) => {
      if (!effectiveBranchId) return;
      const calls = await fetchPendingWaiterCalls(effectiveBranchId);
      const st = usePosStore.getState();
      if (!st.showWaiterCallNotifs) return;

      let played = false;
      for (const call of calls) {
        const id = String(call.call_id);
        const isNew = !knownCallIdsRef.current.has(id);
        knownCallIdsRef.current.add(id);
        if (isNew) {
          st.addWaiterCallNotif({
            id,
            message: String(call.message || ""),
            tableId: call.table_id != null ? String(call.table_id) : undefined,
            source: call.source,
            reservationId:
              call.reservation_id != null ? String(call.reservation_id) : undefined,
            customerName:
              call.customer_name != null ? String(call.customer_name) : undefined,
          });
          if (playSoundForNew && st.playNotifSound && !played) {
            playNotificationSound(soundForWaiterSource(call.source));
            played = true;
          }
        }
      }
    },
    [effectiveBranchId]
  );

  useEffect(() => {
    if (!enabled || !hasToken || !effectiveBranchId) return;

    knownCallIdsRef.current.clear();
    let cancelled = false;

    void syncPendingCalls(false).catch((err) => {
      if (!cancelled) console.error("Pending waiter calls fetch error", err);
    });

    const pollId = window.setInterval(() => {
      void syncPendingCalls(true).catch((err) => {
        console.error("Pending waiter calls poll error", err);
      });
    }, PENDING_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [enabled, hasToken, effectiveBranchId, syncPendingCalls]);

  useEffect(() => {
    if (!enabled || !hasToken) return;

    const wsBranchId = resolveBranchIdForWs(effectiveBranchId);
    const sequenceKey = `waiter-calls:${wsBranchId ?? "global"}`;
    const cleanup = subscribeSharedWebSocket(waiterCallsHubKey(wsBranchId), {
      tag: "waiter-call-notifications",
      enabled: true,
      getUrl: () => getWaiterCallsWsUrl(wsBranchId),
      onMessage: (event) => {
        try {
          const parsed = acceptWsEvent(event.data, sequenceKey);
          if (!parsed) return;
          const payload = { type: parsed.type, data: parsed.data };
          if (payload.type === "waiter_call") {
            handleWaiterCallPayload(payload);
          } else if (payload.type === "waiter_call_dismissed") {
            handleWaiterCallDismissedPayload(payload);
          }
        } catch (e) {
          console.error("Waiter call WS parse error", e);
        }
      },
    });

    return () => cleanup();
  }, [enabled, hasToken, effectiveBranchId]);
}
