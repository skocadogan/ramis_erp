"use client";

import { memo, useCallback, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { usePosStore } from "@/store/usePosStore";
import { useAuthStore } from "@/store/useAuthStore";
import { Search, LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";
import { Table } from "@/types/pos";
import { TableCard } from "./ui/TableCard";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { useTableCleaningActions } from "@/features/tables/hooks/useTableCleaningActions";
import { usePosTables, usePosZones } from "@/features/pos/hooks/usePosTables";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TableGridProps {
  /** Garson mobilde alt FAB için kaydırma alanına ek boşluk */
  layout?: "pos" | "waiter";
}

const TableGrid = memo(function TableGrid({ layout = "pos" }: TableGridProps) {
  const t = useTranslations("pos.table");
  const userBranchId = useAuthStore((s) => s.user?.branch_id);

  // branchId: önce POS store'daki aktif şube, yoksa kullanıcının birincil şubesi
  const bid = usePosStore((s) => s.activeBranchId) || userBranchId;

  // tables ve zones React Query cache'inden okunur (enabled: false — API çağrısı yok)
  const { data: tables = [] } = usePosTables(bid);
  const { data: zones = [] } = usePosZones({ branchId: bid });

  const { 
    selectedZone, 
    setSelectedZone, 
    setSelectedTable, 
    setOrderModalTable, 
    setReservationConfirmTable,
    tableGridColumns
  } = usePosStore(useShallow((state) => ({
    selectedZone: state.selectedZone,
    setSelectedZone: state.setSelectedZone,
    setSelectedTable: state.setSelectedTable,
    setOrderModalTable: state.setOrderModalTable,
    setReservationConfirmTable: state.setReservationConfirmTable,
    tableGridColumns: state.tableGridColumns,
  })));

  const { canManage } = useModulePermissions();
  const canViewTakeaway = canManage("takeaway.view_takeaway");
  const { startCleaning, finishCleaning } = useTableCleaningActions();
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");

  const handleStartCleaning = useCallback(
    (table: Table) => { void startCleaning(table.id); },
    [startCleaning],
  );
  const handleFinishCleaning = useCallback(
    (table: Table, options?: { silent?: boolean }) => { void finishCleaning(table.id, options); },
    [finishCleaning],
  );

  const filteredZones = selectedZone === "ALL" ? zones : zones.filter(z => z.id === selectedZone);

  const zoneTablesList = (() => {
    const q = searchQuery.toLowerCase();
    return filteredZones
      .map((z) => ({
        zone: z,
        zoneTables: tables.filter(
          (t) => t.zone === z.id && t.name.toLowerCase().includes(q)
        ),
      }))
      .filter((row) => row.zoneTables.length > 0);
  })();

  const handleTableSelect = useCallback((t: Table) => {
    if (t.status === "OUT_OF_SERVICE" || t.status === "CLEANING") return;

    const zone = zones.find(z => z.id === t.zone);
    const isTakeaway = zone?.is_takeaway;

    if (isTakeaway && !canViewTakeaway) {
      setShowPermissionModal(true);
      return;
    }

    if (t.status === "RESERVED") {
      setReservationConfirmTable(t);
      return;
    }

    // If takeaway zone and has active order, show list. 
    // Otherwise, just select it to start new order.
    if (isTakeaway && t.status === "OCCUPIED") {
      setOrderModalTable(t);
      return;
    }

    setSelectedTable(t);
  }, [zones, canViewTakeaway, setShowPermissionModal, setReservationConfirmTable, setOrderModalTable, setSelectedTable]);

  const getGridClassName = () => {
    switch (tableGridColumns) {
      case "1":
        return "grid auto-rows-max grid-cols-1 gap-3 sm:gap-4";
      case "2":
        return "grid auto-rows-max grid-cols-2 gap-3 sm:gap-4";
      case "3":
        return "grid auto-rows-max grid-cols-3 gap-3 sm:gap-4";
      case "4":
        return "grid auto-rows-max grid-cols-4 gap-3 sm:gap-4";
      case "auto":
      default:
        return "grid auto-rows-max grid-cols-1 gap-3 min-[400px]:grid-cols-2 min-[400px]:gap-4 min-[400px]:[&>*:last-child:nth-child(odd)]:col-span-2 md:grid-cols-4 md:[&>*:last-child:nth-child(odd)]:col-span-1 lg:grid-cols-5 xl:grid-cols-6";
    }
  };

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border shadow-sm border-border bg-card">
      {/* STICKY HEADER AREA */}
      <div className="z-20 flex shrink-0 flex-col border-b border-slate-50 px-3 pt-4 pb-2 border-border bg-card sm:px-6 sm:pt-2">
        <div className="mb-4 flex flex-col gap-3 sm:mb-2 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
          <h2 className="shrink-0 text-xl font-bold tracking-tight sm:text-2xl text-foreground">
            {t("select")}
          </h2>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
            <div className="relative w-full sm:w-56 md:w-64 lg:w-72">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground" />
              <input
                type="text"
                placeholder={t("search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border py-2 pr-4 pl-9 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 border-input bg-muted text-foreground dark:placeholder:text-muted-foreground"
              />
            </div>
            <span className="inline-flex shrink-0 self-start rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground sm:self-center bg-muted dark:text-muted-foreground">
              {t("count", { count: tables.length })}
            </span>
          </div>
        </div>

        {/* Zone Navigation */}
        <div className="flex gap-2 overflow-x-auto scroll-py-2 pb-2 pl-0.5 pr-4 [-webkit-overflow-scrolling:touch] sm:pr-6 no-scrollbar">
          <button
            onClick={() => setSelectedZone("ALL")}
            className={`shrink-0 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors
 ${selectedZone === "ALL"
 ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/20"
 : "border-border hover:border-blue-400 hover:text-blue-600 border-border bg-muted text-muted-foreground dark:hover:border-blue-500 dark:hover:text-blue-400"}`}
          >
            {t("all")}
          </button>
          {zones.map(z => {
            const isActive = selectedZone === z.id;
            const zColor = z.color || '#94a3b8';
            
            return (
              <button
                key={z.id}
                onClick={() => setSelectedZone(z.id)}
                className={`flex shrink-0 items-center rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors
 ${isActive 
 ? "shadow-md" 
 : "border-border hover:border-slate-400 border-border bg-muted text-muted-foreground dark:hover:border-slate-500"}`}
                style={isActive ? {
                  backgroundColor: `${zColor}15`,
                  borderColor: zColor,
                  color: zColor,
                  boxShadow: `0 4px 6px -1px ${zColor}20`
                } : {}}
              >
                <div 
                  className="w-2.5 h-2.5 rounded-full mr-2 shrink-0 shadow-sm border border-white"
                  style={{ backgroundColor: zColor }}
                />
                {z.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* SCROLLABLE TABLE AREA */}
      <div
        className={
          layout === "waiter"
            ? "flex-1 overflow-y-auto overscroll-contain p-3 pb-24 scrollbar-thin max-lg:pb-28 sm:p-6 lg:pb-6"
            : "flex-1 overflow-y-auto overscroll-contain p-3 pb-6 scrollbar-thin sm:p-2"
        }
      >
        <div className="w-full space-y-4">
          {zoneTablesList.map(({ zone: z, zoneTables }) => (
            <div
              key={z.id}
              className={`space-y-1 rounded-2xl border-l-4 p-2 transition-colors ${z.color ? "" : "bg-muted/50"}`}
              style={{
                backgroundColor: z.color ? `${z.color}15` : undefined,
                borderLeftColor: z.color || "var(--color-border)",
              }}
            >
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{z.name}</h3>
                <div className="h-px flex-1 /50 bg-accent/40" />
              </div>

              <div className={getGridClassName()}>
                {zoneTables.map((t) => (
                  <TableCard
                    key={t.id}
                    table={t}
                    onSelect={handleTableSelect}
                    onOpenOrderModal={setOrderModalTable}
                    onStartCleaning={
                      z.is_takeaway || t.virtual_kind
                        ? undefined
                        : handleStartCleaning
                    }
                    onFinishCleaning={
                      z.is_takeaway || t.virtual_kind
                        ? undefined
                        : handleFinishCleaning
                    }
                  />
                ))}
              </div>
            </div>
          ))}

          {tables.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground dark:text-muted-foreground">
              <LayoutGrid size={48} className="mb-4 opacity-50" />
              <span className="text-lg">{t("noTables")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
      
      <AlertDialog open={showPermissionModal} onOpenChange={setShowPermissionModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("permissionError.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("permissionError.desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowPermissionModal(false)}>{t("permissionError.ok")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

export { TableGrid };
