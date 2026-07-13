"use client";

import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { isAxiosError } from "axios";
import { usePosStore } from "@/store/usePosStore";
import { usePosTables } from "@/features/pos/hooks/usePosTables";
import { useAuthStore } from "@/store/useAuthStore";
import { useShallow } from "zustand/react/shallow";
import api from "@/lib/api";
import { Bell, Radio } from "lucide-react";
import { WS_HTTP_FALLBACK_INTERVAL_MS } from "@/lib/wsBackendHost";
import {
  getKitchenNotificationsWsUrl,
  getStaffNotificationsWsUrl,
  kitchenNotificationsHubKey,
  resolveBranchIdForWs,
  staffNotificationsHubKey,
  subscribeSharedWebSocket,
} from "@/lib/ws";
import { playNotificationSound } from "@/lib/notificationSounds";
import { handleStaffNotificationPayload } from "@/features/pos/lib/staffNotificationPayload";
import { useWaiterCallReminders } from "@/features/pos/hooks/useWaiterCallReminders";
import { useWaiterCallNotifications } from "@/features/pos/hooks/useWaiterCallNotifications";
import { dismissWaiterCalls } from "@/features/pos/services/waiterCallApi";
import { hasPermission } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import type { ReadyItem } from "@/types/pos";
import { groupReadyNotificationItems } from "@/features/pos/lib/groupReadyNotificationItems";
import { KitchenNotifsPanel, type GuestArrivedNotif } from "./KitchenNotifsPanel";
import { WaiterCallNotifsPanel, type WaiterCallNotif } from "./WaiterCallNotifsPanel";

interface ReadyItemApiRow {
  id: string;
  product_name: string;
  table_name: string;
  quantity: number;
  status: string;
  unit_name: string | null;
  updated_at: string;
  station_name?: string | null;
  order_id?: string;
  order_number?: string | null;
  order_type?: "TABLE" | "TAKEAWAY";
  waiter_acknowledged_at?: string | null;
}

type ReadyByTableGroup = { key: string; tableLabel: string; items: ReadyItem[] };

function canPollReadyOrders(
  userPermissions: string[] | undefined,
  isSuperuser: boolean | undefined,
  variant: "pos" | "waiter"
): boolean {
  if (isSuperuser) return true;
  if (variant === "waiter") {
    return hasPermission(userPermissions, isSuperuser, "waiter.access");
  }
  return (
    hasPermission(userPermissions, isSuperuser, "orders.view_order") ||
    hasPermission(userPermissions, isSuperuser, "orders.manage_order")
  );
}

const READY_LIST_MIN_INTERVAL_MS = 3_500;
const WS_READY_DEBOUNCE_MS = 1_200;

export function NotificationDrawer({
  variant = "pos",
  branchId: branchIdProp,
  kitchenOpen: externalKitchenOpen,
  waiterCallOpen: externalWaiterCallOpen,
  onKitchenOpenChange,
  onWaiterCallOpenChange,
}: {
  variant?: "pos" | "waiter";
  branchId?: string;
  kitchenOpen?: boolean;
  waiterCallOpen?: boolean;
  onKitchenOpenChange?: (open: boolean) => void;
  onWaiterCallOpenChange?: (open: boolean) => void;
} = {}) {
  const t = useTranslations("pos.notifications");
  const { user, token } = useAuthStore(
    useShallow((s) => ({
      user: s.user,
      token: s.token,
    }))
  );

  const {
    activeBranchId,
    showReadyNotifs,
    showWaiterCallNotifs,
    playNotifSound,
    readyItems,
    setReadyItems,
    guestArrivedNotifs,
    removeGuestArrivedNotif,
    waiterCallNotifs,
    removeWaiterCallNotif,
    setSelectedTable,
  } = usePosStore(
    useShallow((s) => ({
      activeBranchId: s.activeBranchId,
      showReadyNotifs: s.showReadyNotifs,
      showWaiterCallNotifs: s.showWaiterCallNotifs,
      playNotifSound: s.playNotifSound,
      readyItems: s.readyItems,
      setReadyItems: s.setReadyItems,
      guestArrivedNotifs: s.guestArrivedNotifs,
      removeGuestArrivedNotif: s.removeGuestArrivedNotif,
      waiterCallNotifs: s.waiterCallNotifs,
      removeWaiterCallNotif: s.removeWaiterCallNotif,
      setSelectedTable: s.setSelectedTable,
    }))
  );
  const { data: tables = [] } = usePosTables(activeBranchId ?? undefined);

  const [internalKitchenOpen, internalSetKitchenOpen] = useState(false);
  const [internalWaiterCallOpen, internalSetWaiterCallOpen] = useState(false);

  const isKitchenNotifOpen = externalKitchenOpen ?? internalKitchenOpen;
  const isWaiterCallNotifOpen = externalWaiterCallOpen ?? internalWaiterCallOpen;

  const setIsKitchenNotifOpen = onKitchenOpenChange
    ? (val: boolean | ((prev: boolean) => boolean)) => {
        const next = typeof val === "function" ? val(isKitchenNotifOpen) : val;
        onKitchenOpenChange(next);
      }
    : internalSetKitchenOpen;
  const setIsWaiterCallNotifOpen = onWaiterCallOpenChange
    ? (val: boolean | ((prev: boolean) => boolean)) => {
        const next = typeof val === "function" ? val(isWaiterCallNotifOpen) : val;
        onWaiterCallOpenChange(next);
      }
    : internalSetWaiterCallOpen;
  const [waiterCallReminderTick, setWaiterCallReminderTick] = useState(0);
  const lastNotifiedCountRef = useRef(0);
  const lastReadyFetchAtRef = useRef(0);
  const readyThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateLimitRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsReadyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acknowledgingRef = useRef(false);

  const { registerReminderListener } = useWaiterCallReminders(showWaiterCallNotifs);

  useEffect(() => {
    registerReminderListener(() => setWaiterCallReminderTick((t) => t + 1));
    return () => registerReminderListener(null);
  }, [registerReminderListener]);

  useWaiterCallNotifications(showWaiterCallNotifs, branchIdProp ?? activeBranchId);

  const fetchReadyRef = useRef<() => void>(() => {});

  const runReadyItemsRequest = useCallback(async () => {
    const branchId = branchIdProp ?? usePosStore.getState().activeBranchId ?? useAuthStore.getState().user?.branch_id;
    const res =
      variant === "waiter" && branchId
        ? await api.get("/orders/items/ready-for-waiter/", { params: { branch_id: branchId } })
        : await api.get("/orders/items/?status=READY");
    const raw = res.data.results ?? res.data;
    const list: ReadyItemApiRow[] = Array.isArray(raw) ? raw : [];

    const newReadyItems = list.map((item) => ({
      id: item.id,
      product_name: item.product_name,
      table_name: item.table_name,
      quantity: item.quantity,
      status: item.status,
      unit_name: item.unit_name,
      updated_at: item.updated_at,
      station_name: item.station_name || t("kitchen"),
      order_id: item.order_id,
      order_number: item.order_number,
      order_type: item.order_type,
      waiter_acknowledged_at: item.waiter_acknowledged_at ?? null,
    }));

    setReadyItems((prev) => {
      if (acknowledgingRef.current) return prev;
      return newReadyItems;
    });

    const unacknowledgedCount = newReadyItems.filter((i) => !i.waiter_acknowledged_at).length;
    if (playNotifSound && unacknowledgedCount > lastNotifiedCountRef.current) {
      playNotificationSound("kitchen-ready");
    }
    lastNotifiedCountRef.current = unacknowledgedCount;
  }, [playNotifSound, setReadyItems, variant, branchIdProp, t]);

  const scheduleReadyFetch = useCallback(() => {
    const now = Date.now();
    const run = () => {
      void (async () => {
        lastReadyFetchAtRef.current = Date.now();
        try {
          await runReadyItemsRequest();
        } catch (e) {
          if (isAxiosError(e) && e.response?.status === 429) {
            if (rateLimitRetryRef.current) {
              clearTimeout(rateLimitRetryRef.current);
            }
            const ra = e.response.headers?.["retry-after"];
            const sec = ra != null ? parseInt(String(ra), 10) : NaN;
            const delayMs =
              Number.isFinite(sec) && sec > 0
                ? sec * 1000
                : Math.max(READY_LIST_MIN_INTERVAL_MS, 3_000);
            rateLimitRetryRef.current = setTimeout(() => {
              rateLimitRetryRef.current = null;
              lastReadyFetchAtRef.current = 0;
              fetchReadyRef.current();
            }, delayMs);
            return;
          }
          console.error(t("fetchError"), e);
        }
      })();
    };

    if (now - lastReadyFetchAtRef.current >= READY_LIST_MIN_INTERVAL_MS) {
      run();
      return;
    }
    if (readyThrottleTimerRef.current) return;
    const wait = READY_LIST_MIN_INTERVAL_MS - (now - lastReadyFetchAtRef.current);
    readyThrottleTimerRef.current = setTimeout(() => {
      readyThrottleTimerRef.current = null;
      run();
    }, wait);
  }, [runReadyItemsRequest, t]);

  const scheduleReadyFetchFromWs = useCallback(() => {
    if (wsReadyDebounceRef.current) {
      clearTimeout(wsReadyDebounceRef.current);
    }
    wsReadyDebounceRef.current = setTimeout(() => {
      wsReadyDebounceRef.current = null;
      scheduleReadyFetch();
    }, WS_READY_DEBOUNCE_MS);
  }, [scheduleReadyFetch]);

  const wsToReadyRef = useRef(scheduleReadyFetchFromWs);
  useEffect(() => {
    fetchReadyRef.current = scheduleReadyFetch;
    wsToReadyRef.current = scheduleReadyFetchFromWs;
  }, [scheduleReadyFetch, scheduleReadyFetchFromWs]);

  useEffect(() => {
    if (!canPollReadyOrders(user?.permissions, user?.is_superuser, variant)) {
      return;
    }
    const id = setInterval(() => {
      void fetchReadyRef.current();
    }, WS_HTTP_FALLBACK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [user?.permissions, user?.is_superuser, variant]);

  useEffect(() => {
    if (!token || (!showReadyNotifs && !showWaiterCallNotifs)) {
      return;
    }

    const cleanupStaffWs = subscribeSharedWebSocket(
      staffNotificationsHubKey(resolveBranchIdForWs(branchIdProp ?? activeBranchId ?? null)),
      {
      tag: "pos-staff-notifications",
      enabled: !!token,
      getUrl: () =>
        getStaffNotificationsWsUrl(
          resolveBranchIdForWs(branchIdProp ?? activeBranchId ?? null)
        ),
      onMessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "notification") {
            handleStaffNotificationPayload(payload);
          }
        } catch (e) {
          console.error("Staff WS parse error", e);
        }
      },
    }
    );

    return () => cleanupStaffWs();
  }, [token, showReadyNotifs, showWaiterCallNotifs, branchIdProp, activeBranchId]);

  useEffect(() => {
    if (!canPollReadyOrders(user?.permissions, user?.is_superuser, variant) || !token) {
      return;
    }

    const boot = window.setTimeout(() => {
      void fetchReadyRef.current();
    }, 0);

    const cleanupWs = subscribeSharedWebSocket(
      kitchenNotificationsHubKey(resolveBranchIdForWs(branchIdProp ?? activeBranchId ?? null)),
      {
      tag: "pos-notification-kitchen",
      enabled: !!token,
      getUrl: () =>
        getKitchenNotificationsWsUrl(
          resolveBranchIdForWs(branchIdProp ?? activeBranchId ?? null)
        ),
      onMessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (
            payload.type === "order_status_changed" ||
            payload.type === "kds_refresh" ||
            payload.type === "orders_updated"
          ) {
            void wsToReadyRef.current();
          }
        } catch (e) {
          console.error("WS Parse Error", e);
        }
      },
    }
    );

    return () => {
      window.clearTimeout(boot);
      if (wsReadyDebounceRef.current) clearTimeout(wsReadyDebounceRef.current);
      if (readyThrottleTimerRef.current) clearTimeout(readyThrottleTimerRef.current);
      if (rateLimitRetryRef.current) clearTimeout(rateLimitRetryRef.current);
      cleanupWs();
    };
  }, [user?.permissions, user?.is_superuser, token, variant, branchIdProp, activeBranchId]);

  const deliverItem = async (itemId: string) => {
    setReadyItems((prev) => prev.filter((i) => i.id !== itemId));
    try {
      await api.post(`/orders/items/${itemId}/set_status/`, { status: "DELIVERED" });
    } catch (e) {
      console.error("Teslimat hatası:", e);
    } finally {
      scheduleReadyFetch();
    }
  };

  const acknowledgeAll = async () => {
    if (acknowledgingRef.current) return;
    const currentReadyItems = usePosStore.getState().readyItems;
    const unacknowledged = currentReadyItems.filter((i) => !i.waiter_acknowledged_at);
    if (unacknowledged.length === 0) return;
    const ids = unacknowledged.map((i) => i.id);
    const now = new Date().toISOString();
    acknowledgingRef.current = true;

    setReadyItems((prev) =>
      prev.map((i) =>
        ids.includes(i.id) ? { ...i, waiter_acknowledged_at: now } : i
      )
    );

    try {
      await api.post("/orders/items/bulk-acknowledge/", { ids });
    } catch (e) {
      console.error("Toplu görüldü işareti hatası:", e);
      setReadyItems((prev) =>
        prev.map((i) =>
          ids.includes(i.id) ? { ...i, waiter_acknowledged_at: null } : i
        )
      );
    } finally {
      acknowledgingRef.current = false;
      scheduleReadyFetch();
    }
  };

  const readyByTable = useMemo(
    () =>
      groupReadyNotificationItems(readyItems).map(
        (g): ReadyByTableGroup => ({
          key: g.key,
          tableLabel: g.groupLabel,
          items: g.items,
        })
      ),
    [readyItems]
  );
  const visibleReadyCount = showReadyNotifs
    ? readyItems.filter((i) => !i.waiter_acknowledged_at).length
    : 0;
  const visibleWaiterCallCount = showWaiterCallNotifs ? waiterCallNotifs.length : 0;
  const kitchenBadgeCount = visibleReadyCount + guestArrivedNotifs.length;
  const showKitchenPanel = showReadyNotifs;

  const openTableFromWaiterCall = (tableId?: string) => {
    if (!tableId) return;
    const table = tables.find((tbl) => String(tbl.id) === String(tableId));
    if (table) {
      setSelectedTable(table);
      setIsWaiterCallNotifOpen(false);
    }
  };

  const markWaiterCallSeen = (id: string) => {
    removeWaiterCallNotif(id);
    const branchId = resolveBranchIdForWs(branchIdProp ?? activeBranchId ?? null);
    if (branchId) {
      void dismissWaiterCalls({ branchId, callId: id }).catch((e) =>
        console.error("Waiter call dismiss sync failed", e)
      );
    }
  };

  const markAllWaiterCallsSeen = () => {
    const ids = waiterCallNotifs.map((n) => n.id);
    ids.forEach((id) => removeWaiterCallNotif(id));
    const branchId = resolveBranchIdForWs(branchIdProp ?? activeBranchId ?? null);
    if (branchId) {
      void dismissWaiterCalls({ branchId, dismissAll: true }).catch((e) =>
        console.error("Waiter call dismiss-all sync failed", e)
      );
    }
  };

  if (!showKitchenPanel && !showWaiterCallNotifs) return null;

  const isExternalMode = !!onKitchenOpenChange;

  const fabSizeClass =
    variant === "waiter" ? "h-12 w-12 rounded-full" : "h-14 w-14 rounded-2xl";

  return (
    <div
      className={cn(
        "flex flex-col items-end gap-2 sm:gap-3",
        isExternalMode
          ? "fixed z-50 right-3 sm:right-6 top-[4.5rem]"
          : "fixed z-50",
        !isExternalMode && variant === "waiter"
          ? "left-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:left-4 lg:bottom-6 lg:left-6"
          : !isExternalMode && "bottom-6 left-6"
      )}
    >
      {showWaiterCallNotifs && (
        <WaiterCallNotifsPanel
          isWaiterCallNotifOpen={isWaiterCallNotifOpen}
          waiterCallNotifs={waiterCallNotifs as unknown as WaiterCallNotif[]}
          waiterCallReminderTick={waiterCallReminderTick}
          markAllWaiterCallsSeen={markAllWaiterCallsSeen}
          openTableFromWaiterCall={openTableFromWaiterCall}
          markWaiterCallSeen={markWaiterCallSeen}
          setIsWaiterCallNotifOpen={setIsWaiterCallNotifOpen}
          t={t as unknown as (key: string, values?: Record<string, string | number>) => string}
        />
      )}

      {showKitchenPanel && (
        <KitchenNotifsPanel
          isKitchenNotifOpen={isKitchenNotifOpen}
          readyItems={readyItems}
          readyByTable={readyByTable}
          guestArrivedNotifs={guestArrivedNotifs as unknown as GuestArrivedNotif[]}
          visibleReadyCount={visibleReadyCount}
          acknowledgeAll={acknowledgeAll}
          deliverItem={deliverItem}
          removeGuestArrivedNotif={removeGuestArrivedNotif}
          setIsKitchenNotifOpen={setIsKitchenNotifOpen}
          showReadyNotifs={showReadyNotifs}
          t={t as unknown as (key: string, values?: Record<string, string | number>) => string}
        />
      )}

      {!isExternalMode && showWaiterCallNotifs && (
        <button
          onClick={() => setIsWaiterCallNotifOpen(!isWaiterCallNotifOpen)}
          type="button"
          className={cn(
            "relative flex items-center justify-center shadow-lg transition-[color,background-color,box-shadow,transform] active:scale-95",
            fabSizeClass,
            visibleWaiterCallCount > 0
              ? "motion-safe:animate-bounce-soft bg-amber-500 text-white shadow-amber-500/40 [animation-iteration-count:3] dark:bg-amber-600"
              : "bg-slate-800 text-muted-foreground bg-accent text-muted-foreground",
            visibleWaiterCallCount > 0 && waiterCallReminderTick > 0
              ? "motion-safe:animate-bounce-soft [animation-iteration-count:3]"
              : null
          )}
          title={t("tableCallsTitle")}
        >
          <Radio
            size={24}
            className={
              isWaiterCallNotifOpen ? "" : ""
            }
          />
          {visibleWaiterCallCount > 0 && (
            <span className="absolute -top-1.5 -left-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-sub font-bold text-white shadow-lg ring-4 ring-slate-50 dark:ring-slate-900">
              {visibleWaiterCallCount}
            </span>
          )}
        </button>
      )}

      {!isExternalMode && showKitchenPanel && (
        <button
          onClick={() => setIsKitchenNotifOpen(!isKitchenNotifOpen)}
          type="button"
          className={cn(
            "relative flex items-center justify-center shadow-lg transition-[color,background-color,box-shadow,transform] active:scale-95",
            fabSizeClass,
            kitchenBadgeCount > 0
              ? "motion-safe:animate-bounce-soft bg-emerald-600 text-white shadow-emerald-500/40 [animation-iteration-count:3]"
              : "bg-slate-800 text-muted-foreground bg-accent text-muted-foreground"
          )}
          title={t("kitchenTitle")}
        >
          {kitchenBadgeCount > 0 ? (
            <Bell
              size={24}
              className={isKitchenNotifOpen ? "" : "motion-safe:animate-swing [animation-iteration-count:1]"}
            />
          ) : (
            <Bell size={24} />
          )}
          {kitchenBadgeCount > 0 && (
            <span className="absolute -top-1.5 -left-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-sub font-bold text-white shadow-lg ring-4 ring-slate-50 dark:ring-slate-900">
              {kitchenBadgeCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
