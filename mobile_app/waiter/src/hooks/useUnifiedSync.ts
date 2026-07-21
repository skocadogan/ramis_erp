import { useCallback, useEffect, useRef } from "react";
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

export function useUnifiedSync(enabled: boolean) {
  const token = useAuthStore((s) => s.token);
  const userBranchId = useAuthStore((s) => s.user?.branchId);
  const activeBranchId = usePosStore((s) => s.activeBranchId);
  const branchId = effectiveBranchId(userBranchId, activeBranchId);
  const posTerminalUuid = usePosStore((s) => s.posTerminalUuid);
  const playNotifSound = usePosStore((s) => s.playNotifSound);

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

  // --- Ready refresh handler (other components can trigger refresh) ---
  useEffect(() => {
    useWaiterPosPushStore.getState().setReadyRefreshHandler(() => {
      void fetchReadyRef.current();
    });
    return () => useWaiterPosPushStore.getState().setReadyRefreshHandler(null);
  }, []);

  // --- Ready poll + initial fetch (90s fallback, only when POS WS is down) ---
  useEffect(() => {
    if (!enabled || !token || !branchId || !posTerminalUuid) return;
    void fetchReadyRef.current();
    const interval = setInterval(() => {
      if (useWaiterPosPushStore.getState().wsConnected) return;
      void fetchReadyRef.current();
    }, 90_000);
    return () => clearInterval(interval);
  }, [enabled, token, branchId, posTerminalUuid, playNotifSound]);

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
    if (!enabled || !token || !branchId || !posTerminalUuid) return;

    const client = createWebSocketClient();

    const unsubMessage = client.onMessage((msg) => {
      const message = msg as Record<string, unknown>;

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
        const wsPayload = (message.message ?? message.data) as Record<string, unknown> | undefined;
        bumpTableFromKdsPayload(wsPayload);
        scheduleReadyFetchAfterWs();
        const orderId = wsPayload?.order_id || wsPayload?.orderId || null;
        scheduleKdsInvalidate(orderId ? String(orderId) : null);
      }

      if (message.type === "menu_catalog_refresh" || message.type === "production_status_update") {
        useWaiterPosPushStore.getState().refreshMenu();
      }

      if (message.type === "shift_event") {
        const payload = message.data as
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

      if (message.type === "force_disconnect") {
        usePosStore
          .getState()
          .setDisconnectModal(
            true,
            String(message.message || "Bağlantınız yönetici tarafından sonlandırıldı.")
          );
        usePosStore.getState().persistTerminalSelection("", null);
        void useAuthStore.getState().logout();
      }
    });

    const unsubConnection = client.onConnectionChange((connected) => {
      useWaiterPosPushStore.getState().setWsConnected(connected);
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
    };
  }, [
    enabled,
    token,
    branchId,
    posTerminalUuid,
    queueTableUpdateFromWs,
    bumpTableFromKdsPayload,
    scheduleReadyFetchAfterWs,
    scheduleKdsInvalidate,
  ]);

  // --- Waiter calls initial sync + 60s poll (fallback when waiter WS is down) ---
  useEffect(() => {
    if (!enabled || !token || !branchId) return;

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
  }, [enabled, token, branchId, syncPendingCalls]);

  // --- Waiter Calls WebSocket (/ws/waiter/calls/) ---
  useEffect(() => {
    if (!enabled || !token || !branchId) return;

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
    };
  }, [enabled, token, branchId, syncPendingCalls]);
}
