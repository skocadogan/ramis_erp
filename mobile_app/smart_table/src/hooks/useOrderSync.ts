// ============================================================
// Smart Table — Order WebSocket sync
// /ws/pos/sync/ — order_status_changed + orders_updated (KDS↔POS hattı)
// Pattern: mobile_app/waiter/src/hooks/useTableSync.ts
// ============================================================

import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useAuthStore } from "@/store/auth-store";
import { useTableStore } from "@/store/table-store";
import { useOrderStore, type WsOrderStatusPayload } from "@/store/order-store";
import { useMenuStore } from "@/store/menu-store";
import { buildPosSyncWsUrl } from "@/services/wsUrl";
import { fetchWsTicket } from "@/services/wsTicket";

const WS_HEARTBEAT_MS = 30_000;
const WS_STALE_TIMEOUT_MS = 95_000;
const ORDER_REFETCH_DEBOUNCE_MS = 600;
const ORDER_REFETCH_MAX_WAIT_MS = 3_000;
const HTTP_FALLBACK_MS = 45_000;

type WsMessage = {
  type?: string;
  message?: unknown;
  data?: unknown;
  action?: string;
};

const PAYMENT_CLEAR_REASONS = new Set([
  "order_completed",
  "complete_table",
  "table_completed",
]);

const TABLE_CLEARED_STATUSES = new Set(["FREE", "CLEANING"]);

function shouldClearOrdersOnTableUpdate(
  tableData: Record<string, unknown>,
  currentTableId: string | null,
): boolean {
  const tableId = tableData.id ?? tableData.table_id;
  if (!tableId || !currentTableId) return false;
  if (String(tableId) !== String(currentTableId)) return false;
  const status = String(tableData.status || "").toUpperCase();
  return TABLE_CLEARED_STATUSES.has(status);
}

function extractWsData(
  message: WsMessage,
): Record<string, unknown> | undefined {
  const raw = message.message ?? message.data;
  if (!raw || typeof raw !== "object") return undefined;
  return raw as Record<string, unknown>;
}

function payloadMatchesTable(
  payload: Record<string, unknown>,
  tableId: string | null,
): boolean {
  if (!tableId) return false;
  const tid = payload.table_id ?? payload.tableId;
  if (!tid) return false;
  return String(tid) === String(tableId);
}

function calcReconnectDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000);
}

function toStatusPayload(data: Record<string, unknown>): WsOrderStatusPayload {
  return {
    event: typeof data.event === "string" ? data.event : undefined,
    order_id:
      typeof data.order_id === "string"
        ? data.order_id
        : typeof data.orderId === "string"
          ? data.orderId
          : undefined,
    item_id:
      typeof data.item_id === "string"
        ? data.item_id
        : typeof data.itemId === "string"
          ? data.itemId
          : undefined,
    item_status:
      typeof data.item_status === "string"
        ? data.item_status
        : typeof data.itemStatus === "string"
          ? data.itemStatus
          : undefined,
    table_id:
      typeof data.table_id === "string"
        ? data.table_id
        : typeof data.tableId === "string"
          ? data.tableId
          : undefined,
  };
}

/**
 * Oturum açıkken POS sync WebSocket ile sipariş durumunu canlı tutar.
 * Tabs layout'ta bir kez mount edilmelidir.
 */
export function useOrderSync() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.token);
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const userBranchId = useAuthStore((s) => s.user?.branch_id);
  const selectedBranchId = useTableStore((s) => s.selectedBranch?.id);
  const tableId = useTableStore((s) => s.selectedTable?.id);

  const branchId = selectedBranchId || userBranchId || null;
  const enabled = isAuthenticated && !!token && !!serverUrl && !!branchId;

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPongAtRef = useRef<number>(0);
  const wsConnectedRef = useRef(false);

  const refetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchMaxWaitRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Stabilized callbacks (useRef avoids WS reconnect on callback identity change) ──

  const clearRefetchSchedulersRef = useRef(() => {
    if (refetchDebounceRef.current) {
      clearTimeout(refetchDebounceRef.current);
      refetchDebounceRef.current = null;
    }
    if (refetchMaxWaitRef.current) {
      clearTimeout(refetchMaxWaitRef.current);
      refetchMaxWaitRef.current = null;
    }
  });

  const stopSocketHealthChecksRef = useRef(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (staleTimerRef.current) {
      clearInterval(staleTimerRef.current);
      staleTimerRef.current = null;
    }
  });

  const startSocketHealthChecksRef = useRef(() => {
    stopSocketHealthChecksRef.current();
    lastPongAtRef.current = Date.now();

    heartbeatTimerRef.current = setInterval(() => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(JSON.stringify({ type: "ping" }));
      } catch (err) {
        console.warn("[useOrderSync] ping error:", err);
      }
    }, WS_HEARTBEAT_MS);

    staleTimerRef.current = setInterval(() => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastPongAtRef.current <= WS_STALE_TIMEOUT_MS) return;
      console.warn("[useOrderSync] stale connection, reconnecting");
      socket.close();
    }, WS_HEARTBEAT_MS);
  });

  const runRefetchRef = useRef(() => {
    const tableName = useTableStore.getState().selectedTable?.name;
    void useOrderStore.getState().fetchOrders(tableName, { background: true });
  });

  const scheduleOrdersRefetchRef = useRef(
    (payload?: Record<string, unknown>) => {
      const currentTableId =
        useTableStore.getState().selectedTable?.id ||
        useOrderStore.getState().resolvedTableId;

      if (payload && !payloadMatchesTable(payload, currentTableId)) {
        return;
      }

      if (!refetchMaxWaitRef.current) {
        refetchMaxWaitRef.current = setTimeout(() => {
          refetchMaxWaitRef.current = null;
          clearRefetchSchedulersRef.current();
          runRefetchRef.current();
        }, ORDER_REFETCH_MAX_WAIT_MS);
      }

      if (refetchDebounceRef.current) {
        clearTimeout(refetchDebounceRef.current);
      }
      refetchDebounceRef.current = setTimeout(() => {
        refetchDebounceRef.current = null;
        if (refetchMaxWaitRef.current) {
          clearTimeout(refetchMaxWaitRef.current);
          refetchMaxWaitRef.current = null;
        }
        runRefetchRef.current();
      }, ORDER_REFETCH_DEBOUNCE_MS);
    },
  );

  const handleWsMessageRef = useRef((message: WsMessage) => {
    if (message.type === "pong") {
      lastPongAtRef.current = Date.now();
      return;
    }

    const data = extractWsData(message);
    const currentTableId =
      useTableStore.getState().selectedTable?.id ||
      useOrderStore.getState().resolvedTableId;

    if (message.type === "table_update") {
      const tableData =
        message.data && typeof message.data === "object"
          ? (message.data as Record<string, unknown>)
          : undefined;
      if (
        tableData &&
        shouldClearOrdersOnTableUpdate(tableData, currentTableId)
      ) {
        useOrderStore.getState().clearOrders("payment");
      }
      return;
    }

    if (message.type === "menu_catalog_refresh") {
      useMenuStore.getState().signalRefresh();
      return;
    }

    if (message.type === "order_status_changed" && data) {
      if (!payloadMatchesTable(data, currentTableId)) return;
      useOrderStore
        .getState()
        .applyWsOrderStatusChange(toStatusPayload(data));
      scheduleOrdersRefetchRef.current(data);
      return;
    }

    if (
      message.type === "orders_updated" ||
      message.type === "kds_refresh" ||
      message.type === "kds.refresh"
    ) {
      const reason = typeof data?.reason === "string" ? data.reason : "";
      if (
        PAYMENT_CLEAR_REASONS.has(reason) &&
        payloadMatchesTable(data ?? {}, currentTableId)
      ) {
        useOrderStore.getState().clearOrders("payment");
        return;
      }
      scheduleOrdersRefetchRef.current(data);
    }
  });

  useEffect(() => {
    if (!enabled || !token || !serverUrl || !branchId) {
      useOrderStore.getState().setWsConnected(false);
      return;
    }

    let teardown = false;
    const isPausedRef = { current: AppState.currentState === "background" };

    const connect = () => {
      if (teardown || isPausedRef.current) return;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
        socketRef.current = null;
      }

      void (async () => {
        let ticket: string;
        try {
          ticket = await fetchWsTicket();
        } catch (err) {
          console.warn("[useOrderSync] WS ticket failed:", err);
          if (teardown || isPausedRef.current) return;
          const delay = calcReconnectDelay(reconnectAttemptRef.current);
          reconnectAttemptRef.current += 1;
          reconnectTimerRef.current = setTimeout(connect, delay);
          return;
        }

        if (teardown || isPausedRef.current) return;

        const wsUrl = buildPosSyncWsUrl(serverUrl, branchId, ticket);
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          reconnectAttemptRef.current = 0;
          wsConnectedRef.current = true;
          useOrderStore.getState().setWsConnected(true);
          startSocketHealthChecksRef.current();
          runRefetchRef.current();
        };

        socket.onmessage = (event) => {
          try {
            const parsed = JSON.parse(String(event.data)) as WsMessage;
            handleWsMessageRef.current(parsed);
          } catch (err) {
            console.warn("[useOrderSync] parse error:", err);
          }
        };

        socket.onclose = () => {
          wsConnectedRef.current = false;
          useOrderStore.getState().setWsConnected(false);
          stopSocketHealthChecksRef.current();
          clearRefetchSchedulersRef.current();
          if (teardown || isPausedRef.current) return;
          const delay = calcReconnectDelay(reconnectAttemptRef.current);
          reconnectAttemptRef.current += 1;
          reconnectTimerRef.current = setTimeout(connect, delay);
        };

        socket.onerror = () => {
          // onclose reconnect'i tetikler
        };
      })();
    };

    const handleAppStateChange = (nextAppState: string) => {
      const isBackground =
        nextAppState === "background" || nextAppState === "inactive";
      const wasBackground = isPausedRef.current;
      isPausedRef.current = isBackground;

      if (isBackground) {
        // Arka plana geçerken soketi kapat, reconnect zamanlayıcısını iptal et
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        if (socketRef.current) {
          socketRef.current.onclose = null;
          socketRef.current.close();
          socketRef.current = null;
        }
        stopSocketHealthChecksRef.current();
        wsConnectedRef.current = false;
        useOrderStore.getState().setWsConnected(false);
      } else if (wasBackground) {
        // Tekrar ön plana dönünce hemen bağlan
        reconnectAttemptRef.current = 0;
        connect();
      }
    };

    const appStateSubscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    if (!isPausedRef.current) {
      connect();
    }

    const httpFallback = setInterval(() => {
      if (wsConnectedRef.current || isPausedRef.current) return;
      runRefetchRef.current();
    }, HTTP_FALLBACK_MS);

    return () => {
      teardown = true;
      appStateSubscription.remove();
      clearInterval(httpFallback);
      clearRefetchSchedulersRef.current();
      stopSocketHealthChecksRef.current();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
        socketRef.current = null;
      }
      wsConnectedRef.current = false;
      useOrderStore.getState().setWsConnected(false);
    };
  }, [
    enabled,
    token,
    serverUrl,
    branchId,
    tableId,
  ]);

  return null;
}
