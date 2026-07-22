import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { getApiUrl } from "../api/client";
import { buildWsUrl } from "../api/wsUrl";
import { fetchWsTicket } from "../api/wsTicket";
import { playKitchenReadySound, playTableCallingSound } from "../utils/sound";
import { useWaiterPosPushStore, type TableWsPatchMap } from "../store/useWaiterPosPushStore";
import { effectiveBranchId } from "../utils/branchScope";
import { queryClient } from "../api/queryClient";
import { fetchReadyForWaiterCount, fetchPendingWaiterCalls } from "../api/waiterApi";
import { createWebSocketClient } from "../api/wsClient";
import type { Table } from "../types/models";
import { useAuthStore } from "../store/useAuthStore";
import { usePosStore } from "../store/usePosStore";
import {
  applyTableUpdate,
  reconcilePendingCallIds,
  type TableUpdateAction,
} from "./unifiedSyncPolicy";
import {
  dedupByEventId,
  parseWsMessage,
  setOnSequenceGap,
  shouldApplySequence,
} from "../../../shared/ws/wsEventProtocol";

const runAfterInteractionsFallback = (fn: () => void) => {
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(fn);
  } else {
    setTimeout(fn, 1);
  }
};

const KDS_DEBOUNCE_MS = 600;
const KDS_MAX_WAIT_MS = 3000;
const READY_DEBOUNCE_MS = 500;
const READY_MAX_WAIT_MS = 2800;
const PENDING_POLL_MS = 60_000;
const TABLE_FALLBACK_POLL_MS = 60_000;
const SEQUENCE_GAP_RESYNC_MS = 3_000;

export function useUnifiedSync(enabled: boolean) {
  const token = useAuthStore((s) => s.token);
  const userBranchId = useAuthStore((s) => s.user?.branchId);
  const activeBranchId = usePosStore((s) => s.activeBranchId);
  const branchId = effectiveBranchId(userBranchId, activeBranchId);
  const posTerminalUuid = usePosStore((s) => s.posTerminalUuid);
  const playNotifSound = usePosStore((s) => s.playNotifSound);
  const [isAppActive, setIsAppActive] = useState(
    AppState.currentState !== "background" && AppState.currentState !== "inactive"
  );

  const prevCountRef = useRef(0);
  const readyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyMaxWaitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyFlightRef = useRef(false);
  const readyQueuedRef = useRef(false);

  const tablePatchBatchRef = useRef<TableWsPatchMap>({});
  const tableRafRef = useRef<number | null>(null);

  const kdsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kdsMaxWaitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kdsOrderIdRef = useRef<string | null>(null);

  const knownCallIdsRef = useRef<Set<string>>(new Set());
  const callsWsConnectedRef = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setIsAppActive(nextState !== "background" && nextState !== "inactive");
    });
    return () => subscription.remove();
  }, []);

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

  const syncPendingCalls = useCallback(
    async (playSoundForNew: boolean) => {
      if (!branchId) return;
      const calls = await fetchPendingWaiterCalls(branchId);
      if (!usePosStore.getState().showWaiterCallNotifs) return;

      const store = useWaiterPosPushStore.getState();
      const previousIds = knownCallIdsRef.current;
      const { pendingIds, newIds, staleIds } = reconcilePendingCallIds(previousIds, calls);
      let played = false;
      for (const call of calls) {
        const id = call.call_id != null ? String(call.call_id) : "";
        if (!id) continue;
        if (newIds.has(id)) {
          store.addWaiterCall(call);
          if (playSoundForNew && usePosStore.getState().playNotifSound && !played) {
            void playTableCallingSound();
            played = true;
          }
        }
      }
      if (staleIds.length > 0) {
        store.applyWaiterCallDismissed({ callIds: staleIds });
      }
      knownCallIdsRef.current = pendingIds;
    },
    [branchId]
  );

  const resyncPosSnapshot = useCallback(() => {
    if (!branchId) return;
    void queryClient.invalidateQueries({ queryKey: ["tables", branchId] });
    void queryClient.invalidateQueries({ queryKey: ["tables-takeaway-virtual", branchId] });
    void queryClient.invalidateQueries({ queryKey: ["pos-tables-takeaway-virtual", branchId] });
    void queryClient.invalidateQueries({ queryKey: ["table", "active-orders"] });
    execReadyFetchCoalesced();
    void syncPendingCalls(false).catch((err) => {
      console.error("Pending waiter calls reconnect fetch error:", err);
    });
  }, [branchId, execReadyFetchCoalesced, syncPendingCalls]);

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

    if (branchId) {
      queryClient.setQueryData(["tables", branchId], (oldData: Table[]) => {
        if (!Array.isArray(oldData)) return oldData;
        return Object.values(batch).reduce(
          (tables, patch) => applyTableUpdate(tables, patch, "upsert"),
          oldData
        );
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
    (data: Record<string, unknown>, action?: TableUpdateAction) => {
      const rawId = data?.id ?? data?.table_id;
      const id = rawId != null && String(rawId) !== "" ? String(rawId) : null;

      if (!id) {
        useWaiterPosPushStore.getState().touchTableListFromWs(data);
        if (branchId) {
          void queryClient.invalidateQueries({ queryKey: ["tables", branchId] });
        }
        return;
      }

      if (action === "delete") {
        delete tablePatchBatchRef.current[id];
        if (branchId) {
          queryClient.setQueryData(["tables", branchId], (oldData: Table[]) => {
            if (!Array.isArray(oldData)) return oldData;
            return applyTableUpdate(oldData, data, action);
          });
        }
        useWaiterPosPushStore.getState().touchTableListFromWs(data);
        return;
      }

      const prev = tablePatchBatchRef.current[id] ?? {};
      tablePatchBatchRef.current[id] = { ...prev, ...data };
      if (tableRafRef.current != null) return;
      tableRafRef.current = requestAnimationFrame(flushTablePatchBatch);
    },
    [branchId, flushTablePatchBatch]
  );

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

  // --- Sequence gap → debounced snapshot resync ---
  useEffect(() => {
    let gapTimer: ReturnType<typeof setTimeout> | null = null;
    setOnSequenceGap(() => {
      if (gapTimer) clearTimeout(gapTimer);
      gapTimer = setTimeout(() => {
        gapTimer = null;
        resyncPosSnapshot();
      }, SEQUENCE_GAP_RESYNC_MS);
    });
    return () => {
      setOnSequenceGap(null);
      if (gapTimer) clearTimeout(gapTimer);
    };
  }, [resyncPosSnapshot]);

  // --- Ready refresh handler (other components can trigger refresh) ---
  useEffect(() => {
    useWaiterPosPushStore.getState().setReadyRefreshHandler(() => {
      void fetchReadyRef.current();
    });
    return () => useWaiterPosPushStore.getState().setReadyRefreshHandler(null);
  }, []);

  // --- Ready poll + initial fetch (90s fallback, only when POS WS is down) ---
  useEffect(() => {
    if (!enabled || !isAppActive || !token || !branchId || !posTerminalUuid) return;
    void fetchReadyRef.current();
    const interval = setInterval(() => {
      if (useWaiterPosPushStore.getState().wsConnected) return;
      void fetchReadyRef.current();
    }, 90_000);
    return () => clearInterval(interval);
  }, [enabled, isAppActive, token, branchId, posTerminalUuid, playNotifSound]);

  // --- Masa snapshot fallback (yalnız POS WS kapalıyken) ---
  useEffect(() => {
    if (!enabled || !isAppActive || !token || !branchId || !posTerminalUuid) return;
    const interval = setInterval(() => {
      if (useWaiterPosPushStore.getState().wsConnected) return;
      void queryClient.invalidateQueries({ queryKey: ["tables", branchId] });
      void queryClient.invalidateQueries({ queryKey: ["tables-takeaway-virtual", branchId] });
    }, TABLE_FALLBACK_POLL_MS);
    return () => clearInterval(interval);
  }, [enabled, isAppActive, token, branchId, posTerminalUuid]);

  // --- Clear ready state when disabled or terminal missing ---
  useEffect(() => {
    if (!enabled || !posTerminalUuid) {
      prevCountRef.current = 0;
      clearReadySchedulers();
      useWaiterPosPushStore.getState().setReadyItemsCount(0);
    }
  }, [enabled, posTerminalUuid, clearReadySchedulers]);

  // --- Final cleanup (unmount) ---
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

  // --- POS Sync WebSocket (/ws/pos/sync/) ---
  useEffect(() => {
    if (!enabled || !isAppActive || !token || !branchId || !posTerminalUuid) return;

    const client = createWebSocketClient();

    const unsubMessage = client.onMessage((msg) => {
      const parsed = parseWsMessage(msg);
      if (!parsed) return;

      const aggregateKey =
        parsed.tableId ?? parsed.orderId ?? parsed.branchId ?? branchId ?? parsed.type;
      if (!dedupByEventId(parsed.eventId)) return;
      if (!shouldApplySequence(aggregateKey, parsed.sequence)) return;

      const raw = msg as Record<string, unknown>;

      if (parsed.type === "table_update" && Object.keys(parsed.data).length > 0) {
        queueTableUpdateFromWs(
          parsed.data,
          typeof raw.action === "string" ? raw.action : undefined
        );
        scheduleReadyFetchAfterWs();
      }

      if (
        parsed.type === "kds_refresh" ||
        parsed.type === "kds.refresh" ||
        parsed.type === "order_status_changed" ||
        parsed.type === "orders_updated"
      ) {
        bumpTableFromKdsPayload(parsed.data);
        scheduleReadyFetchAfterWs();
        const orderId = parsed.orderId ?? parsed.data.order_id ?? parsed.data.orderId ?? null;
        scheduleKdsInvalidate(orderId ? String(orderId) : null);
      }

      if (parsed.type === "menu_catalog_refresh") {
        useWaiterPosPushStore.getState().refreshMenu();
      }

      if (parsed.type === "shift_event") {
        const payload = parsed.data as
          | { branch_id?: string; status?: string; shift_id?: string }
          | undefined;
        if (payload?.branch_id === branchId) {
          if (payload.status === "CLOSED") {
            queryClient.setQueryData(["shift", "active", branchId, posTerminalUuid], null);
            useWaiterPosPushStore.getState().setReadyItemsCount(0);
          }
          void queryClient.invalidateQueries({ queryKey: ["shift"] });
        }
      }

      if (parsed.type === "force_disconnect") {
        usePosStore
          .getState()
          .setDisconnectModal(
            true,
            String(raw.message || "Bağlantınız yönetici tarafından sonlandırıldı.")
          );
        usePosStore.getState().persistTerminalSelection("", null);
        void useAuthStore.getState().logout();
      }
    });

    const unsubConnection = client.onConnectionChange((connected) => {
      useWaiterPosPushStore.getState().setWsConnected(connected);
      if (connected) {
        resyncPosSnapshot();
      }
    });

    client.connect(async () => {
      const ticket = await fetchWsTicket();
      return buildWsUrl(
        getApiUrl(),
        "/ws/pos/sync/",
        {
          branch_id: branchId,
          terminal_id: posTerminalUuid,
          platform: "mobile",
        },
        ticket
      );
    });

    return () => {
      unsubMessage();
      unsubConnection();
      client.disconnect();
      useWaiterPosPushStore.getState().setWsConnected(false);
    };
  }, [
    enabled,
    isAppActive,
    token,
    branchId,
    posTerminalUuid,
    queueTableUpdateFromWs,
    bumpTableFromKdsPayload,
    scheduleReadyFetchAfterWs,
    scheduleKdsInvalidate,
    resyncPosSnapshot,
  ]);

  // --- Waiter calls initial sync + 60s poll (fallback when waiter WS is down) ---
  useEffect(() => {
    if (!enabled || !isAppActive || !token || !branchId) return;

    knownCallIdsRef.current.clear();
    let cancelled = false;

    void syncPendingCalls(false).catch((err) => {
      if (!cancelled) console.error("Pending waiter calls fetch error:", err);
    });

    const pollId = setInterval(() => {
      if (callsWsConnectedRef.current) return;
      void syncPendingCalls(true).catch((err) => {
        console.error("Pending waiter calls poll error:", err);
      });
    }, PENDING_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, [enabled, isAppActive, token, branchId, syncPendingCalls]);

  // --- Waiter Calls WebSocket (/ws/waiter/calls/) ---
  useEffect(() => {
    if (!enabled || !isAppActive || !token || !branchId) return;

    const client = createWebSocketClient();

    const unsubMessage = client.onMessage((msg) => {
      const message = msg as Record<string, unknown>;

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
        const callIds = Array.isArray(data.call_ids) ? data.call_ids.map((id) => String(id)) : [];
        if (dismissAll) {
          knownCallIdsRef.current.clear();
        } else {
          callIds.forEach((id) => knownCallIdsRef.current.delete(id));
        }
        useWaiterPosPushStore.getState().applyWaiterCallDismissed({ dismissAll, callIds });
      }
    });

    const unsubConnection = client.onConnectionChange((connected) => {
      callsWsConnectedRef.current = connected;
      if (connected) {
        void syncPendingCalls(false).catch((err) => {
          console.error("Pending waiter calls reconnect fetch error:", err);
        });
      }
    });

    client.connect(async () => {
      const ticket = await fetchWsTicket();
      return buildWsUrl(getApiUrl(), "/ws/waiter/calls/", { branch_id: branchId }, ticket);
    });

    return () => {
      unsubMessage();
      unsubConnection();
      client.disconnect();
      callsWsConnectedRef.current = false;
    };
  }, [enabled, isAppActive, token, branchId, syncPendingCalls]);
}
