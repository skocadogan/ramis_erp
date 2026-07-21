// ============================================================
// Stock Man — useWebSocket hook (P5)
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useBranchStore } from "@/store/useBranchStore";
import { fetchWsTicket } from "@/api/wsTicket";
import type { WarehouseWsEvent } from "@/store/useWSPushStore";

export type { WarehouseWsEvent };
export type WarehouseWsEventHandler = (e: WarehouseWsEvent) => void;

type WsState = "idle" | "connecting" | "open" | "closed" | "error";

const MAX_BACKOFF_MS = 30_000;
const HEARTBEAT_MS = 30_000;
const STALE_MS = 95_000;

const KNOWN_TYPES = new Set([
  "deficiency_created",
  "deficiency_status_changed",
  "stock_low_alert",
  "force_disconnect",
]);

function buildWsUrl(serverUrl: string, branchId: string | null, ticket: string): string {
  const rootUrl = serverUrl.trim().replace(/\/api\/v1\/?$/i, "");
  const base = rootUrl.replace(/\/$/, "").replace(/^http/, "ws");
  const params = new URLSearchParams();
  if (branchId) params.set("branch_id", branchId);
  params.set("ticket", ticket);
  params.set("platform", "mobile");
  return `${base}/ws/warehouse/notifications/?${params.toString()}`;
}

export function useWebSocket(onEvent: WarehouseWsEventHandler, enabled: boolean = true) {
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const token = useAuthStore((s) => s.token);
  const branchId = useBranchStore((s) => s.activeBranchId);
  const [state, setState] = useState<WsState>("idle");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPongRef = useRef<number>(0);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !serverUrl || !token) return;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const clearHealth = () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      if (staleTimer.current) clearInterval(staleTimer.current);
      heartbeatTimer.current = null;
      staleTimer.current = null;
    };

    const connect = () => {
      if (cancelled) return;
      setState("connecting");

      void (async () => {
        let url: string;
        try {
          const ticket = await fetchWsTicket();
          url = buildWsUrl(serverUrl, branchId, ticket);
        } catch (err) {
          console.warn("[WS] ticket failed, retrying:", err);
          if (cancelled) return;
          const backoff = Math.min(1000 * 2 ** reconnectAttempt.current, MAX_BACKOFF_MS);
          reconnectAttempt.current += 1;
          reconnectTimer = setTimeout(connect, backoff);
          return;
        }
        if (cancelled) return;

        if (wsRef.current) {
          try {
            wsRef.current.onclose = null;
            wsRef.current.close();
          } catch {
            /* ignore */
          }
          wsRef.current = null;
        }

        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          if (cancelled || wsRef.current !== ws) return;
          setState("open");
          reconnectAttempt.current = 0;
          lastPongRef.current = Date.now();

          heartbeatTimer.current = setInterval(() => {
            try {
              ws.send(JSON.stringify({ type: "ping" }));
            } catch {
              /* closed */
            }
          }, HEARTBEAT_MS);

          staleTimer.current = setInterval(() => {
            if (Date.now() - lastPongRef.current > STALE_MS) {
              try {
                ws.close();
              } catch {
                /* ignore */
              }
            }
          }, 15_000);
        };

        ws.onmessage = (e) => {
          lastPongRef.current = Date.now();
          if (typeof e.data !== "string") return;
          try {
            const msg = JSON.parse(e.data);
            if (msg && typeof msg === "object" && typeof msg.type === "string") {
              if (msg.type === "force_disconnect") {
                void useAuthStore.getState().logout();
                return;
              }
              if (KNOWN_TYPES.has(msg.type) && msg.type !== "force_disconnect") {
                onEventRef.current(msg as WarehouseWsEvent);
              }
            }
          } catch {
            /* ignore malformed frames */
          }
        };

        ws.onerror = () => setState("error");
        ws.onclose = () => {
          if (cancelled || (wsRef.current !== ws && wsRef.current != null)) return;
          setState("closed");
          clearHealth();

          const backoff = Math.min(1000 * 2 ** reconnectAttempt.current, MAX_BACKOFF_MS);
          reconnectAttempt.current += 1;
          reconnectTimer = setTimeout(connect, backoff);
        };
      })();
    };

    connect();

    return () => {
      cancelled = true;
      clearHealth();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        try {
          wsRef.current.onclose = null;
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
    };
  }, [enabled, serverUrl, token, branchId]);

  return { state };
}
