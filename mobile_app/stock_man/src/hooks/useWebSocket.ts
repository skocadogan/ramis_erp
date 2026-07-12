// ============================================================
// Stock Man — useWebSocket hook (P5)
//
// Single WebSocket connection to `/ws/warehouse/notifications/`.
// Event `type` değerleri backend consumer ile uyumludur:
//   deficiency_created | deficiency_status_changed | stock_low_alert
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useBranchStore } from "@/store/useBranchStore";
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
]);

function b64Encode(s: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";
  for (let i = 0; i < s.length; i += 3) {
    const a = s.charCodeAt(i);
    const b = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
    const c = i + 2 < s.length ? s.charCodeAt(i + 2) : 0;
    output += chars[a >> 2];
    output += chars[((a & 3) << 4) | (b >> 4)];
    output += i + 1 < s.length ? chars[((b & 15) << 2) | (c >> 6)] : "=";
    output += i + 2 < s.length ? chars[c & 63] : "=";
  }
  return output;
}

function buildWsUrl(serverUrl: string, branchId: string | null, token: string): string {
  const rootUrl = serverUrl.trim().replace(/\/api\/v1\/?$/i, "");
  const base = rootUrl.replace(/\/$/, "").replace(/^http/, "ws");
  const params = new URLSearchParams();
  if (branchId) params.set("branch_id", branchId);
  params.set("token", b64Encode(encodeURIComponent(token)));
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

  useEffect(() => {
    if (!enabled || !serverUrl || !token) return;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      setState("connecting");
      const url = buildWsUrl(serverUrl, branchId, token);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
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
            if (KNOWN_TYPES.has(msg.type)) {
              onEvent(msg as WarehouseWsEvent);
            }
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onerror = () => setState("error");
      ws.onclose = () => {
        if (cancelled) return;
        setState("closed");
        if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
        if (staleTimer.current) clearInterval(staleTimer.current);
        heartbeatTimer.current = null;
        staleTimer.current = null;

        const backoff = Math.min(1000 * 2 ** reconnectAttempt.current, MAX_BACKOFF_MS);
        reconnectAttempt.current += 1;
        setTimeout(connect, backoff);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      if (staleTimer.current) clearInterval(staleTimer.current);
      heartbeatTimer.current = null;
      staleTimer.current = null;
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
    };
  }, [enabled, serverUrl, token, branchId, onEvent]);

  return { state };
}
