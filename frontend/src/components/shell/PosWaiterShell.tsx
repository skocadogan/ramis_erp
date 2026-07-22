"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePosStore } from "@/store/usePosStore";
import { useAuthStore } from "@/store/useAuthStore";
import api from "@/lib/api";
import { AlertCircle, MonitorSmartphone, ShoppingBag, Utensils } from "lucide-react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { PosLoadingScreen } from "@/features/pos/components/PosLoadingScreen";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";

const NotificationDrawer = dynamic(
  () => import("@/features/pos/components/NotificationDrawer").then((m) => m.NotificationDrawer),
  { ssr: false },
);

const OpenShiftPanel = dynamic(
  () => import("@/features/shifts/components/OpenShiftPanel").then((m) => m.OpenShiftPanel),
  { ssr: false },
);

import type { Table, Zone } from "@/types/pos";
import { OrderModalSwitch } from "@/features/pos/components/OrderModalSwitch";
import { usePosDataSync } from "@/features/pos/hooks/usePosDataSync";
import { usePosDisplaySync } from "@/features/pos/hooks/usePosDisplaySync";
import { resetPosCustomerDisplayState } from "@/features/pos/lib/posCustomerDisplaySync";
import { queryKeys } from "@/lib/queryKeys";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { POSHeader } from "@/features/pos/components/POSHeader";
import { TableGrid } from "@/features/pos/components/TableGrid";
import { MenuSection } from "@/features/pos/components/MenuSection";
import { CartSidebar } from "@/features/pos/components/CartSidebar";
import { TableSync } from "@/features/pos/components/TableSync";
import { BackendHealthBanner } from "@/components/shell/BackendHealthProvider";
import { GateHomeButton } from "@/features/pos/components/GateHomeButton";
import { OfflineQueueProvider } from "@/features/pos/offline/OfflineQueueProvider";
import { PosTerminalShiftStatusBadge } from "@/features/pos/components/PosTerminalShiftStatusBadge";
import { posTerminalsGateQueryOverrides } from "@/features/pos/constants/posTerminalsQuery";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import { formatDate } from "@/lib/formatters";
import { useActiveShift, useSyncShiftsAcrossTabs } from "@/features/shifts/hooks/useActiveShift";

interface PosTerminalRow {
  id: string;
  branch: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  has_open_shift_at_terminal?: boolean;
  used_in_open_shift?: boolean;
}

interface SharedOrderModalProps {
  orderModalTable: Table;
  onClose: () => void;
  onActiveOrdersChanged: () => Promise<void> | void;
  onPaymentComplete: () => Promise<void>;
  onNewOrder: () => void;
}

interface PosWaiterShellProps {
  variant: "pos" | "waiter";
  OrderModalComponent?: React.ComponentType<SharedOrderModalProps>;
}

export function PosWaiterShell({ variant, OrderModalComponent: OrderModalComponentProp }: PosWaiterShellProps) {
  const t = useTranslations(variant === "pos" ? "pos.page" : "waiter");
  const tPosPage = useTranslations("pos.page");
  const pathname = usePathname();

  const user = useAuthStore((s) => s.user);
  const username = user?.username ?? "";
  const userBranchId = user?.branch_id ?? "";

  const [isOrderSuccess, setIsOrderSuccess] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [pickPosMode, setPickPosMode] = useState(false);
  const [isKitchenNotifOpen, setIsKitchenNotifOpen] = useState(false);
  const [isWaiterCallNotifOpen, setIsWaiterCallNotifOpen] = useState(false);

  const cart = usePosStore((s) => s.cart);
  const selectedTable = usePosStore((s) => s.selectedTable);
  const activeBranchId = usePosStore((s) => s.activeBranchId);
  const setActiveBranchId = usePosStore((s) => s.setActiveBranchId);
  const orderModalTable = usePosStore((s) => s.orderModalTable);
  const setOrderModalTable = usePosStore((s) => s.setOrderModalTable);
  const reservationConfirmTable = usePosStore((s) => s.reservationConfirmTable);
  const setReservationConfirmTable = usePosStore((s) => s.setReservationConfirmTable);
  const setSelectedTable = usePosStore((s) => s.setSelectedTable);
  const posTerminalUuid = usePosStore((s) => s.posTerminalUuid);
  const terminalId = usePosStore((s) => s.terminalId);
  const persistTerminalSelection = usePosStore((s) => s.persistTerminalSelection);
  const showReadyNotifs = usePosStore((s) => s.showReadyNotifs);
  const showWaiterCallNotifs = usePosStore((s) => s.showWaiterCallNotifs);
  const readyItems = usePosStore((s) => s.readyItems);
  const guestArrivedNotifs = usePosStore((s) => s.guestArrivedNotifs);
  const waiterCallNotifs = usePosStore((s) => s.waiterCallNotifs);

  const { canManage } = useModulePermissions();
  const canOpenShift = canManage("shifts.manage_shift");

  const branchIdForShift = activeBranchId || userBranchId || "";
  const needsShiftGate = Boolean(branchIdForShift);
  const selectingTerminalGate = needsShiftGate && !posTerminalUuid;

  useSyncShiftsAcrossTabs(branchIdForShift);
  const {
    data: activeShift,
    isLoading: shiftLoading,
    refetch: refetchShift,
  } = useActiveShift(branchIdForShift || null, posTerminalUuid);

  useEffect(() => {
    if (userBranchId && !activeBranchId) {
      setActiveBranchId(userBranchId);
    }
  }, [userBranchId, activeBranchId, setActiveBranchId]);

  useEffect(() => {
    if (activeShift) setPickPosMode(false);
  }, [activeShift]);

  const terminalQueryEnabled =
    variant === "pos"
      ? Boolean(branchIdForShift)
      : Boolean(branchIdForShift && !activeShift);

  const { data: rawPosTerminals = [], isLoading: posTerminalsLoading } = useQuery({
    queryKey: ["pos-terminals", branchIdForShift],
    queryFn: async () => {
      const { data } = await api.get<unknown>("/pos-display/terminals/", {
        params: { branch_id: branchIdForShift },
      });
      if (Array.isArray(data)) return data as PosTerminalRow[];
      const d = data as { results?: PosTerminalRow[] };
      return d.results ?? [];
    },
    enabled: terminalQueryEnabled,
    ...(selectingTerminalGate ? posTerminalsGateQueryOverrides : {}),
  });

  const activePosTerminals = useMemo(
    () => rawPosTerminals.filter((t) => t.is_active),
    [rawPosTerminals],
  );

  useEffect(() => {
    if (!rawPosTerminals.length) return;
    if (posTerminalUuid) {
      const ok = rawPosTerminals.some((t) => t.id === posTerminalUuid && t.is_active);
      if (!ok) persistTerminalSelection("", null);
      return;
    }
    if (terminalId) {
      const m = rawPosTerminals.find((t) => t.code === terminalId && t.is_active);
      if (m) persistTerminalSelection(m.code, m.id);
    }
  }, [rawPosTerminals, posTerminalUuid, terminalId, persistTerminalSelection]);

  const isPosVariant = variant === "pos";

  const { isLoading } = usePosDataSync({
    pathname,
    variant,
  });

  // Müşteri ekranı yalnızca POS oturumunda senkronize edilir
  usePosDisplaySync(isPosVariant ? terminalId || null : null, isPosVariant);

  useEffect(() => {
    if (isPosVariant) return;
    resetPosCustomerDisplayState();
  }, [isPosVariant]);

  const handleConfirmReservation = useCallback(() => {
    if (!reservationConfirmTable) return;
    setSelectedTable(reservationConfirmTable);
    setReservationConfirmTable(null);
  }, [reservationConfirmTable, setSelectedTable, setReservationConfirmTable]);

  const handleCloseOrderModal = useCallback(() => {
    setOrderModalTable(null);
  }, [setOrderModalTable]);

  const handleOrderSuccess = useCallback(() => {
    setIsOrderSuccess(true);
  }, []);

  const handleOrderSuccessAndCloseSheet = useCallback(() => {
    setIsOrderSuccess(true);
    setCartSheetOpen(false);
  }, []);

  const queryClient = useQueryClient();

  /**
   * Paket sanal masalar (`tw-ord__*`) `table_update` almaz; Infinity stale cache
   * yalnız bu refetch / TableSync HTTP yedeği ile güncellenir.
   */
  const refreshPosTables = useCallback(async () => {
    const bid = activeBranchId ?? undefined;
    await queryClient.invalidateQueries({
      queryKey: queryKeys.posTables(bid, variant),
    });
  }, [queryClient, activeBranchId, variant]);

  const handlePaymentComplete = useCallback(async () => {
    setOrderModalTable(null);
    await refreshPosTables();
  }, [setOrderModalTable, refreshPosTables]);

  const handleNewOrderFromModal = useCallback(() => {
    if (!orderModalTable) return;
    // React Query cache'inden oku (Zustand'daki server verileri kaldırıldı)
    const bid = activeBranchId ?? undefined;
    const zones = queryClient.getQueryData<Zone[]>(queryKeys.posZones(bid));
    const tablesList = queryClient.getQueryData<Table[]>(queryKeys.posTables(bid, variant));
    const zone = zones?.find((z) => z.id === orderModalTable.zone);
    if (zone?.is_takeaway && orderModalTable.virtual_kind === "takeaway_order") {
      const placeholder = tablesList?.find(
        (t) => t.virtual_kind === "new_slot" && t.zone === orderModalTable.zone,
      );
      setSelectedTable(placeholder ?? orderModalTable);
    } else {
      setSelectedTable(orderModalTable);
    }
    setOrderModalTable(null);
  }, [orderModalTable, activeBranchId, setSelectedTable, setOrderModalTable, queryClient, variant]);

  const renderOrderModal = () => {
    if (!orderModalTable || !orderModalTable.active_order) return null;

    const sharedProps = {
      orderModalTable,
      onClose: handleCloseOrderModal,
      onActiveOrdersChanged: refreshPosTables,
      onPaymentComplete: handlePaymentComplete,
      onNewOrder: handleNewOrderFromModal,
    };

    const ModalComponent = OrderModalComponentProp || OrderModalSwitch;
    return (
      <ModalComponent
        {...sharedProps}
        {...(!OrderModalComponentProp && variant === "waiter"
          ? { hideDeliveredQuantityControls: true }
          : {})}
      />
    );
  };

  /* ── Gate: Shift Loading ── */
  if (needsShiftGate && shiftLoading) {
    return (
      <AuthGuard module={variant}>
        <PosLoadingScreen
          label={variant === "pos" ? t("checkingShift") : t("shift.checking")}
        />
      </AuthGuard>
    );
  }

  /* ── Gate: Terminal selection flow ── */
  if (
    variant === "pos"
      ? (needsShiftGate && !activeShift)
      : (needsShiftGate && (!activeShift || !posTerminalUuid))
  ) {
    const showTerminalFlow =
      variant === "pos"
        ? selectingTerminalGate
        : (pickPosMode || selectingTerminalGate);

    /* -- Gate: Terminal loading -- */
    if (showTerminalFlow && posTerminalsLoading) {
      return (
        <AuthGuard module={variant}>
          <PosLoadingScreen label={tPosPage("loadingTerminals")} />
        </AuthGuard>
      );
    }

    /* -- Gate: No terminals available -- */
    if (showTerminalFlow && !posTerminalsLoading && activePosTerminals.length === 0) {
      return (
        <AuthGuard module={variant}>
          <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-card">
            <MonitorSmartphone className="mb-3 h-12 w-12 text-amber-500" />
            <p className="mb-2 max-w-md text-center text-sm font-medium text-foreground">
              {tPosPage("noTerminal")}
            </p>
            <p className="max-w-md text-center text-xs text-muted-foreground">
              {tPosPage("noTerminalDesc")}
            </p>
            {variant === "waiter" ? (
              <div className="mx-auto mt-6 flex w-full max-w-md flex-col gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-11 w-full gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm"
                  onClick={() => setPickPosMode(false)}
                >
                  {t("shift.backFromPosPick")}
                </Button>
                <GateHomeButton className="min-h-11 w-full justify-center px-4 py-2.5 text-sm font-semibold shadow-sm" />
              </div>
            ) : (
              <GateHomeButton className="mt-6" />
            )}
          </div>
        </AuthGuard>
      );
    }

    /* -- Gate: Select terminal -- */
    if (showTerminalFlow && activePosTerminals.length > 0) {
      return (
        <AuthGuard module={variant}>
          <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-card">
            <MonitorSmartphone className="mb-4 h-14 w-14 text-blue-600" />
            <h2 className="mb-2 text-lg font-bold text-foreground">
              {tPosPage("selectTerminal")}
            </h2>

            <div className="flex w-full max-w-sm flex-col gap-2">
              {activePosTerminals.map((terminal) => (
                <button
                  key={terminal.id}
                  type="button"
                  onClick={() => persistTerminalSelection(terminal.code, terminal.id)}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border px-4 py-3 text-left text-sm font-semibold shadow-sm transition-colors hover:border-blue-400 hover:bg-blue-50/80 border-border bg-card text-foreground dark:hover:"
                >
                  <span className="min-w-0">
                    <span className="block">{terminal.name}</span>
                    <span className="block font-mono text-xs font-normal text-muted-foreground">
                      {terminal.code}
                    </span>
                  </span>
                  <PosTerminalShiftStatusBadge
                    hasOpenShift={Boolean(terminal.has_open_shift_at_terminal)}
                    openLabel={tPosPage("terminalShiftOpen")}
                    closedLabel={tPosPage("terminalShiftClosed")}
                    openTitle={tPosPage("terminalShiftOpenDesc")}
                    closedTitle={tPosPage("terminalShiftClosedDesc")}
                  />
                </button>
              ))}
            </div>

            {variant === "waiter" ? (
              <div className="mx-auto mt-6 flex w-full max-w-md flex-col gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-11 w-full gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm"
                  onClick={() => setPickPosMode(false)}
                >
                  {t("shift.backFromPosPick")}
                </Button>
                <GateHomeButton className="min-h-11 w-full justify-center px-4 py-2.5 text-sm font-semibold shadow-sm" />
              </div>
            ) : (
              <GateHomeButton className="mt-6" />
            )}
          </div>
        </AuthGuard>
      );
    }

    /* -- Gate: No shift -- */
    if (variant === "pos") {
      return (
        <AuthGuard module={variant}>
          <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-card">
            <p className="mb-4 max-w-md text-center text-sm text-muted-foreground">
              {t("shiftRequired")}
            </p>
            {canOpenShift ? (
              <OpenShiftPanel
                touchKeyboard
                branchId={branchIdForShift}
                atTerminalId={posTerminalUuid}
                onOpened={() => void refetchShift()}
              />
            ) : (
              <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4 text-center text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                {t("noShiftPermission")}
              </div>
            )}
            <div className="mt-6 flex flex-row items-center gap-3">
              <button
                type="button"
                onClick={() => persistTerminalSelection("", null)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold shadow-sm transition-colors hover: border-border bg-card text-foreground dark:hover:"
              >
                <MonitorSmartphone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span>{t("selectTerminal")}</span>
              </button>
              <GateHomeButton />
            </div>
          </div>
        </AuthGuard>
      );
    }

    /* -- Waiter: No shift (shift closed screen) -- */
    return (
      <AuthGuard module={variant}>
        <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-card">
          <AlertCircle className="mb-4 h-14 w-14 text-amber-500" />
          <h2 className="mb-2 text-xl font-bold tracking-tight text-foreground">
            {username ? `${username} — ${t("shift.closed")}` : t("shift.closed")}
          </h2>
          <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-center text-sm font-medium text-amber-900 shadow-sm dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {t("shift.requiredMessage")}
          </div>
          <div className="mx-auto mt-6 flex w-full max-w-md flex-col gap-3">
            <Button
              type="button"
              className="h-auto min-h-11 w-full gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
              onClick={() => setPickPosMode(true)}
            >
              <MonitorSmartphone className="h-4 w-4 shrink-0" aria-hidden />
              {t("shift.selectPos")}
            </Button>
            <GateHomeButton className="min-h-11 w-full justify-center px-4 py-2.5 text-sm font-semibold shadow-sm" />
          </div>
        </div>
      </AuthGuard>
    );
  }

  /* ── Loading screen ── */
  if (isLoading) {
    return (
      <AuthGuard module={variant}>
        <PosLoadingScreen
          label={variant === "pos" ? t("loadingSystem") : t("loading")}
        />
      </AuthGuard>
    );
  }

  /* ── Main layout ── */
  const visibleReadyCount = showReadyNotifs
    ? readyItems.filter((i) => !i.waiter_acknowledged_at).length
    : 0;
  const visibleWaiterCallCount = showWaiterCallNotifs ? waiterCallNotifs.length : 0;
  const kitchenBadgeCount = visibleReadyCount + guestArrivedNotifs.length;

  if (variant === "pos") {
    return (
      <AuthGuard module={variant}>
        <OfflineQueueProvider>
          <div className="flex h-screen flex-col overflow-hidden bg-background">
            <POSHeader
              kitchenBadgeCount={kitchenBadgeCount}
              waiterCallBadgeCount={visibleWaiterCallCount}
              onKitchenToggle={() => setIsKitchenNotifOpen((p) => !p)}
              onWaiterCallToggle={() => setIsWaiterCallNotifOpen((p) => !p)}
            />
            <NotificationDrawer
              kitchenOpen={isKitchenNotifOpen}
              waiterCallOpen={isWaiterCallNotifOpen}
              onKitchenOpenChange={setIsKitchenNotifOpen}
              onWaiterCallOpenChange={setIsWaiterCallNotifOpen}
            />
            <BackendHealthBanner />
            <main className="flex flex-1 overflow-hidden p-2 gap-2 bg-background">
              <div className="flex flex-1 flex-col overflow-hidden">
                {!selectedTable ? <TableGrid layout="pos" /> : <MenuSection layout="pos" />}
              </div>
              {cart.length > 0 && (
                <CartSidebar
                  onOrderSuccess={handleOrderSuccess}
                  onRefreshData={refreshPosTables}
                  shiftGateOk={!needsShiftGate || !!activeShift}
                />
              )}
            </main>

            {renderOrderModal()}

            <TableSync branchId={activeBranchId || undefined} variant="pos" />

            {/* CustomerDisplayView ve DisplayDimmer ileride buraya eklenecek (POS-only) */}

            {/* Reservation confirmation dialog */}
            <AlertDialog
              open={!!reservationConfirmTable}
              onOpenChange={(open) => !open && setReservationConfirmTable(null)}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{tPosPage("reservation.title")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {reservationConfirmTable?.reservation_info && (
                      <div className="mb-3 text-base font-bold text-foreground">
                        {reservationConfirmTable.reservation_info}
                      </div>
                    )}
                    <div className="space-y-1.5 text-sm">
                      {reservationConfirmTable?.reservation_scheduled_at && (
                        <div className="flex justify-between border-b py-1 border-border">
                          <span className="text-muted-foreground">{tPosPage("reservation.scheduledTime")}</span>
                          <span className="font-semibold">{formatDate(reservationConfirmTable.reservation_scheduled_at)}</span>
                        </div>
                      )}
                      {reservationConfirmTable?.reservation_party_size && (
                        <div className="flex justify-between border-b py-1 border-border">
                          <span className="text-muted-foreground">{tPosPage("reservation.partySize")}</span>
                          <span className="font-semibold">
                            {tPosPage("reservation.partySizeVal", { count: reservationConfirmTable.reservation_party_size })}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 rounded-lg bg-blue-50 p-3 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                      {tPosPage("reservation.confirmDesc")}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="mt-4 flex-col gap-2 sm:flex-row">
                  <AlertDialogCancel onClick={() => setReservationConfirmTable(null)}>
                    {tPosPage("reservation.cancel")}
                  </AlertDialogCancel>
                  <AlertDialogAction onClick={handleConfirmReservation} className="bg-blue-600 hover:bg-blue-700">
                    {tPosPage("reservation.startOrder")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Order success dialog */}
            <AlertDialog open={isOrderSuccess} onOpenChange={setIsOrderSuccess}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                    <Utensils className="h-6 w-6 text-emerald-600" />
                  </div>
                  <AlertDialogTitle className="text-center">{tPosPage("orderSuccess.title")}</AlertDialogTitle>
                  <AlertDialogDescription className="text-center">
                    {tPosPage("orderSuccess.desc")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogAction onClick={() => setIsOrderSuccess(false)} className="w-full bg-emerald-600 hover:bg-emerald-700 sm:w-full">
                    {tPosPage("orderSuccess.ok")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </OfflineQueueProvider>
      </AuthGuard>
    );
  }

  /* ── Waiter variant ── */
  return (
    <AuthGuard module={variant}>
      <OfflineQueueProvider>
        <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
          <POSHeader variant="waiter" />
          <BackendHealthBanner />
          <main className="flex flex-1 flex-col gap-3 overflow-hidden p-3 pb-[calc(4.25rem+env(safe-area-inset-bottom))] lg:flex-row lg:gap-6 lg:p-6 lg:pb-6 bg-background">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:min-h-0">
              {!selectedTable ? <TableGrid layout="waiter" /> : <MenuSection layout="waiter" />}
            </div>
            <div className="hidden min-h-0 shrink-0 lg:flex">
              <CartSidebar
                onOrderSuccess={() => setIsOrderSuccess(true)}
                onRefreshData={refreshPosTables}
                shiftGateOk={!!activeShift}
              />
            </div>
          </main>

          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden">
            <Button
              type="button"
              size="lg"
              className="pointer-events-auto h-12 touch-manipulation gap-2 rounded-full px-6 shadow-md"
              onClick={() => setCartSheetOpen(true)}
            >
              <ShoppingBag className="h-5 w-5 shrink-0" aria-hidden />
              {t("cart")}{cart.length > 0 ? ` · ${cart.length}` : ""}
            </Button>
          </div>

          <Dialog open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
            <DialogContent
              showCloseButton
              className="fixed top-auto right-0 bottom-0 left-0 z-50 max-h-[min(88dvh,640px)] w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-t-2xl rounded-b-none border-t border-border bg-background p-0 ring-1 ring-foreground/10 outline-none duration-200 data-open:animate-in data-open:slide-in-from-bottom border-border"
              backdropClassName="bg-black/40 motion-reduce:bg-black/55 motion-reduce:backdrop-blur-none"
            >
              <DialogHeader className="sr-only">
                <DialogTitle>{t("cart")}</DialogTitle>
              </DialogHeader>
              <div className="max-h-[min(88dvh,640px)] min-h-0 overflow-y-auto sm:max-h-none">
                <CartSidebar
                  className="h-full min-h-[50dvh] w-full max-w-none rounded-none border-0 shadow-none lg:min-h-0"
                  onOrderSuccess={handleOrderSuccessAndCloseSheet}
                  onRefreshData={refreshPosTables}
                  shiftGateOk={!!activeShift}
                />
              </div>
            </DialogContent>
          </Dialog>

          {renderOrderModal()}

          <AlertDialog
            open={!!reservationConfirmTable}
            onOpenChange={(open) => !open && setReservationConfirmTable(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("reservation.title")}</AlertDialogTitle>
                <AlertDialogDescription render={<div />}>
                  {reservationConfirmTable?.reservation_info && (
                    <div className="mb-3 text-base font-bold text-foreground">
                      {reservationConfirmTable.reservation_info}
                    </div>
                  )}
                  <div className="space-y-1.5 text-sm">
                    {reservationConfirmTable?.reservation_scheduled_at && (
                      <div className="flex justify-between border-b py-1 border-border">
                        <span className="text-muted-foreground">{t("reservation.scheduledAt")}</span>
                        <span className="font-semibold">{formatDate(reservationConfirmTable.reservation_scheduled_at)}</span>
                      </div>
                    )}
                    {reservationConfirmTable?.reservation_party_size && (
                      <div className="flex justify-between border-b py-1 border-border">
                        <span className="text-muted-foreground">{t("reservation.partySize")}</span>
                        <span className="font-semibold">{reservationConfirmTable.reservation_party_size} {t("reservation.pax")}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 rounded-lg bg-blue-50 p-3 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                    {t("reservation.confirmationHint")}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-4 flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setReservationConfirmTable(null)}
                >
                  {t("reservation.cancel")}
                </Button>
                <Button
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
                  onClick={handleConfirmReservation}
                >
                  {t("reservation.startOrder")}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={isOrderSuccess} onOpenChange={setIsOrderSuccess}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                  <Utensils className="h-6 w-6 text-emerald-600" />
                </div>
                <AlertDialogTitle className="text-center">{t("orderSuccess.title")}</AlertDialogTitle>
                <AlertDialogDescription className="text-center">
                  {t("orderSuccess.description")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction
                  onClick={() => setIsOrderSuccess(false)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 sm:w-full"
                >
                  {t("orderSuccess.ok")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <NotificationDrawer variant="waiter" branchId={activeBranchId || userBranchId || undefined} />
          <TableSync branchId={activeBranchId || userBranchId || undefined} variant="waiter" />
        </div>
      </OfflineQueueProvider>
    </AuthGuard>
  );
}
