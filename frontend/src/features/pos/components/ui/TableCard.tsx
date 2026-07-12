import { ReceiptText, Sparkles, CheckCircle2, User, Users, Clock, Check, UtensilsCrossed, ChefHat, CalendarClock, Ban, Brush, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Table } from "@/types/pos";
import {
  formatCleaningCountdown,
  useAutoFinishCleaningOnExpire,
  useCleaningCountdown,
} from "@/hooks/useCleaningCountdown";
import { memo, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import api from "@/lib/api";
import { isActiveOrderStatus } from "@/features/orders/constants/activeOrderStatuses";
import { tablesApi } from "@/features/tables/services/tablesApi";
import type { OrderDetail } from "@/features/tables/components/TableOrderModal/types";

interface TableCardProps {
  table: Table;
  onSelect: (table: Table) => void;
  onOpenOrderModal: (table: Table) => void;
  onStartCleaning?: (table: Table) => void;
  onFinishCleaning?: (table: Table, options?: { silent?: boolean }) => void;
}

const TableCard = memo(function TableCard({
  table,
  onSelect,
  onOpenOrderModal,
  onStartCleaning,
  onFinishCleaning,
}: TableCardProps) {
  const t = useTranslations("pos.table");
  const queryClient = useQueryClient();
  const [openingOrphan, setOpeningOrphan] = useState(false);

  const hasOrphanOrder =
    table.status === "FREE" && !!table.active_order && !table.virtual_kind;

  const handleMouseEnter = () => {
    const canPrefetch =
      (table.status === "OCCUPIED" || hasOrphanOrder) && !!table.id;
    if (!canPrefetch) return;
    void queryClient.prefetchQuery({
      queryKey: ['table-orders', table.id],
      queryFn: async () => {
        const res = await api.get<{ results?: OrderDetail[] }>(`/orders/main/`, {
          params: { table_id: table.id, ordering: 'created_at' },
        });
        const rawData = res.data;
        const all = (Array.isArray(rawData)
          ? rawData
          : (rawData && typeof rawData === "object" && "results" in rawData && Array.isArray(rawData.results))
            ? rawData.results
            : []) as OrderDetail[];
        return all.filter((o: OrderDetail) => isActiveOrderStatus(o.status));
      },
      staleTime: 15_000,
    });
  };
  const displayName =
    table.virtual_kind === "new_slot" ? t("newTakeawaySlot") : table.name;
  const cleaningEnabled =
    !table.virtual_kind && !table.zone_is_takeaway;
  const isKitchen = table.status === "OCCUPIED" && table.pos_occupied_flow === "KITCHEN";
  const cleaningSeconds = useCleaningCountdown(table.cleaning_until, table.cleaning_remaining_seconds);

  const handleOrphanOrderOpen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (openingOrphan || !table.id) return;
    setOpeningOrphan(true);
    try {
      const opened = await tablesApi.open(table.id);
      const occupiedTable: Table = {
        ...table,
        ...opened,
        status: "OCCUPIED",
        active_order: table.active_order ?? opened.active_order,
      };
      // React Query cache'ini güncelle (Zustand'daki server verileri kaldırıldı)
      queryClient.setQueriesData({ queryKey: queryKeys.posTablesBase }, (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.map((row: Table) =>
          row.id === table.id ? occupiedTable : row
        );
      });
      onOpenOrderModal(occupiedTable);
    } finally {
      setOpeningOrphan(false);
    }
  };

  const [elapsedMinutes, setElapsedMinutes] = useState<number | null>(null);
  useEffect(() => {
    if (table.status !== "OCCUPIED" || !table.active_order?.created_at) {
      setElapsedMinutes(null);
      return;
    }
    const calc = () => {
      const created = new Date(table.active_order!.created_at!);
      const diffMs = Date.now() - created.getTime();
      setElapsedMinutes(Math.max(0, Math.floor(diffMs / 60000)));
    };
    calc();
    const interval = setInterval(calc, 30_000);
    return () => clearInterval(interval);
  }, [table.status, table.active_order]);

  useAutoFinishCleaningOnExpire(
    cleaningEnabled && table.status === "CLEANING" && !!onFinishCleaning,
    table.id,
    table.cleaning_until,
    cleaningSeconds,
    () => onFinishCleaning?.(table, { silent: true }),
  );

  const canFinishCleaningEarly =
    cleaningEnabled &&
    table.status === "CLEANING" &&
    onFinishCleaning &&
    cleaningSeconds != null &&
    cleaningSeconds > 0;

  const statusStyles = {
    FREE: {
      shell: "border-border bg-card hover:border-t-emerald-500 border-t-emerald-500 border-t-4",
      badge: "bg-muted text-emerald-700 dark:text-emerald-400 border border-border/50",
      dot: "bg-emerald-500",
      statusLabel: "text-emerald-600 dark:text-emerald-400"
    },
    OCCUPIED: isKitchen ? {
      shell: "border-border bg-card hover:border-t-amber-500 border-t-amber-500 border-t-4",
      badge: "bg-muted text-amber-700 dark:text-amber-400 border border-border/50",
      dot: "bg-amber-500",
      statusLabel: "text-amber-600 dark:text-amber-400"
    } : {
      shell: "border-border bg-card hover:border-t-rose-500 border-t-rose-500 border-t-4",
      badge: "bg-muted text-rose-700 dark:text-rose-400 border border-border/50",
      dot: "bg-rose-500",
      statusLabel: "text-rose-600 dark:text-rose-400"
    },
    RESERVED: {
      shell: "border-border bg-card hover:border-t-yellow-500 border-t-yellow-500 border-t-4",
      badge: "bg-muted text-yellow-700 dark:text-yellow-400 border border-border/50",
      dot: "bg-yellow-500",
      statusLabel: "text-yellow-600 dark:text-yellow-400"
    },
    CLEANING: {
      shell: "border-border bg-card hover:border-t-sky-500 border-t-sky-500 border-t-4",
      badge: "bg-muted text-sky-700 dark:text-sky-400 border border-border/50",
      dot: "bg-sky-500",
      statusLabel: "text-sky-600 dark:text-sky-400"
    },
    OUT_OF_SERVICE: {
      shell: "border-border/50 bg-muted/50 opacity-60 grayscale border-t-slate-400 border-t-4 cursor-not-allowed",
      badge: "bg-muted text-muted-foreground",
      dot: "bg-slate-400",
      statusLabel: "text-muted-foreground"
    }
  };

  const currentStyle = hasOrphanOrder
    ? {
        shell: "border-border bg-card hover:border-t-orange-500 border-t-orange-500 border-t-4",
        badge: "bg-muted text-orange-700 dark:text-orange-400 border border-border/50",
        dot: "bg-orange-500",
        statusLabel: "text-orange-600 dark:text-orange-400",
      }
    : statusStyles[table.status as keyof typeof statusStyles] || statusStyles.OUT_OF_SERVICE;

  const buttonClasses = {
    kitchen: "bg-amber-600 hover:bg-amber-700 active:bg-amber-800",
    settle: "bg-rose-600 hover:bg-rose-700 active:bg-rose-800",
    cleaning: "bg-sky-600 hover:bg-sky-700 active:bg-sky-800"
  };

  const receiptBtnClass = isKitchen ? buttonClasses.kitchen : buttonClasses.settle;

  return (
    <div
      onClick={() => table.status !== "OUT_OF_SERVICE" && onSelect(table)}
      onMouseEnter={handleMouseEnter}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onSelect(table); }}
      className={`group relative flex h-40 flex-col justify-between overflow-hidden rounded-2xl border p-3 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 ${currentStyle.shell}`}
    >
      {/* Top Status Dot */}
      <div className={`absolute top-2.5 right-2.5 h-2 w-2 rounded-full transition-colors duration-300 ${currentStyle.dot}`} />

      {/* Top section: Title and Capacity */}
      <div className="flex flex-col items-start w-full min-w-0 pr-3">
        <span className="text-lg font-ui-bold text-foreground truncate w-full text-left leading-tight">
          {displayName}
        </span>
        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-ui-semibold text-muted-foreground">
          <Users size={10} className="shrink-0" />
          <span>
            {table.virtual_kind === "new_slot" ? t("newTakeawayHint") : t("capacityText", { count: table.capacity })}
          </span>
        </div>
      </div>

      {/* Middle section: Assigned Waiter or Status Badges */}
      <div className="flex flex-wrap w-full gap-1 items-center my-0.5">
        {table.assigned_waiters && table.assigned_waiters.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-ui-medium text-foreground bg-muted border border-border/30 rounded-lg w-fit max-w-[70%] min-w-0">
            <User size={10} className="shrink-0 text-muted-foreground" />
            <span className="truncate" title={table.assigned_waiters.join(", ")}>
              {table.assigned_waiters.join(", ")}
            </span>
          </div>
        )}

        {hasOrphanOrder && (
          <span className={`w-fit text-[9px] font-ui-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 flex items-center gap-1 ${currentStyle.badge}`}>
            <AlertTriangle size={10} aria-hidden="true" />
            {t("orphanOrderHint")}
          </span>
        )}

        {table.status === "CLEANING" && (
          <span className={`w-fit text-[9px] font-ui-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 flex items-center gap-1 transition-colors duration-300 ${currentStyle.badge}`}>
            <Brush size={10} aria-hidden="true" />
            {cleaningSeconds != null ? formatCleaningCountdown(cleaningSeconds) : t("cleaning")}
          </span>
        )}

        {table.status === "OCCUPIED" && elapsedMinutes !== null && (
          <span className={`w-fit text-[9px] font-ui-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 flex items-center gap-1 transition-colors duration-300 ${isKitchen ? "bg-muted text-amber-600" : "bg-muted text-rose-600"}`}>
            <UtensilsCrossed size={10} className="shrink-0" aria-hidden="true" />
            <Clock size={10} className="shrink-0" />
            {t("occupiedMinutes", { minutes: elapsedMinutes })}
          </span>
        )}

        {isKitchen && (
          <span className={`w-fit text-[9px] font-ui-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 flex items-center gap-1 transition-colors duration-300 ${currentStyle.badge}`}>
            <ChefHat size={10} aria-hidden="true" />
            {t("waiting")}
          </span>
        )}
      </div>

      {/* Bottom section: Full Width Action Button for Premium Touch Screens */}
      <div className="w-full flex flex-col items-center z-10">
        {hasOrphanOrder ? (
          <button
            onClick={handleOrphanOrderOpen}
            disabled={openingOrphan}
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 active:bg-orange-800 disabled:opacity-70 text-white text-xs font-ui-bold transition-all shadow-sm active:scale-98 cursor-pointer"
            type="button"
          >
            <ReceiptText size={14} /> {openingOrphan ? t("orphanOrderOpening") : t("orphanOrder")}
          </button>
        ) : table.status === "OCCUPIED" && table.active_order ? (
          <button
            onClick={e => { e.stopPropagation(); onOpenOrderModal(table); }}
            className={`flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-white text-xs font-ui-bold transition-all shadow-sm active:scale-98 cursor-pointer ${receiptBtnClass}`}
            type="button"
          >
            <ReceiptText size={14} /> {t("viewOrder")}
          </button>
        ) : cleaningEnabled && table.status === "FREE" && onStartCleaning ? (
          <button
            onClick={e => { e.stopPropagation(); onStartCleaning(table); }}
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-xs font-ui-bold transition-all shadow-sm active:scale-98 cursor-pointer"
            type="button"
          >
            <Sparkles size={12} /> {t("startCleaning")}
          </button>
        ) : canFinishCleaningEarly ? (
          <button
            onClick={e => { e.stopPropagation(); onFinishCleaning?.(table); }}
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-ui-bold transition-all shadow-sm active:scale-98 cursor-pointer"
            type="button"
          >
            <CheckCircle2 size={12} /> {t("finishCleaning")}
          </button>
        ) : (
          <div className="w-full border-t border-border/50 pt-1.5 flex justify-between items-center text-[10px] text-muted-foreground">
            <span className="font-ui-medium">{t("statusLabel")}</span>
            <span className={`font-ui-bold flex items-center gap-0.5 transition-colors duration-300 ${currentStyle.statusLabel}`}>
              {table.status === "FREE" ? (
                <><Check size={10} aria-hidden="true" />{t("status.empty")}</>
              ) : table.status === "RESERVED" ? (
                <><CalendarClock size={10} aria-hidden="true" />{t("status.reserved")}</>
              ) : (
                <><Ban size={10} aria-hidden="true" />{t("status.outOfService")}</>
              )}
            </span>
          </div>
        )}
      </div>
      
    </div>
  );
});

export { TableCard };
