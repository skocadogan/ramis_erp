/**
 * @deprecated Use useUnifiedSync instead.
 */
import { useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "../store/useAuthStore";
import { usePosStore } from "../store/usePosStore";
import { getApiUrl } from "../api/client";
import { buildWsUrl } from "../api/wsUrl";
import { playKitchenReadySound } from "../utils/sound";
import { useWaiterPosPushStore, type TableWsPatchMap } from "../store/useWaiterPosPushStore";
import { effectiveBranchId } from "../utils/branchScope";
import { queryClient } from "../api/queryClient";
import { fetchReadyForWaiterCount } from "../api/waiterApi";
import type { Table } from "../types/models";

const runAfterInteractionsFallback = (fn: () => void) => {
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(fn);
  } else {
    setTimeout(fn, 1);
  }
};

/** KDS/order olaylarında toplu invalidate — 600 ms debounce, en fazla 3 s bekler */
const KDS_DEBOUNCE_MS = 600;
const KDS_MAX_WAIT_MS = 3000;

/** Üstel geri-çekilme ile yeniden bağlanma gecikmesi (max 30 s). */
function calcReconnectDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30_000);
}

const READY_DEBOUNCE_MS = 500;
/** Mesaj seli hiç dinmezse rozetin çok geri kalmasın */
const READY_MAX_WAIT_MS = 2800;
const WS_HEARTBEAT_MS = 30_000;
const WS_STALE_TIMEOUT_MS = 95_000;

/**
 * Tek WebSocket (layout’ta çağrılmalı). Masa listesi / hazır sayı güncellemeleri store üzerinden yayılır.
 *
 * Yoğun trafikte:
 * - Hazır sayı API çağrısı debounce + tek uçuş (in-flight) ile sınırlanır.
 * - table_update yamaları requestAnimationFrame ile toplanır (çoklu masa → tek store güncellemesi).
 * - KDS/order olayları yalnızca ilgili masa epoch’unu artırır (masa grid’i gereksiz yere boyanmaz).
 */
/** Senkron dinleme yalnızca aktif POS vardiyası varken (terminal seçili + shift OPEN). */
export function useTableSync(enabled: boolean) {
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
  const playNotifSound = usePosStore((s) => s.playNotifSound);
  const prevCountRef = useRef(0);

  const readyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyMaxWaitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyFlightRef = useRef(false);
  const readyQueuedRef = useRef(false);

  const tablePatchBatchRef = useRef<TableWsPatchMap>({});
  const tableRafRef = useRef<number | null>(null);

  // KDS/order invalidate debounce
  const kdsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kdsMaxWaitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kdsOrderIdRef = useRef<string | null>(null);

  const clearReadySchedulers = useCallback(() => {
    if (readyDebounceRef.current) {
      clearTimeout(readyDebounceRef.current);
      readyDebounceRef.current = null;
    }
    if (readyMaxWaitRef.current) {
      clearTimeout(readyMaxWaitRef.current);
      readyMaxWaitRef.current = null;
    }
  }, []);

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
        console.warn("WS ping send error:", err);
      }
    }, WS_HEARTBEAT_MS);

    staleTimerRef.current = setInterval(() => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastPongAtRef.current <= WS_STALE_TIMEOUT_MS) return;
      console.warn("WS stale detected, reconnecting");
      socket.close();
    }, WS_HEARTBEAT_MS);
  }, [stopSocketHealthChecks]);

  const fetchReadyItemsCount = useCallback(async () => {
    if (!token || !branchId) return;
    try {
      const newCount = await fetchReadyForWaiterCount(branchId);

      if (newCount > prevCountRef.current && playNotifSound) {
        playKitchenReadySound();
      }

      prevCountRef.current = newCount;
      useWaiterPosPushStore.getState().setReadyItemsCount(newCount);
    } catch (err) {
      console.warn("Fetch ready items count error:", err);
    }
  }, [token, branchId, playNotifSound]);

  const fetchReadyRef = useRef(fetchReadyItemsCount);
  fetchReadyRef.current = fetchReadyItemsCount;

  const execReadyFetchCoalesced = useCallback(() => {
    if (readyFlightRef.current) {
      readyQueuedRef.current = true;
      return;
    }
    readyFlightRef.current = true;
    void (async () => {
      try {
        await fetchReadyRef.current();
      } finally {
        readyFlightRef.current = false;
        if (readyQueuedRef.current) {
          readyQueuedRef.current = false;
          execReadyFetchCoalesced();
        }
      }
    })();
  }, []);

  const scheduleReadyFetchAfterWs = useCallback(() => {
    if (readyDebounceRef.current) {
      clearTimeout(readyDebounceRef.current);
      readyDebounceRef.current = null;
    }
    readyDebounceRef.current = setTimeout(() => {
      readyDebounceRef.current = null;
      if (readyMaxWaitRef.current) {
        clearTimeout(readyMaxWaitRef.current);
        readyMaxWaitRef.current = null;
      }
      runAfterInteractionsFallback(() => {
        execReadyFetchCoalesced();
      });
    }, READY_DEBOUNCE_MS);

    if (!readyMaxWaitRef.current) {
      readyMaxWaitRef.current = setTimeout(() => {
        readyMaxWaitRef.current = null;
        if (readyDebounceRef.current) {
          clearTimeout(readyDebounceRef.current);
          readyDebounceRef.current = null;
        }
        runAfterInteractionsFallback(() => {
          execReadyFetchCoalesced();
        });
      }, READY_MAX_WAIT_MS);
    }
  }, [execReadyFetchCoalesced]);

  const flushTablePatchBatch = useCallback(() => {
    tableRafRef.current = null;
    const batch = tablePatchBatchRef.current;
    tablePatchBatchRef.current = {};
    const ids = Object.keys(batch);
    if (ids.length === 0) return;
    const st = useWaiterPosPushStore.getState();

    // React Query önbelleğini batch halinde güncelle
    if (branchId) {
      queryClient.setQueryData(["tables", branchId], (oldData: Table[]) => {
        if (!Array.isArray(oldData)) return oldData;
        let changed = false;
        const next = oldData.map((tbl) => {
          const patch = batch[String(tbl.id)];
          if (!patch) return tbl;
          changed = true;
          return { ...tbl, ...patch };
        });
        return changed ? next : oldData;
      });
    }

    if (ids.length === 1) {
      const only = batch[ids[0]];
      st.touchTableListFromWs(only);
    } else {
      st.applyTableWsPatchBatch(batch);
    }
  }, [branchId]);

  const queueTableUpdateFromWs = useCallback(
    (data: Record<string, unknown>) => {
      const rawId = data?.id;
      const id = rawId != null && String(rawId) !== "" ? String(rawId) : null;

      // Güncellemeyi RAF batch'e ekle — flushTablePatchBatch setQueryData + store güncellemeyi
      // tek seferde yapar; burada ikinci kez setQueryData çağırmak çift render'a yol açar (O-4).
      if (!id) {
        useWaiterPosPushStore.getState().touchTableListFromWs(data);
        return;
      }
      const prev = tablePatchBatchRef.current[id] ?? {};
      tablePatchBatchRef.current[id] = { ...prev, ...data };
      if (tableRafRef.current != null) return;
      tableRafRef.current = requestAnimationFrame(flushTablePatchBatch);
    },
    [flushTablePatchBatch]
  );

  /** Hedefli + debounce'lu invalidate: KDS patlamasında yüzlerce refetch yerine en fazla 1-2. */
  const flushKdsInvalidate = useCallback(() => {
    kdsDebounceRef.current = null;
    if (kdsMaxWaitRef.current) {
      clearTimeout(kdsMaxWaitRef.current);
      kdsMaxWaitRef.current = null;
    }
    if (!branchId) return;
    void queryClient.invalidateQueries({ queryKey: ["tables-takeaway-virtual", branchId] });
    void queryClient.invalidateQueries({ queryKey: ["pos-tables-takeaway-virtual", branchId] });
    void queryClient.invalidateQueries({ queryKey: ["table", "active-orders"] });
    if (kdsOrderIdRef.current) {
      void queryClient.invalidateQueries({ queryKey: ["table", "detail"] });
      kdsOrderIdRef.current = null;
    }
  }, [branchId]);

  const scheduleKdsInvalidate = useCallback(
    (orderId?: string | null) => {
      if (orderId) kdsOrderIdRef.current = orderId;
      if (kdsDebounceRef.current) {
        clearTimeout(kdsDebounceRef.current);
        kdsDebounceRef.current = null;
      }
      kdsDebounceRef.current = setTimeout(flushKdsInvalidate, KDS_DEBOUNCE_MS);
      if (!kdsMaxWaitRef.current) {
        kdsMaxWaitRef.current = setTimeout(() => {
          if (kdsDebounceRef.current) {
            clearTimeout(kdsDebounceRef.current);
            kdsDebounceRef.current = null;
          }
          flushKdsInvalidate();
        }, KDS_MAX_WAIT_MS);
      }
    },
    [flushKdsInvalidate]
  );

  const bumpTableFromKdsPayload = useCallback((payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const p = payload as Record<string, unknown>;
    const st = useWaiterPosPushStore.getState();
    const raw = p.table_id ?? p.tableId;
    if (raw != null && String(raw) !== "") {
      st.touchTableEpochOnly(String(raw));
      return;
    }
    const orderId = p.order_id ?? p.orderId;
    if (orderId != null && String(orderId) !== "") {
      st.touchTableEpochOnly(`tw-ord__${String(orderId)}`);
    }
  }, []);

  useEffect(() => {
    useWaiterPosPushStore.getState().setReadyRefreshHandler(() => {
      void fetchReadyRef.current();
    });
    return () => useWaiterPosPushStore.getState().setReadyRefreshHandler(null);
  }, []);

  useEffect(() => {
    if (!enabled || !token || !branchId) return;
    void fetchReadyRef.current();
    // WS olayları anlık günceller; HTTP fallback sadece WS kopukken çalışır.
    const interval = setInterval(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) return;
      void fetchReadyRef.current();
    }, 90_000);
    return () => clearInterval(interval);
  }, [enabled, token, branchId, playNotifSound]);

  useEffect(() => {
    if (!enabled) {
      prevCountRef.current = 0;
      clearReadySchedulers();
      useWaiterPosPushStore.getState().setReadyItemsCount(0);
    }
  }, [enabled, clearReadySchedulers]);

  useEffect(
    () => () => {
      clearReadySchedulers();
      if (kdsDebounceRef.current) {
        clearTimeout(kdsDebounceRef.current);
        kdsDebounceRef.current = null;
      }
      if (kdsMaxWaitRef.current) {
        clearTimeout(kdsMaxWaitRef.current);
        kdsMaxWaitRef.current = null;
      }
      if (tableRafRef.current != null) {
        cancelAnimationFrame(tableRafRef.current);
        tableRafRef.current = null;
      }
      tablePatchBatchRef.current = {};
    },
    [clearReadySchedulers]
  );

  useEffect(() => {
    if (!enabled || !token || !branchId) return;

    let teardown = false;

    const terminalId = usePosStore.getState().posTerminalUuid;
    const wsUrl = buildWsUrl(
      getApiUrl(),
      "/ws/pos/sync/",
      {
        branch_id: branchId,
        terminal_id: terminalId,
        platform: "mobile",
      },
      token
    );

    const connect = () => {
      if (teardown) return;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        reconnectAttemptRef.current = 0; // başarılı bağlantıda sayacı sıfırla
        useWaiterPosPushStore.getState().setWsConnected(true);
        startSocketHealthChecks();
      };

      socket.onmessage = (e) => {
        try {
          const message = JSON.parse(e.data);
          if (message.type === "pong") {
            lastPongAtRef.current = Date.now();
            return;
          }

          if (message.type === "table_update" && message.data) {
            queueTableUpdateFromWs(message.data as Record<string, unknown>);
            scheduleReadyFetchAfterWs();
          }

          if (
            message.type === "kds_refresh" ||
            message.type === "kds.refresh" ||
            message.type === "order_status_changed" ||
            message.type === "orders_updated"
          ) {
            const wsPayload = (message.message ?? message.data) as
              Record<string, unknown> | undefined;
            bumpTableFromKdsPayload(wsPayload);
            scheduleReadyFetchAfterWs();
            // Debounce + hedefli invalidate — anlık patlama yerine en fazla 1-2 refetch
            const orderId = wsPayload?.order_id || wsPayload?.orderId || null;
            scheduleKdsInvalidate(orderId ? String(orderId) : null);
          }

          if (
            message.type === "menu_catalog_refresh" ||
            message.type === "production_status_update"
          ) {
            useWaiterPosPushStore.getState().refreshMenu();
          }

          if (message.type === "force_disconnect") {
            usePosStore
              .getState()
              .setDisconnectModal(
                true,
                message.message || "Bağlantınız yönetici tarafından sonlandırıldı."
              );
            // Clearing terminal selection to prevent auto reconnect to the same terminal
            usePosStore.getState().persistTerminalSelection("", null);
          }
        } catch (err) {
          // Parse hatası — ham mesajı da logla (D-8)
          console.error("WS Message parse error:", err, "| raw:", e.data?.slice?.(0, 200));
        }
      };

      socket.onclose = () => {
        useWaiterPosPushStore.getState().setWsConnected(false);
        stopSocketHealthChecks();
        clearReadySchedulers();
        if (teardown) return;
        const delay = calcReconnectDelay(reconnectAttemptRef.current);
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        // WS error — onclose alınır, yeniden bağlanma reconnectTimer ile yönetilir
      };

      socketRef.current = socket;
    };

    connect();

    return () => {
      teardown = true;
      stopSocketHealthChecks();
      clearReadySchedulers();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (tableRafRef.current != null) {
        cancelAnimationFrame(tableRafRef.current);
        tableRafRef.current = null;
      }
      tablePatchBatchRef.current = {};
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [
    enabled,
    token,
    branchId,
    queueTableUpdateFromWs,
    bumpTableFromKdsPayload,
    scheduleReadyFetchAfterWs,
    scheduleKdsInvalidate,
    clearReadySchedulers,
    startSocketHealthChecks,
    stopSocketHealthChecks,
  ]);
}
