"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import deepEqual from "fast-deep-equal";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { usePosStore } from "@/store/usePosStore";
import { useAuthStore } from "@/store/useAuthStore";
import type { Table, Zone } from "@/types/pos";
import api from "@/lib/api";
import { hasModuleAccess } from "@/lib/constants";

import { getPosSyncWsUrl, posSyncHubKey, subscribeSharedWebSocket } from "@/lib/ws";
import { queryKeys } from "@/lib/queryKeys";
import { mergePosTablesWithTakeawayVirtual } from "@/features/pos/lib/mergePosTablesWithTakeawayVirtual";

function sameTableLists(a: Table[], b: Table[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x.id.localeCompare(y.id));
  const sortedB = [...b].sort((x, y) => x.id.localeCompare(y.id));
  for (let i = 0; i < sortedA.length; i++) {
    if (!deepEqual(sortedA[i], sortedB[i])) return false;
  }
  return true;
}

/** POS dışı tüketiciler (tables modülü) için table cache'lerini tazeler.
 *  POS bileşenleri doğrudan setQueryData ile güncellenir — invalidate gerekmez. */
function invalidateNonPosTableQueries(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: queryKeys.tablesBase });
  void qc.invalidateQueries({ queryKey: ["zones", "summary"] });
}

/** WS `table_update` yükünü React Query önbelleğine uygular. */
function applyPosStyleTableUpdate(
  payload: { action: string; data: Table },
  queryClient: QueryClient,
) {
  const { action, data } = payload;
  const tableId = data.id;

  const updateFn = (oldData: unknown) => {
    if (!oldData) return oldData;

    const isArray = Array.isArray(oldData);
    const list = isArray ? oldData : (oldData as { results?: unknown }).results;

    if (!Array.isArray(list)) return oldData;

    let newList: Table[];
    if (action === "delete") {
      newList = list.filter((t) => t.id !== tableId);
    } else {
      const existingIndex = list.findIndex((t) => t.id === tableId);
      if (existingIndex > -1) {
        const before = list[existingIndex];
        const merged = { ...before, ...data } as Table;
        if (deepEqual(before, merged)) {
          return oldData;
        }
        newList = [...list];
        newList[existingIndex] = merged;
      } else {
        newList = [data, ...list];
      }
    }

    return isArray ? newList : { ...(oldData as object), results: newList };
  };

  queryClient.setQueriesData({ queryKey: queryKeys.tablesBase }, updateFn);
  queryClient.setQueriesData({ queryKey: queryKeys.posTablesBase }, updateFn);

  void queryClient.invalidateQueries({ queryKey: ["zones", "summary"] });
}

/** Yeni (listedde olmayan) garson masası: sunucu kapsamı için tam liste. Üst üste gelenler tek istekte. */
const WAITER_FULL_RESYNC_DEBOUNCE_MS = 80;

interface TableSyncProps {
  branchId?: string;
  /** Garson: yedek HTTP ve WS sonrası liste `scope=waiter` ile sınırlı kalır */
  variant?: "pos" | "waiter";
}

export function TableSync({ branchId, variant = "pos" }: TableSyncProps) {
  const { user, token } = useAuthStore(
    useShallow((s) => ({ user: s.user, token: s.token })),
  );
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  const waiterWsResyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    queryClientRef.current = queryClient;
  }, [queryClient]);

  useEffect(() => {
    const perms = user?.permissions;
    const su = user?.is_superuser;
    if (!hasModuleAccess(perms, su, "tables") || !token) {
      return;
    }

    let cancelled = false;

    const runHttpFallback = () => {
      if (cancelled) return;
      void (async () => {
        try {
          const params =
            variant === "waiter" && branchId
              ? { branch_id: branchId, scope: "waiter" as const }
              : {};
          const res = await api.get("/tables/", { params });
          const raw = res.data.results ?? res.data;
          let list = (Array.isArray(raw) ? raw : []) as Table[];
          if (branchId) {
            try {
              const vres = await api.get("/tables/takeaway_virtual/", {
                params: { branch_id: branchId, ...(variant === "waiter" ? { scope: "waiter" } : {}) },
              });
              const virt = Array.isArray(vres.data) ? vres.data : [];
              const qc = queryClientRef.current;
              const zones = qc.getQueryData<Zone[]>(queryKeys.posZones(branchId)) ?? [];
              list = mergePosTablesWithTakeawayVirtual(list, virt as Table[], zones);
            } catch {
              /* sanal paket masaları olmadan devam */
            }
          }
          const qc = queryClientRef.current;
          const prev = qc.getQueryData<Table[]>(queryKeys.posTables(branchId));
          if (prev && sameTableLists(prev, list)) {
            return;
          }
          qc.setQueryData(queryKeys.posTables(branchId), list);
          invalidateNonPosTableQueries(qc);
        } catch (e) {
          console.error("[TableSync] HTTP yedek masa listesi alınamadı", e);
        }
      })();
    };

    void runHttpFallback();

    const cleanupWs = subscribeSharedWebSocket(
      posSyncHubKey(branchId, usePosStore.getState().posTerminalUuid || undefined, "web"),
      {
      tag: "pos-table-sync",
      enabled: !!token,
      getUrl: () => getPosSyncWsUrl(branchId, usePosStore.getState().posTerminalUuid || undefined, "web"),
      onOpen: () => {
        console.debug("[TableSync] WebSocket connected");
      },
      onMessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "table_update") {
            const { action, data } = payload as { action: string; data: Table };
            const tableId = data.id as string;
            const qc = queryClientRef.current;

            if (variant === "waiter" && branchId) {
              const cachedTables = qc.getQueryData<Table[]>(queryKeys.posTables(branchId));
              const known = cachedTables?.some((t) => t.id === tableId) ?? false;
              if (action === "delete" || (action !== "delete" && known)) {
                applyPosStyleTableUpdate({ action, data }, qc);
                return;
              }
              if (waiterWsResyncTimerRef.current) {
                clearTimeout(waiterWsResyncTimerRef.current);
              }
              waiterWsResyncTimerRef.current = setTimeout(() => {
                waiterWsResyncTimerRef.current = null;
                void (async () => {
                  try {
                    const res = await api.get("/tables/", {
                      params: { branch_id: branchId, scope: "waiter" },
                    });
                    const raw = res.data.results ?? res.data;
                    let list = (Array.isArray(raw) ? raw : []) as Table[];
                    try {
                      const vres = await api.get("/tables/takeaway_virtual/", {
                        params: { branch_id: branchId, scope: "waiter" },
                      });
                      const virt = Array.isArray(vres.data) ? vres.data : [];
                      const zones = qc.getQueryData<Zone[]>(queryKeys.posZones(branchId)) ?? [];
                      list = mergePosTablesWithTakeawayVirtual(list, virt as Table[], zones);
                    } catch { console.error("[TableSync] Sanal masa listesi alınamadı"); }
                    const prev = qc.getQueryData<Table[]>(queryKeys.posTables(branchId));
                    if (prev && sameTableLists(prev, list)) {
                      return;
                    }
                    qc.setQueryData(queryKeys.posTables(branchId), list);
                    invalidateNonPosTableQueries(qc);
                  } catch (e) {
                    console.error("[TableSync] Garson masa listesi yenilenemedi", e);
                  }
                })();
              }, WAITER_FULL_RESYNC_DEBOUNCE_MS);
              return;
            }

            applyPosStyleTableUpdate({ action, data }, qc);
          } else if (
            payload.type === "orders_updated" ||
            payload.type === "kds_refresh" ||
            payload.type === "kds.refresh" ||
            payload.type === "order_status_changed"
          ) {
            // Paket siparişleri veya KDS statüsü değiştiğinde sanal/fiziksel masaları anında yenile
            runHttpFallback();
          } else if (payload.type === "force_disconnect") {
            toast.error(payload.message || "Bağlantınız yönetici tarafından sonlandırıldı.");
            // The socket will be closed by the server. We might want to clear terminal choice to avoid reconnect loop.
            usePosStore.getState().persistTerminalSelection("", null);
          }
        } catch (error) {
          console.error("[TableSync] Parse error", error);
        }
      },
    }
    );

    return () => {
      cancelled = true;
      if (waiterWsResyncTimerRef.current) {
        clearTimeout(waiterWsResyncTimerRef.current);
        waiterWsResyncTimerRef.current = null;
      }
      cleanupWs();
    };
  }, [user?.permissions, user?.is_superuser, token, branchId, variant]);

  return null;
}
