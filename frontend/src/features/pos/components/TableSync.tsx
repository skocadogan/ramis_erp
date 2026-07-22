"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import deepEqual from "fast-deep-equal";
import { useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { usePosStore } from "@/store/usePosStore";
import { useAuthStore } from "@/store/useAuthStore";
import type { Table, Zone } from "@/types/pos";
import api from "@/lib/api";
import { hasModuleAccess } from "@/lib/constants";

import { getPosSyncWsUrl, posSyncHubKey, subscribeSharedWebSocket, acceptWsEvent, setOnSequenceGap } from "@/lib/ws";
import { queryKeys } from "@/lib/queryKeys";
import { mergePosTablesWithTakeawayVirtual } from "@/features/pos/lib/mergePosTablesWithTakeawayVirtual";
import { shouldHttpFallbackPosTables } from "@/features/pos/lib/kitchenPosEvents";

/** Ucuz equality: id + status + aktif sipariş imzası. */
function tableSyncSignature(t: Table): string {
  const ao = t.active_order;
  const aos = t.active_orders;
  const orderSig = aos?.length
    ? aos.map((o) => `${o.id}:${o.total_amount}`).join(",")
    : ao
      ? `${ao.id}:${ao.status ?? ""}:${ao.total_amount}:${ao.created_at ?? ""}`
      : "";
  return [
    t.id,
    t.status,
    t.pos_occupied_flow ?? "",
    t.cleaning_until ?? "",
    String(t.order_count ?? 0),
    orderSig,
  ].join("|");
}

function sameTableLists(a: Table[], b: Table[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const sigA = a.map(tableSyncSignature).sort();
  const sigB = b.map(tableSyncSignature).sort();
  for (let i = 0; i < sigA.length; i++) {
    if (sigA[i] !== sigB[i]) return false;
  }
  return true;
}

const ZONES_SUMMARY_THROTTLE_MS = 2_000;
let lastZonesSummaryInvalidateAt = 0;

function throttleZonesSummaryInvalidate(qc: QueryClient) {
  const now = Date.now();
  if (now - lastZonesSummaryInvalidateAt < ZONES_SUMMARY_THROTTLE_MS) return;
  lastZonesSummaryInvalidateAt = now;
  void qc.invalidateQueries({ queryKey: ["zones", "summary"] });
}

/** POS dışı tüketiciler (tables modülü) için table cache'lerini tazeler. */
function invalidateNonPosTableQueries(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: queryKeys.tablesBase });
  throttleZonesSummaryInvalidate(qc);
}

function patchTableList(
  oldData: unknown,
  action: string,
  data: Table,
  opts: { allowPrepend: boolean },
): unknown {
  if (!oldData) {
    // Seed yarışı: boş cache'de en azından bu masayı tut (delete hariç).
    if (action === "delete") return oldData;
    return [data];
  }

  const isArray = Array.isArray(oldData);
  const list = isArray ? oldData : (oldData as { results?: unknown }).results;

  if (!Array.isArray(list)) return oldData;

  const tableId = data.id;
  let newList: Table[];
  if (action === "delete") {
    newList = list.filter((t: Table) => t.id !== tableId);
  } else {
    const existingIndex = list.findIndex((t: Table) => t.id === tableId);
    if (existingIndex > -1) {
      const before = list[existingIndex] as Table;
      const merged = { ...before, ...data } as Table;
      if (deepEqual(before, merged)) {
        return oldData;
      }
      newList = [...list];
      newList[existingIndex] = merged;
    } else if (opts.allowPrepend) {
      newList = [data, ...list];
    } else {
      return oldData;
    }
  }

  return isArray ? newList : { ...(oldData as object), results: newList };
}

/** WS `table_update` — yalnızca bu variant key + tablesBase. */
function applyPosStyleTableUpdate(
  payload: { action: string; data: Table },
  queryClient: QueryClient,
  tablesKey: QueryKey,
  opts: { allowPrepend: boolean },
) {
  const { action, data } = payload;

  queryClient.setQueriesData({ queryKey: queryKeys.tablesBase }, (old) => {
    if (!old) return old;
    return patchTableList(old, action, data, opts);
  });

  queryClient.setQueryData(tablesKey, (old) =>
    patchTableList(old, action, data, opts),
  );

  throttleZonesSummaryInvalidate(queryClient);
}

/** Yeni (listedde olmayan) garson masası: sunucu kapsamı için tam liste. */
const WAITER_FULL_RESYNC_DEBOUNCE_MS = 80;
/** Yapısal masa listesi HTTP yedeği — mutfak fırtınasında birleştirilir. */
const KDS_HTTP_FALLBACK_DEBOUNCE_MS = 1_000;
const POS_SEQUENCE_GAP_REFETCH_MS = 3_000;

interface TableSyncProps {
  branchId?: string;
  variant?: "pos" | "waiter";
}

export function TableSync({ branchId, variant = "pos" }: TableSyncProps) {
  const { user, token } = useAuthStore(
    useShallow((s) => ({ user: s.user, token: s.token })),
  );
  const hasToken = !!token;
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  const waiterWsResyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kdsHttpFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequenceGapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    queryClientRef.current = queryClient;
  }, [queryClient]);

  useEffect(() => {
    const perms = user?.permissions;
    const su = user?.is_superuser;
    if (!hasModuleAccess(perms, su, "tables") || !hasToken) {
      return;
    }

    let cancelled = false;
    const tablesKey = queryKeys.posTables(branchId, variant);

    const runHttpFallback = () => {
      if (cancelled) return;
      void (async () => {
        try {
          const params =
            variant === "waiter" && branchId
              ? { branch_id: branchId, scope: "waiter" as const }
              : branchId
                ? { branch_id: branchId }
                : {};
          const res = await api.get("/tables/", { params });
          const raw = res.data.results ?? res.data;
          let list = (Array.isArray(raw) ? raw : []) as Table[];
          if (branchId) {
            try {
              const vres = await api.get("/tables/takeaway_virtual/", {
                params: {
                  branch_id: branchId,
                  ...(variant === "waiter" ? { scope: "waiter" } : {}),
                },
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
          const prev = qc.getQueryData<Table[]>(tablesKey);
          if (prev && sameTableLists(prev, list)) {
            return;
          }
          qc.setQueryData(tablesKey, list);
          invalidateNonPosTableQueries(qc);
        } catch (e) {
          console.error("[TableSync] HTTP yedek masa listesi alınamadı", e);
        }
      })();
    };

    const scheduleKdsHttpFallback = () => {
      if (kdsHttpFallbackTimerRef.current) {
        clearTimeout(kdsHttpFallbackTimerRef.current);
      }
      kdsHttpFallbackTimerRef.current = setTimeout(() => {
        kdsHttpFallbackTimerRef.current = null;
        runHttpFallback();
      }, KDS_HTTP_FALLBACK_DEBOUNCE_MS);
    };

    const sequenceKey = `pos-sync:${branchId ?? "global"}:${variant}`;

    setOnSequenceGap(() => {
      if (sequenceGapTimerRef.current) {
        clearTimeout(sequenceGapTimerRef.current);
      }
      sequenceGapTimerRef.current = setTimeout(() => {
        sequenceGapTimerRef.current = null;
        scheduleKdsHttpFallback();
      }, POS_SEQUENCE_GAP_REFETCH_MS);
    });

    const cleanupWs = subscribeSharedWebSocket(
      posSyncHubKey(branchId, "web"),
      {
      tag: "pos-table-sync",
      enabled: hasToken,
      getUrl: () => {
        const terminalId = usePosStore.getState().posTerminalUuid || undefined;
        return getPosSyncWsUrl(branchId, terminalId, "web");
      },
      onOpen: () => {
        console.debug("[TableSync] WebSocket connected");
        // Kopukluk sonrası kaçırılan table_update / order_status_changed telafisi.
        scheduleKdsHttpFallback();
      },
      onMessage: (event) => {
        try {
          const parsed = acceptWsEvent(event.data, sequenceKey);
          if (!parsed) return;

          if (parsed.type === "table_update") {
            const action = parsed.action ?? "upsert";
            const data = parsed.data as unknown as Table;
            const tableId = data.id as string;
            const qc = queryClientRef.current;

            if (variant === "waiter" && branchId) {
              const cachedTables = qc.getQueryData<Table[]>(tablesKey);
              const known = cachedTables?.some((t) => t.id === tableId) ?? false;
              if (action === "delete" || (action !== "delete" && known)) {
                applyPosStyleTableUpdate(
                  { action, data },
                  qc,
                  tablesKey,
                  { allowPrepend: false },
                );
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
                    const prev = qc.getQueryData<Table[]>(tablesKey);
                    if (prev && sameTableLists(prev, list)) {
                      return;
                    }
                    qc.setQueryData(tablesKey, list);
                    invalidateNonPosTableQueries(qc);
                  } catch (e) {
                    console.error("[TableSync] Garson masa listesi yenilenemedi", e);
                  }
                })();
              }, WAITER_FULL_RESYNC_DEBOUNCE_MS);
              return;
            }

            applyPosStyleTableUpdate(
              { action, data },
              qc,
              tablesKey,
              { allowPrepend: true },
            );
          } else if (
            parsed.type === "order_status_changed" ||
            shouldHttpFallbackPosTables({ type: parsed.type, data: parsed.data })
          ) {
            scheduleKdsHttpFallback();
          } else if (parsed.type === "force_disconnect") {
            toast.error(
              (parsed.data.message as string) ||
                "Bağlantınız yönetici tarafından sonlandırıldı.",
            );
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
      if (kdsHttpFallbackTimerRef.current) {
        clearTimeout(kdsHttpFallbackTimerRef.current);
        kdsHttpFallbackTimerRef.current = null;
      }
      if (sequenceGapTimerRef.current) {
        clearTimeout(sequenceGapTimerRef.current);
        sequenceGapTimerRef.current = null;
      }
      cleanupWs();
    };
  }, [user?.permissions, user?.is_superuser, hasToken, branchId, variant]);

  return null;
}
