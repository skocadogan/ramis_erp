"use client";

import { CheckSquare, Eye, Radio, X } from "lucide-react";

export interface WaiterCallNotif {
  id: string;
  message: string;
  timestamp: number;
  source?: string;
  tableId?: string;
  reminderPulse?: number;
}

interface WaiterCallNotifsPanelProps {
  isWaiterCallNotifOpen: boolean;
  waiterCallNotifs: WaiterCallNotif[];
  waiterCallReminderTick: number;
  markAllWaiterCallsSeen: () => void;
  openTableFromWaiterCall: (tableId?: string) => void;
  markWaiterCallSeen: (id: string) => void;
  setIsWaiterCallNotifOpen: (open: boolean) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}

export function WaiterCallNotifsPanel({
  isWaiterCallNotifOpen,
  waiterCallNotifs,
  waiterCallReminderTick,
  markAllWaiterCallsSeen,
  openTableFromWaiterCall,
  markWaiterCallSeen,
  setIsWaiterCallNotifOpen,
  t,
}: WaiterCallNotifsPanelProps) {
  if (!isWaiterCallNotifOpen) return null;

  return (
    <div className="mb-2 flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-2xl border border-amber-200 bg-card shadow-xl motion-safe:animate-in motion-safe:slide-in-from-bottom-5 duration-300 dark:border-amber-800/50 sm:w-96">
      <div className="flex items-center justify-between bg-amber-500 p-4 text-white dark:bg-amber-600">
        <div className="flex items-center gap-2">
          <Radio size={18} />
          <h3 className="font-ui-bold tracking-tight">{t("tableCallsTitle")}</h3>
        </div>
        <div className="flex items-center gap-2">
          {waiterCallNotifs.length > 0 && (
            <button
              type="button"
              onClick={markAllWaiterCallsSeen}
              className="rounded bg-white/20 px-2 py-1 text-[11px] font-ui-bold transition-colors hover:bg-white/30"
            >
              {t("markAllSeen")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsWaiterCallNotifOpen(false)}
            className="rounded-lg p-1 transition-colors hover:bg-amber-400/80"
            title={t("close")}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-amber-50/60 p-3 dark:bg-amber-950/20">
        {waiterCallNotifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <CheckSquare size={32} className="mb-2 opacity-20" />
            <span className="text-sm font-ui-medium">{t("noTableCalls")}</span>
          </div>
        ) : (
          waiterCallNotifs.map((notif) => (
            <div
              key={`${notif.id}-${notif.reminderPulse ?? 0}-${waiterCallReminderTick}`}
              className="relative flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white/80 p-3 shadow-sm motion-safe:animate-in motion-safe:slide-in-from-right-5 dark:border-amber-800/40 dark:bg-amber-900/30"
            >
              <button
                type="button"
                onClick={() => openTableFromWaiterCall(notif.tableId)}
                className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
              >
                {notif.source === "reservation_due" && (
                  <span className="text-2xs font-ui-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                    {t("reservationDue")}
                  </span>
                )}
                {notif.source === "reservation_arrived" && (
                  <span className="text-2xs font-ui-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                    {t("reservationArrived")}
                  </span>
                )}
                <p className="text-sm font-ui-semibold text-slate-800 dark:text-slate-100">
                  {notif.message}
                </p>
                <span className="text-2xs text-muted-foreground">
                  {new Date(notif.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </button>
              <button
                type="button"
                onClick={() => markWaiterCallSeen(notif.id)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-100 px-2.5 py-1.5 text-xs font-ui-bold text-amber-800 transition-colors hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/50 dark:text-amber-200 dark:hover:bg-amber-900/70"
                title={t("markSeen")}
              >
                <Eye size={14} />
                {t("markSeen")}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
