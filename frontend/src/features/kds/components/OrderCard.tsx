import { useState, useEffect, useMemo, memo } from "react";
import { useTranslations } from "next-intl";
import { Clock, CheckCircle2, Timer, MoreHorizontal, Zap, RotateCcw, ClipboardList } from "lucide-react";
import { useCountdown } from "@/hooks/useCountdown";
import type { GroupedOrder, KdsItemHistoryEntry, KdsPeerPendingLine } from "../types";
import { kdsTableMergeKey } from "../utils/kdsTableKey";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { postKdsFiringForceNow, postKdsFiringSnooze } from "../services/kdsApi";
import { toastApiError } from "@/lib/operationalToast";
import { formatNumber } from "@/lib/formatters";
import { KdsOrderNotesModal } from "./KdsOrderNotesModal";
import { buildKdsDisplayRows } from "../utils/kdsCombinedDisplay";
import type { OrderItem } from "../types";


interface OrderCardProps {
  group: GroupedOrder;
  /** Bu masa için başka KDS’lerde PENDING / PREPARING kalan satırlar (tam liste; kart içinde süzülür). */
  peerPendingLines: KdsPeerPendingLine[];
  itemHistory: Record<string, KdsItemHistoryEntry>;
  onUpdateStatus: (itemId: string, status: string) => void;
  /** Üst ızgaradan: render içi `Date.now` yerine ortak saat (purity) */
  nowMs: number;
  /** Smart Firing v2 (şimdi zamanla / ertele menüsü); `PERMISSION_ORDERS_MANAGE_SMART_FIRING` veya `orders.manage_order` */
  canUseSmartFiringActions?: boolean;
}

/** Üstte zaten "Masa" etiketi varken başlıkta "Masa 1" → "1" (MASA Masa 1 tekrarını kaldırır). */
function kdsTableHeadlineDisplay(tableName: string): string {
  const t = tableName.trim();
  if (!t) return "—";
  if (/^masa\s+/i.test(t)) {
    const rest = t.replace(/^masa\s+/i, "").trim();
    return rest || t;
  }
  return t;
}



/** Smart Firing için canlı geri sayım (requestAnimationFrame destekli, 1 saniye tick) */
function KdsFireCountdown({ scheduledStartTs, status }: { scheduledStartTs: number; status: string }) {
  const t = useTranslations('kds');
  const { remaining, formatted } = useCountdown(
    status === 'PENDING' ? scheduledStartTs : null,
  );

  if (status !== 'PENDING' || remaining <= 0 || !formatted) return null;

  return (
    <div className="mt-1 flex w-fit items-center gap-1 rounded border border-kds-warning/80 bg-kds-warning/10 px-2 py-0.5 text-2xs font-ui-bold text-kds-warning">
      <button
        className="flex items-center gap-1"
        aria-label={t('smartFiring.options')}
      >
        <Timer size={12} className="shrink-0" aria-hidden />
        <span>{formatted}</span>
      </button>
    </div>
  );
}

/** PERF: Yeni gelen ürünlerdeki pulse efekti için izole bileşen */
function RecentChangePulse({
  lastChangeTs,
  nowMs,
  children,
}: {
  lastChangeTs: number;
  nowMs: number;
  children: React.ReactNode;
}) {
  const [isActive, setIsActive] = useState(() => nowMs - lastChangeTs < 15_000);

  useEffect(() => {
    setIsActive(nowMs - lastChangeTs < 15_000);
  }, [nowMs, lastChangeTs]);

  useEffect(() => {
    if (!isActive) return;
    const timeout = setTimeout(() => setIsActive(false), 15_000);
    return () => clearTimeout(timeout);
  }, [isActive, lastChangeTs]);

  return (
    <span
      className={
        isActive ? "inline-block rounded-l-sm border-l-4 border-amber-500 pl-2" : "inline-block"
      }
    >
      {children}
    </span>
  );
}

function KdsFiringOverflow({ itemId }: { itemId: string }) {
  const t = useTranslations('kds');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toastApiError(e, t('errors.scheduleUpdateFailed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 border border-border bg-card text-foreground"
            disabled={busy}
            aria-label={t('smartFiring.options')}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-48 bg-card border-border text-foreground">
        <DropdownMenuItem onClick={() => void run(() => postKdsFiringForceNow(itemId))} className="focus:bg-muted">
          <Zap size={14} className="mr-2" />
          {t('smartFiring.scheduleNow')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void run(() => postKdsFiringSnooze(itemId, 5))} className="focus:bg-muted">
          <Clock size={14} className="mr-2" />
          {t('actions.snooze')} (5 {t('status.late_min_abbr') || 'dk'})
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type KdsItemRowProps = {
  item: OrderItem;
  itemHistory: Record<string, KdsItemHistoryEntry>;
  nowMs: number;
  nested?: boolean;
  onUpdateStatus: (itemId: string, status: string) => void;
  canUseSmartFiringActions: boolean;
};

function KdsItemRow({
  item,
  itemHistory,
  nowMs,
  nested = false,
  onUpdateStatus,
  canUseSmartFiringActions,
}: KdsItemRowProps) {
  const t = useTranslations("kds");
  const hist = itemHistory[item.id];
  const isCancelled = item.status === "CANCELLED";
  const isReady = item.status === "READY";

  const schedTs = item.scheduled_start_time ? new Date(item.scheduled_start_time).getTime() : null;
  const pendingLate =
    item.status === "PENDING" &&
    (item.firing_state === "late" || (schedTs !== null && schedTs <= nowMs));
  const pendingPlanned =
    item.status === "PENDING" &&
    !pendingLate &&
    (item.firing_state === "scheduled" ||
      item.firing_state === "due" ||
      (schedTs !== null && schedTs > nowMs));

  const firingAccent = pendingLate
    ? "border-l-4 border-kds-late"
    : pendingPlanned
      ? "border-l-4 border-kds-warning"
      : "";

  const itemRowBg = isReady
    ? "bg-emerald-500/5"
    : pendingLate
      ? "bg-kds-late text-kds-late-foreground shadow-inner"
      : "bg-transparent";

  const showCombinedPartsInline =
    !nested &&
    item.is_combined_product &&
    Array.isArray(item.combined_parts) &&
    item.combined_parts.length > 0;

  return (
    <div
      className={`group relative flex flex-col transition-colors ${nested ? "px-3 py-2 pl-6" : "px-3 py-2.5"} ${itemRowBg} ${firingAccent}`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`shrink-0 text-[15px] font-ui-bold ${isCancelled ? "text-red-200" : pendingLate ? "text-white" : "text-foreground"}`}
        >
          {item.quantity}x
        </span>

        <div className="min-w-0 flex-1">
          <RecentChangePulse lastChangeTs={hist?.changeTimestamp || 0} nowMs={nowMs}>
            <span
              className={`break-words text-[15px] font-ui-bold leading-snug ${isCancelled ? "text-red-100/70 line-through" : pendingLate ? "text-white" : "text-foreground"} ${isReady ? "text-emerald-600 dark:text-emerald-400" : ""} ${nested ? "text-[14px]" : ""}`}
            >
              {item.product_name}
              {!nested && item.is_combined_product ? (
                <span
                  className={`ml-1.5 align-middle text-[9px] font-ui-black uppercase tracking-wider ${pendingLate ? "text-white/90" : "text-purple-600 dark:text-purple-400"}`}
                >
                  {t("ticket.combinedBadge")}
                </span>
              ) : null}
            </span>
          </RecentChangePulse>
          {showCombinedPartsInline ? (
            <div
              className={`mt-1.5 rounded-md border px-2 py-1.5 ${pendingLate ? "border-white/30 bg-white/10" : "border-purple-500/25 bg-purple-500/5 dark:bg-purple-950/30"}`}
            >
              <p
                className={`mb-1 text-[9px] font-ui-black uppercase tracking-wider ${pendingLate ? "text-white/90" : "text-purple-700 dark:text-purple-300"}`}
              >
                {t("ticket.combinedContents")}
              </p>
              <ul className="space-y-0.5">
                {item.combined_parts!.map((p, idx) => (
                  <li
                    key={`${p.product_name}-${idx}`}
                    className={`flex flex-wrap items-baseline gap-x-1 text-[11px] font-ui-semibold leading-tight ${pendingLate ? "text-white/95" : "text-muted-foreground"}`}
                  >
                    <span className="font-ui-bold tabular-nums">
                      {formatNumber(p.quantity_total, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 4,
                      })}
                      ×
                    </span>
                    <span>{p.product_name}</span>
                    {p.unit_name ? (
                      <span
                        className={`text-[10px] uppercase ${pendingLate ? "text-white/75" : "opacity-80"}`}
                      >
                        ({p.unit_name})
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-1 flex flex-col">
        {pendingLate && (
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-ui-black uppercase tracking-[0.15em] text-white/80">
            <Zap size={14} className="fill-white" />
            <span>{t("ticket.fireNow")}</span>
          </div>
        )}

        {item.scheduled_start_time && (
          <KdsFireCountdown
            scheduledStartTs={new Date(item.scheduled_start_time).getTime()}
            status={item.status}
          />
        )}

        {(item.notes || item.unit_name || (item.modifiers && item.modifiers.length > 0)) && (
          <div className="mt-0.5 space-y-0.5">
            {item.unit_name && (
              <span
                className={`text-[11px] font-ui-bold uppercase ${pendingLate ? "text-white/90" : "text-muted-foreground"}`}
              >
                {item.unit_name}
              </span>
            )}
            {item.modifiers?.map((mod) => (
              <span
                key={mod.id}
                className={`block text-[11px] font-ui-semibold ${pendingLate ? "text-white/90" : "text-emerald-700 dark:text-emerald-400"}`}
              >
                + {mod.modifier_name}
              </span>
            ))}
            {item.notes && (
              <p
                className={`font-ui-semibold uppercase leading-tight text-[11px] ${pendingLate ? "text-white/90" : "text-muted-foreground"}`}
              >
                {item.notes}
              </p>
            )}
          </div>
        )}

        {isCancelled && (
          <p
            className={`mt-1 text-[11px] font-ui-bold uppercase tracking-wide ${pendingLate ? "text-white" : "text-red-600"}`}
          >
            CANCELED! {item.quantity}x-{item.product_name}
          </p>
        )}

        {hist?.lastChangeType === "PLUS" && nowMs - (hist.changeTimestamp ?? 0) < 300_000 && (
          <span
            className={`mt-1 text-[10px] font-ui-bold uppercase ${pendingLate ? "text-white" : "text-emerald-600"}`}
          >
            + {t("ticket.addon")}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
        <div className="flex flex-1 items-center gap-2">
          {item.status === "PENDING" && (
            <>
              <button
                onClick={() => onUpdateStatus(item.id, "PREPARING")}
                className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 font-ui-black uppercase tracking-wider shadow-sm transition-colors active:scale-95 ${
                  pendingLate
                    ? "bg-kds-late-foreground text-kds-late shadow-md ring-2 ring-kds-late-foreground/80 hover:bg-kds-late-foreground/95"
                    : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/30"
                }`}
                title={t("actions.prepare")}
              >
                <Clock size={20} strokeWidth={3} />
                <span className="text-[11px]">{t("actions.prepare")}</span>
              </button>
              {canUseSmartFiringActions && <KdsFiringOverflow itemId={item.id} />}
            </>
          )}
          {item.status === "PREPARING" && (
            <button
              onClick={() => onUpdateStatus(item.id, "READY")}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 font-ui-black uppercase tracking-wider text-white shadow-sm shadow-green-500/30 transition-colors hover:bg-green-700 active:scale-95"
              title={t("status.ready")}
            >
              <CheckCircle2 size={20} strokeWidth={3} />
              <span className="text-[11px]">{t("status.ready")}</span>
            </button>
          )}
          {item.status === "READY" && (
            <button
              onClick={() => onUpdateStatus(item.id, "PENDING")}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 text-white shadow-sm shadow-amber-500/30 transition-colors hover:bg-amber-600 active:scale-95"
              title={t("actions.undo") || "Geri Al"}
            >
              <RotateCcw size={20} strokeWidth={3} />
              <span className="text-[11px]">{t("actions.undo") || "Geri Al"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function OrderCardImpl({
  group,
  peerPendingLines,
  itemHistory,
  onUpdateStatus,
  nowMs,
  canUseSmartFiringActions = false,
}: OrderCardProps) {
  const t = useTranslations("kds");
  const [snoozeAllBusy, setSnoozeAllBusy] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const peerForThisTable = useMemo(() => {
    if (group.order_type !== "TABLE") return [];
    const k = kdsTableMergeKey(group.table_name);
    return peerPendingLines.filter((p) => kdsTableMergeKey(p.table_name) === k);
  }, [group.order_type, group.table_name, peerPendingLines]);

  const visibleItems = group.items
    .filter((item) => {
      if (item.status !== "CANCELLED") return true;
      return nowMs - item.updated_at_ts < 5000;
    })
    .sort((a, b) => {
      const aTime = a.scheduled_start_time
        ? new Date(a.scheduled_start_time).getTime()
        : a.order_created_at_ts || 0;
      const bTime = b.scheduled_start_time
        ? new Date(b.scheduled_start_time).getTime()
        : b.order_created_at_ts || 0;
      if (aTime !== bTime) {
        return aTime - bTime;
      }
      return String(a.id || "").localeCompare(String(b.id || ""));
    });

  const displayRows = useMemo(() => buildKdsDisplayRows(visibleItems), [visibleItems]);

  const initialWaitMinutes = Math.floor((nowMs - group.oldest_created_at_ts) / 60000);
  const isUrgent = initialWaitMinutes > 15;

  return (
    <div
      className={`flex h-full max-h-full min-h-0 w-full flex-col overflow-hidden border border-border bg-card transition-shadow duration-300 ${isUrgent ? "ring-1 ring-kds-urgent/30" : "ring-1 ring-kds-normal/20"
        }`}
    >
      {/* Smart Firing: Top Accent Bar */}
      {(() => {
        const worstState = group.items.reduce((acc, item) => {
          if (item.status !== "PENDING") return acc;
          const schedTs = item.scheduled_start_time ? new Date(item.scheduled_start_time).getTime() : null;
          const isLate = item.firing_state === "late" || (schedTs !== null && schedTs <= nowMs);
          if (isLate) return "late";
          const isPlanned =
            item.firing_state === "scheduled" ||
            item.firing_state === "due" ||
            (schedTs !== null && schedTs > nowMs);
          if (isPlanned && acc !== "late") return "planned";
          return acc;
        }, "none" as "none" | "planned" | "late");

        if (worstState === "late") {
          return (
            <div className="absolute top-0 left-0 z-30 h-1.5 w-full bg-kds-late/70 shadow-[0_0_12px_rgba(244,63,94,0.6)]" />
          );
        }
        if (worstState === "planned") {
          return <div className="absolute top-0 left-0 z-30 h-1 w-full bg-kds-warning/80" />;
        }
        return null;
      })()}

      {/* Header — Image 1 Style */}
      <div
        className={`relative flex shrink-0 flex-col px-3 py-2 transition-colors duration-300 ${isUrgent ? "bg-kds-urgent text-kds-urgent-foreground" : "bg-kds-normal text-kds-normal-foreground"
          }`}
      >
        <div className="flex items-center justify-between font-ui-bold text-[13px] leading-tight">
          <span>
            {new Date(group.oldest_created_at_ts).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <div className="flex items-center gap-2">
            <span className="max-w-[100px] truncate">{group.user_name || "—"}</span>
            <span>#{group.order_number || group.order_id.slice(-4).toUpperCase()}</span>
          </div>
        </div>
        <div className="mt-1 text-[15px] font-ui-bold uppercase tracking-tight flex items-center justify-between">
          <div>
            {t("ticket.table")}: {kdsTableHeadlineDisplay(group.table_name)}
            {group.order_type === "TAKEAWAY" && (
              <span className="ml-2 rounded bg-white/20 px-1 text-[10px]">
                {t("ticket.takeaway")}
              </span>
            )}
          </div>
          {group.notes && group.notes.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowNotesModal(true);
              }}
              className="flex items-center gap-1 bg-kds-warning text-kds-warning-foreground border border-kds-warning/80 font-ui-black px-2 py-0.5 rounded-full text-[10px] hover:bg-kds-warning/80 active:scale-95 transition-colors shadow-[0_0_8px_rgba(234,179,8,0.6)]"
              title={t("ticket.notes") || "Açıklamalar"}
            >
              <ClipboardList size={12} className="shrink-0" />
              <span>{group.notes.length}</span>
            </button>
          )}
        </div>
      </div>

      {peerForThisTable.length > 0 && (
        <div className="space-y-1 border-b border-kds-warning/20 bg-kds-warning/5 px-3 py-1.5">
          {peerForThisTable.map((line, idx) => (
            <p key={idx} className="text-[10px] font-ui-semibold text-kds-warning">
              <span className="font-ui-bold text-kds-warning">{line.station_name}</span>{" "}
              {line.quantity}x {line.product_name} {t("status.pending")}
            </p>
          ))}
        </div>
      )}

      {/* Body: Card background, simple list with dividers */}
      <div className="flex-1 divide-y divide-border overflow-y-auto">
        {displayRows.map((row) => {
          if (row.type === "single") {
            return (
              <KdsItemRow
                key={row.item.id}
                item={row.item}
                itemHistory={itemHistory}
                nowMs={nowMs}
                onUpdateStatus={onUpdateStatus}
                canUseSmartFiringActions={canUseSmartFiringActions}
              />
            );
          }

          return (
            <div key={row.parentItemId} className="flex flex-col divide-y divide-border/60">
              <div className="border-b border-purple-500/20 bg-purple-500/5 px-3 py-2.5 dark:bg-purple-950/20">
                <div className="flex items-start gap-2.5">
                  <span className="shrink-0 text-[15px] font-ui-bold text-foreground">
                    {row.parentQty}x
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[15px] font-ui-bold leading-snug text-foreground">
                      {row.parentName}
                    </p>
                    <p className="mt-1 text-[10px] font-ui-black uppercase tracking-wider text-purple-700 dark:text-purple-300">
                      {t("ticket.combinedContents")}
                    </p>
                  </div>
                </div>
              </div>
              {row.components.map((component) => (
                <KdsItemRow
                  key={component.id}
                  item={component}
                  itemHistory={itemHistory}
                  nowMs={nowMs}
                  nested
                  onUpdateStatus={onUpdateStatus}
                  canUseSmartFiringActions={canUseSmartFiringActions}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Footer Actions (Subtle) */}
      <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-muted/20 p-2">
        {canUseSmartFiringActions && group.items.some((i) => i.status === "PENDING") && (
          <button
            type="button"
            disabled={snoozeAllBusy}
            onClick={() => {
              const pending = group.items.filter((i) => i.status === "PENDING");
              if (pending.length === 0) return;
              setSnoozeAllBusy(true);
              void (async () => {
                try {
                  await Promise.all(pending.map((i) => postKdsFiringSnooze(i.id, 5)));
                } catch (e) {
                  toastApiError(e, t("errors.scheduleUpdateFailed"));
                } finally {
                  setSnoozeAllBusy(false);
                }
              })();
            }}
            className="flex w-full items-center justify-center gap-2 rounded py-2 text-[11px] font-ui-bold uppercase tracking-wider border border-kds-warning/50 bg-kds-warning/15 text-kds-warning-foreground shadow-sm transition-colors hover:bg-kds-warning/25 disabled:opacity-60 dark:text-kds-warning-foreground dark:hover:bg-kds-warning/20"
          >
            <Timer size={16} strokeWidth={2.5} className="shrink-0" />
            {t("actions.snoozeAllPending5Min")}
          </button>
        )}
        {group.items.some((i) => i.status === "PENDING" || i.status === "PREPARING") && (
          <button
            type="button"
            onClick={() => {
              group.items
                .filter((i) => i.status === "PENDING" || i.status === "PREPARING")
                .forEach((i) => onUpdateStatus(i.id, "READY"));
            }}
            className={`flex-1 rounded py-2 text-[11px] font-ui-bold uppercase tracking-wider shadow-sm transition-colors ${isUrgent ? "bg-kds-urgent text-kds-urgent-foreground hover:bg-kds-urgent/90" : "bg-kds-normal text-kds-normal-foreground hover:bg-kds-normal/90"
              }`}
          >
            {t("actions.markAllReady")}
          </button>
        )}
      </div>
      {group.notes && (
        <KdsOrderNotesModal
          open={showNotesModal}
          notes={group.notes}
          tableName={group.table_name}
          onClose={() => setShowNotesModal(false)}
        />
      )}
    </div>
  );
}

export const OrderCard = memo(OrderCardImpl, (prev, next) => {
  const isGroupSame =
    prev.group.order_id === next.group.order_id &&
    prev.group.max_updated_at_ts === next.group.max_updated_at_ts;

  if (!isGroupSame) return false;
  // notes: string[] | undefined — uzunluk + sıralı eleman karşılaştırması yeterli.
  // (Önceki JSON.stringify her saniye tüm kartlar için çalışıyordu — KDS 1Hz saatinde pahalı.)
  const prevNotes = prev.group.notes;
  const nextNotes = next.group.notes;
  const prevLen = prevNotes?.length ?? 0;
  const nextLen = nextNotes?.length ?? 0;
  if (prevLen !== nextLen) return false;
  for (let i = 0; i < prevLen; i++) {
    if (prevNotes![i] !== nextNotes![i]) return false;
  }
  if (prev.canUseSmartFiringActions !== next.canUseSmartFiringActions) return false;
  if (Math.floor(prev.nowMs / 5000) !== Math.floor(next.nowMs / 5000)) return false;

  // Check item history ONLY for this group's items
  const historySame = prev.group.items.every(
    (item) => prev.itemHistory[item.id] === next.itemHistory[item.id]
  );
  if (!historySame) return false;

  // Check peer pending lines ONLY for this group's table
  if (prev.group.order_type === "TABLE") {
    const k = kdsTableMergeKey(prev.group.table_name);
    const prevPeers = prev.peerPendingLines.filter((p) => kdsTableMergeKey(p.table_name) === k);
    const nextPeers = next.peerPendingLines.filter((p) => kdsTableMergeKey(p.table_name) === k);

    if (prevPeers.length !== nextPeers.length) return false;

    for (let i = 0; i < prevPeers.length; i++) {
      const p = prevPeers[i];
      const n = nextPeers[i];
      if (
        p.station_name !== n.station_name ||
        p.product_name !== n.product_name ||
        p.quantity !== n.quantity
      ) {
        return false;
      }
    }
  }

  return true;
});
