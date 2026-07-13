"use client";

import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { hasModuleAccess, PERMISSION_ORDERS_MANAGE_SMART_FIRING } from "@/lib/constants";
import { KdsClockProvider } from "@/features/kds/hooks/useKdsClock";

// Modularized feature components and hooks
import { useKdsData } from "@/features/kds/hooks/useKdsData";
import { usePrepSocket } from "@/features/prep/hooks/usePrepSocket";
import { KDSHeader } from "@/features/kds/components/KDSHeader";
import { StationSelector } from "@/features/kds/components/StationSelector";
import { OrderGrid } from "@/features/kds/components/OrderGrid";
import { CancellationAnnouncement } from "@/features/kds/components/CancellationAnnouncement";
import { KDSSidebar } from "@/features/kds/components/KDSSidebar";
import { KdsOrderTotalsPanel } from "@/features/kds/components/KdsOrderTotalsPanel";
import { KdsRecallDrawer } from "@/features/kds/components/KdsRecallDrawer";
import { useKdsRecall } from "@/features/kds/hooks/useKdsRecall";

const DeficiencyReportFormModal = dynamic(
  () =>
    import("@/features/warehouse/components/DeficiencyReportFormModal").then(
      (m) => m.DeficiencyReportFormModal
    ),
  { ssr: false }
);
import { useCreateDeficiencyReport } from "@/features/warehouse/hooks/useWarehouseActions";
import { BackendHealthBanner } from "@/components/shell/BackendHealthProvider";
import { useModulePermissions } from "@/hooks/useModulePermissions";
const KdsWasteModal = dynamic(
  () => import("@/features/kds/components/KdsWasteModal").then((m) => m.KdsWasteModal),
  { ssr: false }
);
const ProductionStatusModal = dynamic(
  () => import("@/features/production-planning/components/ProductionStatusModal").then((m) => m.ProductionStatusModal),
  { ssr: false }
);
const MrpDetailModal = dynamic(
  () => import("@/features/production-planning/components/MrpDetailModal").then((m) => m.MrpDetailModal),
  { ssr: false }
);
import { usePlans } from "@/features/production-planning/hooks/useProductionPlanning";

const CancellationReasonModal = dynamic(
  () =>
    import("@/features/admin/components/modals/CancellationReasonModal").then(
      (m) => m.CancellationReasonModal,
    ),
  { ssr: false },
);

function KdsPageInner() {
  const t = useTranslations("kds");
  const recallRefreshRef = useRef<() => void>(() => {});
  const kds = useKdsData({
    onOrdersSync: () => recallRefreshRef.current(),
  });
  const [showDeficiency, setShowDeficiency] = useState(false);
  /** Depo stoğundan her “Eksik listesine ekle” için artan sürüm; modal satırları birleştirir */
  const [deficiencyAppendVersion, setDeficiencyAppendVersion] = useState(0);
  const [deficiencyAppendBatch, setDeficiencyAppendBatch] = useState<
    { stock_item_id: string; quantity: number; unit: string }[] | null
  >(null);
  const [showWaste, setShowWaste] = useState(false);
  const [showProductionStatus, setShowProductionStatus] = useState(false);
  const [showDailyMrp, setShowDailyMrp] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isTotalsCollapsed, setIsTotalsCollapsed] = useState(false);
  const [recallDrawerOpen, setRecallDrawerOpen] = useState(false);
  const createDeficiencyMut = useCreateDeficiencyReport();

  const branchId = kds.selectedBranchId || kds.activeStation?.branch || "";
  const recall = useKdsRecall(kds.activeStation?.id, branchId);

  // Hazırlık görevleri WS güncellemeleri: prep-management'ten eklenen görevler
  // KDS Drawer'ında da anlık görünsün
  usePrepSocket(branchId || undefined);

  const handleRecallItem = useCallback(
    async (itemId: string) => {
      try {
        await recall.recallItem(itemId);
        await kds.fetchOrders();
        toast.success(t("recall.recallSuccess"));
      } catch {
        toast.error(t("recall.recallFailed"));
      }
    },
    [recall, kds, t],
  );

  useLayoutEffect(() => {
    recallRefreshRef.current = recall.refresh;
  });

  useEffect(() => {
    if (recallDrawerOpen && kds.activeStation?.id) {
      void recallRefreshRef.current();
    }
  }, [recallDrawerOpen, kds.activeStation?.id]);

  const today = new Date().toISOString().split("T")[0];
  const { data: plansData } = usePlans({
    branch_id: kds.selectedBranchId || kds.activeStation?.branch || "",
    start_date: today,
    end_date: today,
  });
  const todayPlan = plansData?.results?.[0] || null;

  const { canManage } = useModulePermissions();

  const canAccessPos = hasModuleAccess(
    kds.user?.permissions, 
    kds.user?.is_superuser, 
    "pos"
  );

  const kdsSidebarPermissions = {
    canAddWaste: canManage("branches.add_kds_waste"),
    canViewWarehouse: canManage("branches.view_kds_warehouse"),
    canManageDeficiency: canManage("warehouse.manage_deficiency_report"),
    canViewHistory: canManage("warehouse.view_deficiency_report"),
  };

  const canChangeStation = canManage("branches.change_kds_station");

  const canUseSmartFiringActions =
    canManage(PERMISSION_ORDERS_MANAGE_SMART_FIRING) || canManage("orders.manage_order");

  // Selection UI if no active station
  if (kds.showSelector || !kds.activeStation) {
    return (
      <>
        <BackendHealthBanner />
        <StationSelector
          user={kds.user}
          stations={kds.stations}
          branches={kds.branches}
          selectedBranchId={kds.selectedBranchId || ""}
          isStationLoading={kds.isStationLoading}
          canAccessPos={canAccessPos}
          onBranchChange={(id) => kds.setSelectedBranchId(id)}
          onSelectStation={kds.handleSelectStation}
        />
      </>
    );
  }

  return (
    <KdsClockProvider>
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-100 dark:bg-zinc-950 font-sans text-foreground transition-colors duration-300">
      <div className="flex min-h-0 flex-1 flex-row bg-zinc-100 dark:bg-zinc-950">
        {!isTotalsCollapsed && (
          <div className="flex h-full min-h-0 shrink-0">
            <KdsOrderTotalsPanel groupedOrders={kds.groupedOrders} />
          </div>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-100 dark:bg-zinc-950 text-foreground">
          <KDSHeader
            user={kds.user}
            branches={kds.branches}
            stations={kds.stations}
            activeStation={kds.activeStation}
            selectedBranchId={kds.selectedBranchId || ""}
            canAccessPos={canAccessPos}
            onShowSelector={() => kds.setShowSelector(true)}
            onBranchChange={(id) => kds.setSelectedBranchId(id)}
            onSelectStation={kds.handleSelectStation}
            canChangeStation={canChangeStation}
            isTotalsCollapsed={isTotalsCollapsed}
            onToggleTotals={() => setIsTotalsCollapsed(!isTotalsCollapsed)}
            soundEnabled={kds.soundEnabled}
            onToggleSound={kds.toggleSound}
          />
          <BackendHealthBanner />

          <CancellationAnnouncement 
            announcements={kds.announcements}
            onClear={(id) => kds.setAnnouncements(cur => cur.filter(a => a.id !== id))}
          />

          <div className="flex min-h-0 flex-1 flex-col">
      {kds.activeStation && (
        <KdsWasteModal
          open={showWaste}
          stationId={kds.activeStation.id}
          warehouseName={kds.activeStation.warehouse_name}
          onClose={() => setShowWaste(false)}
        />
      )}

      {kds.activeStation && (
        <DeficiencyReportFormModal
          open={showDeficiency}
          initialStationId={kds.activeStation.id}
          appendBatch={deficiencyAppendBatch}
          appendVersion={deficiencyAppendVersion}
          onClose={() => {
            setShowDeficiency(false);
            setDeficiencyAppendBatch(null);
            setDeficiencyAppendVersion(0);
          }}
          isLoading={createDeficiencyMut.isPending}
          onSave={async (data) => {
            try {
              await createDeficiencyMut.mutateAsync(data);
              toast.success(t("toasts.deficiencyListSent"));
              setShowDeficiency(false);
              setDeficiencyAppendBatch(null);
              setDeficiencyAppendVersion(0);
            } catch (err) {
              // Re-throw the error so the modal can catch and display the detailed message
              throw err;
            }
          }}
        />
      )}

      {showProductionStatus && kds.activeStation && (
        <ProductionStatusModal
          isOpen={showProductionStatus}
          onClose={() => setShowProductionStatus(false)}
          branchId={kds.selectedBranchId || ""}
        />
      )}

      {showDailyMrp && kds.activeStation && (
        <MrpDetailModal
          isOpen={showDailyMrp}
          onClose={() => setShowDailyMrp(false)}
          plan={todayPlan}
          activeStationId={kds.activeStation.id}
        />
      )}

        <OrderGrid
          isLoading={kds.isLoading}
          orders={kds.orders}
          groupedOrders={kds.groupedOrders}
          peerPendingLines={kds.peerPendingLines}
          itemHistory={kds.itemHistory}
          onUpdateStatus={kds.updateItemStatus}
          canUseSmartFiringActions={canUseSmartFiringActions}
        />
          </div>
          <KdsRecallDrawer
            open={recallDrawerOpen}
            onClose={() => setRecallDrawerOpen(false)}
            groups={recall.groups}
            recallWindowMinutes={recall.recallWindowMinutes}
            isLoading={recall.isLoading}
            busyId={recall.busyId}
            onRecallItem={(id) => void handleRecallItem(id)}
            onCancelItem={(id, name) => recall.setCancelTarget({ type: "ITEM", id, name })}
            onCancelOrder={(id, name) => recall.setCancelTarget({ type: "ORDER", id, name })}
          />
          <CancellationReasonModal
            isOpen={!!recall.cancelTarget}
            onClose={() => recall.setCancelTarget(null)}
            onConfirm={async (reasonCode, reasonText) => {
              try {
                await recall.submitCancel(reasonCode, reasonText);
                await kds.fetchOrders();
                toast.success(t("recall.cancelSuccess"));
              } catch {
                toast.error(t("recall.cancelFailed"));
                throw new Error("cancel failed");
              }
            }}
            title={t("recall.cancelTitle")}
            description={t("recall.cancelDescription")}
          />
        </div>
      </div>
      <KDSSidebar 
        collapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        activeStationId={kds.activeStation.id}
        branchId={kds.selectedBranchId || kds.activeStation.branch || ""}
        recallOpen={recallDrawerOpen}
        recallItemCount={recall.itemCount}
        onToggleRecall={() => setRecallDrawerOpen((v) => !v)}
        onShowWaste={() => setShowWaste(true)}
        onShowDeficiency={() => {
          setDeficiencyAppendBatch(null);
          setDeficiencyAppendVersion(0);
          setShowDeficiency(true);
        }}
        onDeficiencyPrefill={(items) => {
          setDeficiencyAppendBatch(items);
          setDeficiencyAppendVersion((v) => v + 1);
          setShowDeficiency(true);
        }}
        onShowProductionStatus={() => setShowProductionStatus(true)}
        onShowDailyMrp={() => setShowDailyMrp(true)}
        {...kdsSidebarPermissions}
      />
    </div>
    </KdsClockProvider>
  );
}

export default function KDSPage() {
  return (
    <AuthGuard module="kds">
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        }
      >
        <KdsPageInner />
      </Suspense>
    </AuthGuard>
  );
}
