import { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";
import { useTranslations } from "next-intl";
import deepEqual from "fast-deep-equal";
import { useAuthStore } from "@/store/useAuthStore";
import api from "@/lib/api";
import { toast } from "sonner";
import { adminApi, type KitchenStation } from "@/features/admin/services/adminApi";
import { getKitchenNotificationsWsUrl, kitchenNotificationsHubKey, subscribeSharedWebSocket } from "@/lib/ws";
import { applyPrepKitchenWsPayload } from "@/features/prep/utils/mergePrepWsCache";
import type { PrepTask } from "@/features/prep/types";
import { queryKeys } from "@/lib/queryKeys";
import type {
  Order,
  OrderItem,
  GroupedOrder,
  KdsItemHistoryEntry,
  KdsCancellationAnnouncement,
  KdsPeerPendingLine,
} from "../types";
import { kdsTableMergeKey } from "../utils/kdsTableKey";
import { playNotificationSound } from "@/lib/notificationSounds";

const GRACE_GROUP_MS = 15_000;

/** POS/tables iptal ve ödeme sonrası KDS listesini gecikmesiz yenile. */
const KDS_IMMEDIATE_REFRESH_REASONS = new Set([
  "cancel_table",
  "order_cancelled",
  "order_completed",
  "complete_table",
  "item_cancelled",
  "item_recalled",
  "item_quantity_updated",
]);

const RECALL_SYNC_ITEM_STATUSES = new Set(["READY", "DELIVERED"]);

const KDS_SKIP_QUANTITY_INLINE_UPDATE = new Set([
  "DELIVERED",
  "READY",
  "CANCELLED",
]);

function mergeTableKdsGroups(groups: GroupedOrder[]): GroupedOrder {
  const g0 = groups[0]!;
  const allItems = groups.flatMap((g) => g.items);
  return {
    order_id: `table-${kdsTableMergeKey(g0.table_name)}`,
    order_number: Array.from(new Set(groups.map(g => g.order_number).filter(Boolean))).join(', '),
    table_name: g0.table_name,
    order_type: "TABLE",
    items: allItems,
    user_name: Array.from(new Set(groups.map(g => g.user_name).filter(Boolean))).join(', ') || null,
    oldest_created_at_ts: Math.min(...groups.map((g) => g.oldest_created_at_ts)),
    all_cancelled: groups.length > 0 && groups.every((g) => g.all_cancelled),
    max_updated_at_ts: Math.max(...groups.map((g) => g.max_updated_at_ts)),
    notes: Array.from(new Set(groups.flatMap(g => g.notes || []).filter(Boolean))),
  };
}

function groupKdsOrders(orders: Order[]): GroupedOrder[] {
  const now = Date.now();
  const perOrderGroups: GroupedOrder[] = orders
    .map((order) => ({
      order_id: order.id,
      order_number: order.order_number,
      table_name:
        order.table_name || (order.order_type === "TAKEAWAY" ? "Paket Servis" : "İsimsiz Masa"),
      order_type: order.order_type,
      user_name: order.user_name,
      items: order.items.map((i) => ({
        ...i,
        order_id: order.id,
        order_created_at_ts: (order as Order & { created_at_ts: number }).created_at_ts,
        order_type: order.order_type,
      })),
      oldest_created_at_ts: (order as Order & { created_at_ts: number }).created_at_ts,
      all_cancelled: order.status === "CANCELLED",
      max_updated_at_ts: (order as Order & { updated_at_ts: number }).updated_at_ts,
      notes: (() => {
        const fromItems = (order.items ?? [])
          .map((it) => (it.notes ?? "").trim())
          .filter(Boolean);
        const orderNote = ((order as { notes?: string }).notes ?? "").trim();
        return Array.from(new Set([...(orderNote ? [orderNote] : []), ...fromItems]));
      })(),
    }))
    .filter((group) => {
      if (group.all_cancelled) {
        return now - group.max_updated_at_ts < GRACE_GROUP_MS;
      }
      return group.items.some(
        (item) =>
          item.status !== "CANCELLED" || now - item.updated_at_ts < GRACE_GROUP_MS
      );
    });

  const takeaway: GroupedOrder[] = [];
  const tableByKey = new Map<string, GroupedOrder[]>();
  for (const g of perOrderGroups) {
    if (g.order_type === "TAKEAWAY") {
      takeaway.push(g);
    } else {
      const k = kdsTableMergeKey(g.table_name);
      const list = tableByKey.get(k) ?? [];
      list.push(g);
      tableByKey.set(k, list);
    }
  }

  const fromTables: GroupedOrder[] = [];
  for (const list of tableByKey.values()) {
    if (list.length === 0) continue;
    if (list.length === 1) fromTables.push(list[0]!);
    else fromTables.push(mergeTableKdsGroups(list));
  }

  return [...fromTables, ...takeaway].sort(
    (a, b) => a.oldest_created_at_ts - b.oldest_created_at_ts
  );
}

type UseKdsDataOptions = {
  /** Ana sipariş listesi WS ile yenilendiğinde geri çağır drawer listesini de senkronize et. */
  onOrdersSync?: () => void;
};

/** Yetki: `/kds` sayfası `AuthGuard module="kds"` ile sarıldığında bu hook çalışır. */
export function useKdsData(options?: UseKdsDataOptions) {
  const qc = useQueryClient();
  const tk = useTranslations("kds");
  const { user, token } = useAuthStore(
    useShallow((s) => ({ user: s.user, token: s.token }))
  );
  const router = useRouter();
  const searchParams = useSearchParams();

  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [activeStation, setActiveStation] = useState<KitchenStation | null>(null);
  const [isStationLoading, setIsStationLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [peerPendingLines, setPeerPendingLines] = useState<KdsPeerPendingLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showSelector, setShowSelector] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(() => {
    const urlId = searchParams.get("branch_id");
    if (urlId) return urlId;
    if (user?.is_superuser) return null;
    return user?.branch_id || null;
  });
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

  // Sync selectedBranchId with user when it loads (only for regular users)
  useEffect(() => {
    if (user?.branch_id && !selectedBranchId && !user?.is_superuser) {
      setSelectedBranchId(user.branch_id);
    }
  }, [user?.branch_id, selectedBranchId, user?.is_superuser]);

  const [itemHistory, setItemHistory] = useState<Record<string, KdsItemHistoryEntry>>({});
  const itemHistoryRef = useRef(itemHistory);
  const activeStationRef = useRef(activeStation);

  useLayoutEffect(() => {
    itemHistoryRef.current = itemHistory;
  }, [itemHistory]);

  useLayoutEffect(() => {
    activeStationRef.current = activeStation;
  }, [activeStation]);

  const [soundEnabled, setSoundEnabled] = useState(() =>
    localStorage.getItem("kds_sound_enabled") !== "false"
  );
  const soundEnabledRef = useRef(soundEnabled);
  const knownOrderIdsRef = useRef<Set<string>>(new Set());

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("kds_sound_enabled", String(next));
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const [announcements, setAnnouncements] = useState<KdsCancellationAnnouncement[]>([]);
  const isInitializedRef = useRef(false);
  /** Ardışık kds_active isteklerinde geç cevapların taze listeyi silmesini engeller. */
  const kdsFetchSeqRef = useRef(0);
  const wsRefreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** WebSocket duplicate mesaj filtresi: son 50 benzersiz mesaj ID'sini tutar. */
  const processedWsMsgIdsRef = useRef<Set<string>>(new Set());
  const dedupCounterRef = useRef<number>(0);

  // Yalnızca gerçek istasyon değişiminde listeyi sıfırla. `fetchStations` her WS'te yeni
  // KitchenStation nesnesi ile setActiveStation yapıyordu; [activeStation] referansı değişince
  // siparişler siliniyor ve yenileme yarışında kartlar "bir an görünüp kayboluyordu".
  useEffect(() => {
    isInitializedRef.current = false;
    // Yalnızca gerçek istasyon değişiminde listeyi sıfırla işlemi fetchOrders'a devredilebilir.
    // Burada doğrudan sıfırlamak, race condition'lara yol açabilir.
  }, [activeStation?.id]);

  const fetchOrders = useCallback(async () => {
    if (!activeStation) return;
    const seq = ++kdsFetchSeqRef.current;
    try {
      const branchQ = selectedBranchId
        ? `&branch_id=${encodeURIComponent(selectedBranchId)}`
        : "";
      const [res, peerRes] = await Promise.all([
        api.get(
          `/orders/main/kds_active/?station_id=${activeStation.id}${branchQ}`,
        ),
        api.get(
          `/orders/main/kds-peer-pending/?station_id=${activeStation.id}${branchQ}`,
        ),
      ]);
      if (seq !== kdsFetchSeqRef.current) {
        return;
      }
      const nextPeerLines = Array.isArray(peerRes.data) ? (peerRes.data as KdsPeerPendingLine[]) : [];
      setPeerPendingLines(prev => (deepEqual(prev, nextPeerLines) ? prev : nextPeerLines));
      const rawData = res.data.results || res.data;

      // Pre-parse dates and prepare items once
      const GRACE_PERIOD = 15000;

      const data: Order[] = rawData
        .map((order: Order) => {
          const orderTs = new Date(order.created_at).getTime();
          const orderUpdateTs = new Date(order.updated_at).getTime();

          order.created_at_ts = orderTs;
          order.updated_at_ts = orderUpdateTs;

          const itemsWithTs = order.items.map((item: OrderItem) => {
            item.updated_at_ts = new Date(item.updated_at).getTime();
            item.order_created_at_ts = orderTs;
            return item;
          });
          order.items = itemsWithTs;
          return order;
        })
        .filter((order: Order) => {
          // API'den gelen "hayalet" iptaller: KDS'de hiç görünmemiş sipariş (servis sonrası POS iptali)
          if (order.status === "CANCELLED") {
            return false;
          }
          return true;
        });

      setOrders((prev) => {
        if (seq !== kdsFetchSeqRef.current) {
          return prev;
        }
        const newHistory = { ...itemHistoryRef.current };
        let hasHistoryChange = false;
        const now = Date.now();

        // Cancellation Detection
        const detectedAnnouncements: KdsCancellationAnnouncement[] = [];

        const dataIds = new Set(data.map((o) => o.id));
        /** Mutfakta açıkken iptal: API artık döndürmez; kısa süre kart + modal için tut. */
        const graceCancelledFromPrev = prev.filter(
          (o) =>
            o.status === "CANCELLED" &&
            !dataIds.has(o.id) &&
            now - (o as Order & { updated_at_ts: number }).updated_at_ts < GRACE_PERIOD
        );
        const mergedData = [...data, ...graceCancelledFromPrev];

        mergedData.forEach((order: Order) => {
          // Yalnızca KDS'de zaten görünen sipariş iptal olunca duyuru (servis sonrası POS iptali değil)
          if (isInitializedRef.current) {
            const prevOrder = prev.find((p) => p.id === order.id);
            if (
              order.status === "CANCELLED" &&
              prevOrder &&
              prevOrder.status !== "CANCELLED"
            ) {
              detectedAnnouncements.push({
                id: order.id + "_" + now,
                order_id: order.id,
                table_name:
                  order.table_name ||
                  (order.order_type === "TAKEAWAY" ? "Paket" : "Masa"),
                items: order.items.map((i) => i.product_name),
                type: "CANCELLED",
              });
            }
          }

          order.items.forEach(item => {
            const hist = newHistory[item.id];
            if (!hist) {
              newHistory[item.id] = {
                initialQty: item.quantity,
                lastChangeType: null,
                changeTimestamp: 0
              };
              hasHistoryChange = true;
            } else if (hist.initialQty !== item.quantity) {
              const type = item.quantity > hist.initialQty ? 'PLUS' : 'MINUS';
              newHistory[item.id] = {
                initialQty: item.quantity,
                lastChangeType: type,
                changeTimestamp: now,
                prevQty: hist.initialQty
              };
              hasHistoryChange = true;
            }
          });
        });

        isInitializedRef.current = true; // Mark as initialized after first processed batch

        if (detectedAnnouncements.length > 0) {
          setAnnouncements(cur => [...cur, ...detectedAnnouncements]);
        }

        if (hasHistoryChange) {
          itemHistoryRef.current = newHistory;
          setItemHistory(newHistory);
        }

        if (isInitializedRef.current && soundEnabledRef.current) {
          const currentIds = new Set(data.map((o) => o.id));
          const newIds = [...currentIds].filter((id) => !knownOrderIdsRef.current.has(id));
          if (newIds.length > 0) {
            playNotificationSound("kitchen-order-came");
          }
        }
        knownOrderIdsRef.current = new Set(data.map((o) => o.id));

        return mergedData;
      });
    } catch (e) {
      console.error("KDS data error:", e);
      if (seq === kdsFetchSeqRef.current) {
        setPeerPendingLines([]);
      }
    } finally {
      if (seq === kdsFetchSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [activeStation, selectedBranchId]);

  const buildKdsHrefForStation = useCallback(
    (s: KitchenStation) => {
      const p = new URLSearchParams(searchParams.toString());
      if (selectedBranchId) p.set("branch_id", selectedBranchId);
      p.set("station_id", s.id);
      p.set("station_name", s.name);
      p.set("station_color", s.color);
      return `/kds?${p.toString()}`;
    },
    [searchParams, selectedBranchId]
  );

  const fetchStations = useCallback(async () => {
    // Stations ve branches birbirinden bağımsız → paralel iste, waterfall'ı kır.
    // (Önce: stations → sonra branches sıralı; şube isteği stations tamamlanana kadar bekliyordu.)
    const stationsPromise = adminApi
      .getStations({ branch_id: selectedBranchId || undefined, assigned_only: true })
      .catch((e) => {
        console.error("Failed to load stations", e);
        return [] as KitchenStation[];
      });

    const branchesPromise = api
      .get("/branches/")
      .then((r) => r.data.results || r.data)
      .catch((e) => {
        console.error("Failed to load branches", e);
        return [] as { id: string; name: string }[];
      });

    const [data, branchesData] = await Promise.all([stationsPromise, branchesPromise]);
    setBranches(branchesData);
    setStations(data);

    const urlStationId = searchParams.get("station_id");

    try {
      // KDS ilk açılışında (URL'de istasyon belirtilmemişse)
      if (!urlStationId) {
        const savedStationId = localStorage.getItem("kds_station_id");
        if (savedStationId) {
          const foundSaved = data.find((s: KitchenStation) => s.id === savedStationId);
          if (foundSaved) {
            const cur = activeStationRef.current;
            if (!cur || cur.id !== foundSaved.id) {
              setActiveStation(foundSaved);
            }
            setShowSelector(false);
            router.replace(buildKdsHrefForStation(foundSaved));
            return;
          }
        }
        if (data.length > 1) {
          setShowSelector(true);
          return;
        } else if (data.length === 1) {
          const singleStation = data[0]!;
          const cur = activeStationRef.current;
          if (!cur || cur.id !== singleStation.id) {
            setActiveStation(singleStation);
          }
          localStorage.setItem("kds_station_id", singleStation.id);
          setShowSelector(false);
          router.replace(buildKdsHrefForStation(singleStation));
          return;
        } else {
          setShowSelector(true);
          return;
        }
      }

      // Eğer URL'de istasyon varsa veya yönlendirme yapıldıysa
      const savedStationId = localStorage.getItem("kds_station_id");
      const targetId = urlStationId || savedStationId;

      if (targetId) {
        const found = data.find((s: KitchenStation) => s.id === targetId);
        const current = activeStationRef.current;
        if (found && (!current || current.id !== found.id)) {
          setActiveStation(found);
        }
      }
    } finally {
      setIsStationLoading(false);
    }
  }, [buildKdsHrefForStation, router, searchParams, selectedBranchId]);

  const fetchOrdersRef = useRef(fetchOrders);
  const fetchStationsRef = useRef(fetchStations);
  const onOrdersSyncRef = useRef(options?.onOrdersSync);
  // tk her render'da yeni referans üretebilir; ref ile sabitliyoruz
  const tkRef = useRef(tk);
  useLayoutEffect(() => {
    fetchOrdersRef.current = fetchOrders;
    fetchStationsRef.current = fetchStations;
    onOrdersSyncRef.current = options?.onOrdersSync;
    tkRef.current = tk;
  }, [fetchOrders, fetchStations, options?.onOrdersSync, tk]);

  useEffect(() => {
    void fetchStationsRef.current();

    const savedStationId = localStorage.getItem("kds_station_id");
    const urlStationId = searchParams.get("station_id");

    if (!savedStationId && !urlStationId) {
      setShowSelector(true);
    }
  }, [selectedBranchId, searchParams]);

  useEffect(() => {
    if (!token) return;
    
    // Initial fetch when activeStation is set
    if (activeStation) {
      void fetchOrdersRef.current();
    }

    const cleanupWs = subscribeSharedWebSocket(
      kitchenNotificationsHubKey(selectedBranchId ?? activeStationRef.current?.branch ?? undefined),
      {
      tag: "kds-kitchen",
      getUrl: () =>
        getKitchenNotificationsWsUrl(
          selectedBranchId ?? activeStationRef.current?.branch ?? undefined
        ),
      enabled: !!token,
      onOpen: () => {
        /* Şube/WS eşzamanlılığı: bağlantı kurulunca HTTP ile aynı bağlamı yenile */
        if (activeStationRef.current) void fetchOrdersRef.current();
        void fetchStationsRef.current();
      },
      onMessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          /* WebSocket duplicate mesaj koruması: aynı payload tekrar gelirse atla.
           * MsgId: type + ayırt edici alanlar. Hiçbir ayırt edici alan yoksa
           * monotonic artan sayaç kullan (kds_stats_update gibi eventsiz olaylar). */
          const dedupParts: string[] = [payload.type];
          const ddp = payload.data as Record<string, unknown> | undefined;
          let hasUniqueField = false;
          if (ddp) {
            if (ddp.order_id) { dedupParts.push(String(ddp.order_id)); hasUniqueField = true; }
            if (ddp.item_id) { dedupParts.push(String(ddp.item_id)); hasUniqueField = true; }
            if (ddp.event) { dedupParts.push(String(ddp.event)); hasUniqueField = true; }
            if (ddp.item_status) { dedupParts.push(String(ddp.item_status)); hasUniqueField = true; }
            if (ddp.sub_type) { dedupParts.push(String(ddp.sub_type)); hasUniqueField = true; }
            if (ddp.reason) { dedupParts.push(String(ddp.reason)); hasUniqueField = true; }
            if (ddp.stock_item_name) { dedupParts.push(String(ddp.stock_item_name)); hasUniqueField = true; }
            if (ddp.report_number) { dedupParts.push(String(ddp.report_number)); hasUniqueField = true; }
            if (ddp.transfer_number) { dedupParts.push(String(ddp.transfer_number)); hasUniqueField = true; }
            if (ddp.status) { dedupParts.push(String(ddp.status)); hasUniqueField = true; }
            if (ddp.new_quantity != null) { dedupParts.push(String(ddp.new_quantity)); hasUniqueField = true; }
            const task = ddp.task as Record<string, unknown> | undefined;
            if (task?.id) { dedupParts.push(String(task.id)); hasUniqueField = true; }
            if (ddp.removed_task_id) { dedupParts.push(String(ddp.removed_task_id)); hasUniqueField = true; }
          }
          if (!hasUniqueField) {
            // Her olayı benzersiz yapmak için sayaç ekle
            dedupParts.push(String(dedupCounterRef.current++));
          }
          const dedupMsgId = dedupParts.join(":");
          if (processedWsMsgIdsRef.current.has(dedupMsgId)) {
            return;
          }
          processedWsMsgIdsRef.current.add(dedupMsgId);
          if (processedWsMsgIdsRef.current.size > 50) {
            const first = processedWsMsgIdsRef.current.values().next().value;
            if (first) processedWsMsgIdsRef.current.delete(first);
          }
          /* Yeni olay tipi: sadece prep önbelleği (sipariş refetch yok) */
          if (payload.type === "prep_updated" && payload.data) {
            const m = payload.data as {
              sub_type?: string;
              reason?: string;
              refresh_all?: boolean;
              removed_task_id?: string | null;
              task?: PrepTask | null;
            };
            applyPrepKitchenWsPayload(qc, {
              refresh_all: m.refresh_all,
              removed_task_id: m.removed_task_id ?? null,
              task: m.task ?? null,
            });
            return;
          }
          if (payload.type === "stock_low_alert" && payload.data) {
            const d = payload.data as { stock_item_name?: string; warehouse_name?: string };
            toast.warning(tkRef.current("toasts.stockLowTitle"), {
              description: tkRef.current("toasts.stockLowDescription", {
                item: d.stock_item_name ?? tkRef.current("toasts.stockLowUnknownItem"),
                warehouse: d.warehouse_name ?? "",
              }),
              duration: 6000,
            });
          }
          if (payload.type === "kds_stats_update") {
            // İstasyon sayaçlarını güncellemek için listeyi hafifçe yenile.
            void fetchStationsRef.current();
            return;
          }
          /* Hazırlık (eski kds_refresh): aynı mutfak WS taşınır */
          if (payload.type === "kds_refresh" && payload.data) {
            const m = payload.data as {
              sub_type?: string;
              reason?: string;
              refresh_all?: boolean;
              removed_task_id?: string | null;
              task?: PrepTask | null;
            };
            if (m.sub_type === "prep_update" || m.reason === "prep_update") {
              applyPrepKitchenWsPayload(qc, {
                refresh_all: m.refresh_all,
                removed_task_id: m.removed_task_id ?? null,
                task: m.task ?? null,
              });
            }
          }
          const isPrepOnlyKdsRefresh =
            payload.type === "kds_refresh" &&
            payload.data &&
            ((payload.data as { sub_type?: string; reason?: string }).sub_type === "prep_update" ||
              (payload.data as { reason?: string }).reason === "prep_update");
          /* order_status_changed: direkt state merge (refetch beklemeden anlık UI) */
          if (payload.type === "order_status_changed" && payload.data) {
            const d = payload.data as {
              event?: string;
              item_id?: string;
              item_status?: string;
              order_id?: string;
              new_quantity?: number;
            };
            const now = Date.now();
            if (d.event === "order_cancelled" && d.order_id) {
              let cancelAnnouncement: KdsCancellationAnnouncement | null = null;
              setOrders((prev) => {
                const target = prev.find((o) => o.id === d.order_id);
                if (!target) return prev;
                if (
                  isInitializedRef.current &&
                  target.status !== "CANCELLED"
                ) {
                  cancelAnnouncement = {
                    id: target.id + "_" + now,
                    order_id: target.id,
                    table_name:
                      target.table_name ||
                      (target.order_type === "TAKEAWAY" ? "Paket" : "Masa"),
                    items: target.items.map((i) => i.product_name),
                    type: "CANCELLED",
                  };
                }
                return prev.map((o) => {
                  if (o.id !== d.order_id) return o;
                  return {
                    ...o,
                    status: "CANCELLED" as const,
                    updated_at_ts: now,
                    items: o.items.map((it) => ({
                      ...it,
                      status: "CANCELLED" as const,
                      updated_at_ts: now,
                    })),
                  };
                });
              });
              if (cancelAnnouncement) {
                setAnnouncements((cur) => [...cur, cancelAnnouncement!]);
              }
              onOrdersSyncRef.current?.();
              // Sipariş iptal: kısa süre sonra refetch ile listeden kaldır
              if (wsRefreshDebounceRef.current) {
                clearTimeout(wsRefreshDebounceRef.current);
              }
              wsRefreshDebounceRef.current = setTimeout(() => {
                wsRefreshDebounceRef.current = null;
                if (activeStationRef.current) void fetchOrdersRef.current();
              }, 2000);
            } else if (d.item_id && d.item_status) {
              setOrders((prev) =>
                prev.map((o) => {
                  if (o.id !== d.order_id) return o;
                  const newItems = o.items.map((it) =>
                    it.id === d.item_id
                      ? { ...it, status: d.item_status as OrderItem['status'], updated_at_ts: now }
                      : it
                  );
                  if (newItems.some((it, i) => it !== o.items[i])) {
                    return { ...o, items: newItems, updated_at_ts: now };
                  }
                  return o;
                })
              );
              if (RECALL_SYNC_ITEM_STATUSES.has(d.item_status)) {
                onOrdersSyncRef.current?.();
                // Terminal durum (DELIVERED/READY): sipariş listeden kalkmış olabilir.
                // Inline merge anlık UI günceller, 2sn sonra refetch sunucudaki son listeyi alır.
                if (wsRefreshDebounceRef.current) {
                  clearTimeout(wsRefreshDebounceRef.current);
                }
                wsRefreshDebounceRef.current = setTimeout(() => {
                  wsRefreshDebounceRef.current = null;
                  if (activeStationRef.current) void fetchOrdersRef.current();
                }, 2000);
              }
            } else if (
              d.event === "quantity_updated" &&
              d.item_id &&
              d.new_quantity != null &&
              d.order_id
            ) {
              const newQty = Number(d.new_quantity);
              if (!Number.isFinite(newQty) || newQty <= 0) return;
              setOrders((prev) =>
                prev.map((o) => {
                  if (o.id !== d.order_id) return o;
                  const newItems = o.items.map((it) => {
                    if (it.id !== d.item_id) return it;
                    if (KDS_SKIP_QUANTITY_INLINE_UPDATE.has(it.status)) {
                      return it;
                    }
                    return { ...it, quantity: newQty, updated_at_ts: now };
                  });
                  if (newItems.some((it, i) => it !== o.items[i])) {
                    return { ...o, items: newItems, updated_at_ts: now };
                  }
                  return o;
                })
              );
              const hist = itemHistoryRef.current[d.item_id];
              if (hist && hist.initialQty !== newQty) {
                const type = newQty > hist.initialQty ? "PLUS" : "MINUS";
                const nextHistory = {
                  ...itemHistoryRef.current,
                  [d.item_id]: {
                    initialQty: newQty,
                    lastChangeType: type as "PLUS" | "MINUS",
                    changeTimestamp: now,
                    prevQty: hist.initialQty,
                  },
                };
                itemHistoryRef.current = nextHistory;
                setItemHistory(nextHistory);
              }
              onOrdersSyncRef.current?.();
            }
          }

          /* --- Selektif State Merge (P1.1) --- */
          if (
            payload.type === "kds_refresh" ||
            payload.type === "orders_updated"
          ) {
            if (isPrepOnlyKdsRefresh) {
              return;
            }
            const pData =
              payload.data && typeof payload.data === "object"
                ? (payload.data as Record<string, unknown>)
                : null;
            const refreshReason = pData
              ? String(pData.reason ?? "")
              : "";

            /* order_status_changed handler'ının inline merge yaptığı durumlarda
             * eğer etkilenen order state'te mevcutsa HTTP refetch'i tamamen atla. */
            const changedOrderId =
              pData && typeof pData.order_id === "string"
                ? (pData.order_id as string)
                : null;
            const changedOrderIds: string[] | null =
              pData && Array.isArray(pData.order_ids)
                ? (pData.order_ids as string[])
                : null;

            const alreadyMergedReasons = new Set([
              "item_status",
              "item_cancelled",
              "item_recalled",
              "item_quantity_updated",
              "firing_force_now",
              "firing_snooze",
              "order_cancelled",
            ]);

            let canSkipRefetch = false;
            if (alreadyMergedReasons.has(refreshReason)) {
              if (
                changedOrderId &&
                knownOrderIdsRef.current.has(changedOrderId)
              ) {
                canSkipRefetch = true;
              } else if (
                changedOrderIds &&
                changedOrderIds.length > 0 &&
                changedOrderIds.every((id) =>
                  knownOrderIdsRef.current.has(id)
                )
              ) {
                canSkipRefetch = true;
              }
            }

            if (canSkipRefetch) {
              /* Inline merge zaten state'i güncelledi;
               * sadece drawer callback'ini tetikle. */
              onOrdersSyncRef.current?.();
              return;
            }

            /* Selektif merge mümkün değil → HTTP refetch.
             * Sadece order'lar yenilenir, fetchStations çağrılmaz:
             * istasyon yapısı sipariş operasyonlarından etkilenmez,
             * kds_stats_update event'i ile güncellenir. */
            const refreshMs = KDS_IMMEDIATE_REFRESH_REASONS.has(refreshReason)
              ? 0
              : 1000;
            if (wsRefreshDebounceRef.current) {
              clearTimeout(wsRefreshDebounceRef.current);
            }
            wsRefreshDebounceRef.current = setTimeout(() => {
              wsRefreshDebounceRef.current = null;
              if (activeStationRef.current) void fetchOrdersRef.current();
              const sid = activeStationRef.current?.id;
              if (sid) void qc.invalidateQueries({ queryKey: queryKeys.kdsLinkedStock(sid) });
              onOrdersSyncRef.current?.();
            }, refreshMs);
          }

          if (payload.type === "deficiency_status_changed") {
            const data = payload.data;
            // Commit sonrası tutarlı liste için tam yenileme (sadece status merge yetersiz; transfers vb.)
            void qc.invalidateQueries({ queryKey: queryKeys.deficiencyReportsBase });

            const st = activeStationRef.current;
            if (data.station_id === st?.id) {
              const defKey = data.status ?? "";
              const deficiencyStatusLabels: Record<string, string> = {
                APPROVED: tkRef.current("toasts.deficiencyStatus.APPROVED"),
                CANCELLED: tkRef.current("toasts.deficiencyStatus.CANCELLED"),
                COMMITTED: tkRef.current("toasts.deficiencyStatus.COMMITTED"),
                PARTIALLY_COMMITTED: tkRef.current("toasts.deficiencyStatus.PARTIALLY_COMMITTED"),
              };
              const statusLabel = deficiencyStatusLabels[defKey] ?? data.status ?? "";
              toast.success(
                tkRef.current("toasts.deficiencyReportUpdatedTitle", { number: data.report_number ?? "" }),
                {
                  description: tkRef.current("toasts.deficiencyReportStatusLine", { status: statusLabel }),
                  duration: 8000,
                }
              );
            }
          }

          if (payload.type === "transfer_status_changed") {
            const data = payload.data as {
              station_id?: string;
              transfer_number?: string;
              status?: string;
            };
            void qc.invalidateQueries({ queryKey: queryKeys.deficiencyReportsBase });
            const st = activeStationRef.current;
            if (data.station_id === st?.id && data.transfer_number) {
              const stKey = data.status ?? "";
              const transferLabels: Record<string, string> = {
                DRAFT: tkRef.current("toasts.transferStatus.DRAFT"),
                PENDING: tkRef.current("toasts.transferStatus.PENDING"),
                IN_TRANSIT: tkRef.current("toasts.transferStatus.IN_TRANSIT"),
                COMPLETED: tkRef.current("toasts.transferStatus.COMPLETED"),
                CANCELLED: tkRef.current("toasts.transferStatus.CANCELLED"),
              };
              toast.message(tkRef.current("toasts.transferTitle", { number: data.transfer_number }), {
                description: transferLabels[stKey] ?? data.status,
                duration: 6000,
              });
            }
          }
        } catch {
          /* geçersiz mesaj */
        }
      },
    }
    );

    const processedIds = processedWsMsgIdsRef.current;
    return () => {
      if (wsRefreshDebounceRef.current) {
        clearTimeout(wsRefreshDebounceRef.current);
        wsRefreshDebounceRef.current = null;
      }
      processedIds.clear();
      cleanupWs();
    };
    // tk: useTranslations her render'da yeni ref uretebilir → tkRef uzerinden okunuyor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedBranchId, activeStation?.id, qc]);

  function handleSelectStation(s: KitchenStation) {
    setActiveStation(s);
    localStorage.setItem("kds_station_id", s.id);
    setShowSelector(false);
    router.replace(buildKdsHrefForStation(s));
  }

  const updateStatusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateItemStatus = useCallback(async (itemId: string, newStatus: string) => {
    const now = Date.now();
    
    setOrders((prev) => 
      prev.map(order => {
        let changed = false;
        const newItems = order.items.map(item => {
          if (item.id === itemId) {
            changed = true;
            return { ...item, status: newStatus as OrderItem['status'], updated_at_ts: now };
          }
          return item;
        });
        if (changed) {
          return { ...order, items: newItems, updated_at_ts: now };
        }
        return order;
      })
    );

    try {
      await api.post(`/orders/items/${itemId}/set_status/`, { status: newStatus });
      
      if (updateStatusDebounceRef.current) {
        clearTimeout(updateStatusDebounceRef.current);
      }
      updateStatusDebounceRef.current = setTimeout(() => {
        void fetchOrdersRef.current();
        const sid = activeStationRef.current?.id;
        if (sid) void qc.invalidateQueries({ queryKey: queryKeys.kdsLinkedStock(sid) });
      }, 400);
    } catch (e) {
      console.error("Failed to update status:", e);
      toast.error(tkRef.current("toasts.itemStatusUpdateFailed"));
      void fetchOrdersRef.current();
    }
  }, [qc]);

  const groupedOrders = useMemo(() => groupKdsOrders(orders), [orders]);

  return {
    user,
    stations,
    branches,
    activeStation,
    isStationLoading,
    isLoading,
    showSelector,
    selectedBranchId,
    itemHistory,
    orders,
    peerPendingLines,
    groupedOrders,
    announcements,
    setAnnouncements,
    setSelectedBranchId,
    setShowSelector,
    handleSelectStation,
    updateItemStatus,
    fetchOrders,
    soundEnabled,
    toggleSound,
  };
}
