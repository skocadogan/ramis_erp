"use client";

import { Bell, CheckSquare, X } from "lucide-react";
import type { ReadyItem } from "@/types/pos";
import { ReadyByTableGroup } from "./ReadyByTableGroup";

export interface GuestArrivedNotif {
  id: string;
  message: string;
  timestamp: number;
}

interface KitchenNotifsPanelProps {
  isKitchenNotifOpen: boolean;
  readyItems: ReadyItem[];
  readyByTable: { key: string; tableLabel: string; items: ReadyItem[] }[];
  guestArrivedNotifs: GuestArrivedNotif[];
  visibleReadyCount: number;
  acknowledgeAll: () => void;
  deliverItem: (itemId: string) => void;
  removeGuestArrivedNotif: (id: string) => void;
  setIsKitchenNotifOpen: (open: boolean) => void;
  showReadyNotifs: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
}

export function KitchenNotifsPanel({
  isKitchenNotifOpen,
  readyItems,
  readyByTable,
  guestArrivedNotifs,
  visibleReadyCount,
  acknowledgeAll,
  deliverItem,
  removeGuestArrivedNotif,
  setIsKitchenNotifOpen,
  showReadyNotifs,
  t,
}: KitchenNotifsPanelProps) {
  if (!isKitchenNotifOpen) return null;

  return (
    <div className="mb-2 flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl motion-safe:animate-in motion-safe:slide-in-from-bottom-5 duration-300 border-border sm:w-96">
      <div className="flex items-center justify-between bg-emerald-600 p-4 text-white">
        <div className="flex items-center gap-2">
          <Bell size={18} className="motion-safe:animate-swing [animation-iteration-count:1]" />
          <h3 className="font-bold tracking-tight">{t("kitchenTitle")}</h3>
        </div>
        <div className="flex items-center gap-2">
          {readyItems.some((i) => !i.waiter_acknowledged_at) && (
            <button
              type="button"
              onClick={acknowledgeAll}
              className="rounded bg-white/20 px-2 py-1 text-sub font-bold transition-colors hover:bg-white/30"
            >
              {t("markAllRead")}
            </button>
          )}
          {guestArrivedNotifs.length > 0 && visibleReadyCount === 0 && (
            <button
              type="button"
              onClick={() => guestArrivedNotifs.forEach((n) => removeGuestArrivedNotif(n.id))}
              className="rounded bg-white/20 px-2 py-1 text-sub font-bold transition-colors hover:bg-white/30"
            >
              {t("deleteAll")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsKitchenNotifOpen(false)}
            className="rounded-lg p-1 transition-colors hover:bg-emerald-500"
            title={t("close")}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50/50 p-3 bg-muted/40">
        {readyItems.length === 0 && guestArrivedNotifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground dark:text-muted-foreground">
            <CheckSquare size={32} className="mb-2 opacity-20" />
            <span className="text-sm font-medium">{t("noNotifications")}</span>
          </div>
        ) : (
          <>
            {guestArrivedNotifs.map((notif) => (
              <div
                key={notif.id}
                className="relative flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3 shadow-sm motion-safe:animate-in motion-safe:slide-in-from-right-5 dark:border-blue-900/30 dark:bg-blue-900/20"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sub font-bold text-blue-600 dark:text-blue-400">
                    {t("guestArrived")}
                  </span>
                  <p className="text-sm font-semibold text-slate-800 text-foreground">
                    {notif.message}
                  </p>
                  <span className="text-2xs text-muted-foreground dark:text-muted-foreground">
                    {new Date(notif.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeGuestArrivedNotif(notif.id)}
                  className="rounded-full bg-blue-100 p-1.5 text-blue-600 hover:bg-blue-200 dark:bg-blue-800/40 dark:text-blue-400 dark:hover:bg-blue-800/60"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {showReadyNotifs &&
              readyByTable.map((group) => (
                <ReadyByTableGroup
                  key={group.key}
                  group={group}
                  deliverItem={deliverItem}
                  t={t}
                />
              ))}
          </>
        )}
      </div>
    </div>
  );
}
