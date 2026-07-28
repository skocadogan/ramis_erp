"use client";

import { memo, useCallback, useRef } from "react";
import { usePosStore, selectCartTotal } from "@/store/usePosStore";
import { useOptimisticOrderCreate } from "@/features/pos/hooks/usePosMutations";
import { usePosBranches } from "@/features/pos/hooks/usePosBranches";
import { usePosZones } from "@/features/pos/hooks/usePosTables";

import { useShallow } from "zustand/react/shallow";
import { useAuthStore } from "@/store/useAuthStore";
import { ReceiptText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";
import { useState } from "react";
import { formatQuantityWithUnit } from "@/lib/formatters";
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts";
import { cn } from "@/lib/utils";
import { v4 as uuidv4 } from "uuid";
import { checkPosStationStock, type PosStationStockIssue } from "@/features/pos/lib/posStationStockCheck";
import { useKitchenQueueBuffer } from "@/features/pos/hooks/useKitchenQueueBuffer";
import { usePosConnectivity } from "@/features/pos/offline/connectivity";
import { executeOrEnqueue, extractOrderFromResponse } from "@/features/pos/offline/executeOrEnqueue";
import { signalPosCustomerDisplaySuccess } from "@/features/pos/lib/posCustomerDisplaySync";
import { dispatchReceiptPrints } from "@/features/pos/lib/dispatchReceiptPrints";
import { buildStationOrderPrintJobs } from "@/features/pos/lib/buildStationOrderPrintJobs";
import { printersApi, type Printer } from "@/features/printing/services/printersApi";
import { isPosOfflineQueueEnabled } from "@/features/pos/offline/config";
import type { DeferredPrintJob } from "@/features/pos/offline/types";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CartItemRow } from "./CartItemRow";
import { CartSummary } from "./CartSummary";
import { OrderActions } from "./OrderActions";

interface CartSidebarProps {
  onOrderSuccess: () => void;
  onRefreshData: () => Promise<void>;
  shiftGateOk?: boolean;
  className?: string;
}

function parseStockQty(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const CartSidebar = memo(function CartSidebar({
  onOrderSuccess,
  onRefreshData,
  shiftGateOk = true,
  className,
}: CartSidebarProps) {
  const canViewAmounts = useCanViewAmounts();
  const user = useAuthStore((s) => s.user);
  const tCart = useTranslations("pos.cart");
  const tStock = useTranslations("pos.stock");
  const tAuth = useTranslations("pos.auth");
  const tMenu = useTranslations("pos.menu");
  const tMisc = useTranslations("pos.misc");
  const tErr = useTranslations("pos.errors");
  const locale = useLocale();
  const { data: branches = [] } = usePosBranches();
  const {
    selectedTable,
    cart,
    setSelectedTable,
    clearCart,
    updateQuantity,
  } = usePosStore(useShallow((state) => ({
    selectedTable: state.selectedTable,
    cart: state.cart,
    setSelectedTable: state.setSelectedTable,
    clearCart: state.clearCart,
    updateQuantity: state.updateQuantity,
  })));

  const cartTotal = usePosStore(selectCartTotal);

  const { activeBranchId, autoPrintOrder, stockTrackingMode } = usePosStore(useShallow((state) => ({
    activeBranchId: state.activeBranchId,
    autoPrintOrder: state.autoPrintOrder,
    stockTrackingMode: state.stockTrackingMode,
  })));
  const { data: zones = [] } = usePosZones({ branchId: activeBranchId ?? undefined });

  const hasForceStockPermission = user?.permissions?.includes("pos.force_stock_order") || user?.is_superuser;
  const { offlineMode } = usePosConnectivity();
  const tOffline = useTranslations("pos.offlineQueue");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notes, setNotes] = useState("");
  const [stockBlockOpen, setStockBlockOpen] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [cartLimitDialog, setCartLimitDialog] = useState<{
    max: number;
    added: number;
  } | null>(null);
  const [stockBlockIssues, setStockBlockIssues] = useState<PosStationStockIssue[]>([]);

  // "Ürün kısıtına göre" modunda (remaining_portions) sepet miktarı sınırına
  // takıldığında kullanıcıyı bilgilendir.
  const handleUpdateQuantity = useCallback(
    (cartId: string, delta: number) => {
      const result = updateQuantity(cartId, delta);
      if (result.capped && result.maxAddable != null) {
        const max = result.added + (result.maxAddable ?? 0);
        setCartLimitDialog({ max, added: result.added });
      }
    },
    [updateQuantity],
  );
  const { expectedBuffer, busyThreshold } = useKitchenQueueBuffer(
    cart,
    activeBranchId,
    stockTrackingMode
  );
  const isKitchenBusy = expectedBuffer >= busyThreshold;

  const canForcePastCriticalStock =
    stockBlockIssues.length > 0 &&
    stockBlockIssues.every((i) => i.code === "CRITICAL_STOCK");

  // ── Optimistic order create: masa durumunu anlık güncelle ──────────────
  const optimisticOrder = useOptimisticOrderCreate();
  const optimisticCtxRef = useRef<Awaited<ReturnType<typeof optimisticOrder.applyOptimistic>> | null>(null);

  const submitOrder = async (opts?: { skipStationStockCheck?: boolean }) => {
    if (!selectedTable || cart.length === 0 || branches.length === 0) return;
    if (!shiftGateOk) {
      toast.error(tCart("shiftError"));
      return;
    }

    if (selectedTable.virtual_kind === "takeaway_order") {
      toast.error(tCart("takeawayOrderBlocked"));
      return;
    }

    const branchId = activeBranchId || branches[0].id;

    setIsSubmitting(true);
    try {
      if (!opts?.skipStationStockCheck && !(offlineMode && isPosOfflineQueueEnabled())) {
        try {
          const stockCheck = await checkPosStationStock(
            branchId,
            cart.map((item) => ({
              product_id: item.product.id,
              quantity: item.quantity,
            })),
            stockTrackingMode
          );
          if (!stockCheck.ok && stockCheck.issues.length > 0) {
            setStockBlockIssues(stockCheck.issues);
            setStockBlockOpen(true);
            return;
          }
        } catch {
          if (!(offlineMode && isPosOfflineQueueEnabled())) {
            toast.error(tCart("stockCheckFailed"));
            return;
          }
        }
      }

      // Fizik masa: anında OCCUPIED. Paket new_slot: tw-ord__ kartı API sonrası gelir —
      // yanlışlıkla tw-new__'i OCCUPIED yapmak sanal listeyi bozar.
      const zone = zones.find(z => z.id === selectedTable.zone);
      const order_type = zone?.is_takeaway ? 'TAKEAWAY' : 'TABLE';
      const isNewTakeawayVirtual = selectedTable.virtual_kind === 'new_slot';
      if (!isNewTakeawayVirtual) {
        optimisticCtxRef.current = await optimisticOrder.applyOptimistic(selectedTable!.id);
      } else {
        optimisticCtxRef.current = null;
      }

      const receiptTableName =
        zone?.is_takeaway && isNewTakeawayVirtual
          ? tCart("newTakeawaySlotTitle")
          : selectedTable.name;

      const payload = {
        branch_id: branchId,
        // tw-new__{zone} → backend takeaway_zone çözümler; null gönderme (çoklu paket bölgesi)
        table_id: selectedTable.id,
        order_type,
        items: cart.map(item => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.unitPrice || (
            item.product.has_discount && item.product.discounted_price
              ? item.product.discounted_price
              : item.product.base_price
          ),
          unit_name: item.selectedUnit?.name || null,
          modifier_ids: (item.selectedModifiers ?? []).map((m) => m.id),
          ...(item.notes?.trim() ? { notes: item.notes.trim() } : {}),
        })),
        stock_tracking_mode: stockTrackingMode,
        notes: notes.trim(),
        ...(opts?.skipStationStockCheck ? { skip_station_stock_check: true } : {}),
      };

      const deferredPrints: DeferredPrintJob[] = [];
      const printContextBase = {
        table_name: receiptTableName,
        waiter_name: user?.username || tMisc("unknown"),
        discount: 0,
        branch_name: branches.find((b) => b.id === branchId)?.name || tMisc("branch"),
        created_at: new Date().toLocaleString(locale),
      };

      let kitchenPrinters: Printer[] = [];
      if (autoPrintOrder) {
        try {
          const printerData = await printersApi.getPrinters({
            branch_id: branchId,
            usage_type: "KITCHEN",
            is_active: true,
          });
          kitchenPrinters =
            "results" in printerData
              ? (printerData.results as Printer[])
              : (printerData as unknown as Printer[]);
        } catch {
          kitchenPrinters = [];
        }

        const pendingJobs = buildStationOrderPrintJobs({
          cart,
          kitchenPrinters,
          baseContext: printContextBase,
          orderNumber: tMisc("new"),
          idempotencyPrefix: `pending:${uuidv4()}`,
        });
        pendingJobs.forEach((job) => {
          if (!job.idempotencyKey) return;
          deferredPrints.push({
            templateSlug: job.templateSlug,
            printerId: job.printerId,
            context: job.context,
            idempotencyKey: job.idempotencyKey,
          });
        });
      }

      const clientOpId = uuidv4();
      const result = await executeOrEnqueue({
        offlineMode,
        type: "CREATE_ORDER",
        endpoint: "/orders/main/",
        payload,
        branchId,
        label: tOffline("labels.createOrder", { table: receiptTableName }),
        clientOpId,
        meta: {
          skipStationStockCheck: Boolean(opts?.skipStationStockCheck || offlineMode),
          deferredPrints: deferredPrints.length ? deferredPrints : undefined,
          tableName: receiptTableName,
        },
      });

      if (result.mode === "queued") {
        toast.success(tOffline("messages.queuedOrder"));
        clearCart();
        setNotes("");
        setSelectedTable(null);
        onOrderSuccess();
        return;
      }

      const order = extractOrderFromResponse(result.data);
      const notice = (order as { kitchen_queue_notice?: { show?: boolean; extra_minutes?: number } })
        .kitchen_queue_notice;
      if (notice?.show && typeof notice.extra_minutes === "number") {
        toast.info(tCart("kitchenQueueNotice", { minutes: notice.extra_minutes }), { duration: 6_000 });
      }
      await onRefreshData();
      signalPosCustomerDisplaySuccess('ORDER');

      if (autoPrintOrder && kitchenPrinters.length > 0) {
        const oid = order.id;
        const printJobs = buildStationOrderPrintJobs({
          cart,
          kitchenPrinters,
          baseContext: printContextBase,
          orderNumber: order.order_number || tMisc("new"),
          orderId: oid,
          idempotencyPrefix: oid || undefined,
        });
        void dispatchReceiptPrints(printJobs, {
          getPrinterErrorMessage: (id) => tErr("printerQueue", { id }),
          successMessage: tCart("receiptQueued"),
          partialSuccessMessage: ({ succeeded, failed, total }) =>
            tCart("receiptQueuedPartial", { succeeded, failed, total }),
        });
      }

      clearCart();
      setNotes("");
      setSelectedTable(null);
      onOrderSuccess();
    } catch (e) {
      // ── OPTIMISTIC ROLLBACK + cache tazeleme (onRefreshData çağrılmadı) ──
      optimisticOrder.rollbackOptimistic(optimisticCtxRef.current);
      optimisticCtxRef.current = null;
      optimisticOrder.onSettled();

      console.error(tErr("orderError"), e);
      toast.error(tCart("orderError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedDisplayName =
    selectedTable?.virtual_kind === "new_slot"
      ? tCart("newTakeawaySlotTitle")
      : selectedTable?.name ?? "";

  const handleForceSubmitPastCritical = async () => {
    setStockBlockOpen(false);
    await submitOrder({ skipStationStockCheck: true });
  };

  return (
    <>
      <div
        className={cn(
          "flex h-full w-80 shrink-0 flex-col rounded-2xl border border-border p-5 shadow-sm border-border bg-card lg:w-96",
          className
        )}
      >
        <div className="mb-4 flex shrink-0 items-center gap-2 border-b pb-3 border-border">
          <ReceiptText size={20} className="text-blue-600 dark:text-blue-400" />
          <h2 className="text-lg font-bold text-foreground">
            {selectedTable ? tCart("titleWithTable", { name: selectedDisplayName }) : tCart("title")}
          </h2>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto min-h-0 mb-4 pr-1 scrollbar-thin">
          {selectedTable ? (
            cart.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed /50 p-6 border-border bg-muted/40">
                <span className="text-center text-sm font-medium leading-relaxed text-muted-foreground dark:text-muted-foreground">
                  {tCart("empty")}
                </span>
              </div>
            ) : (
              <CartItemRow cart={cart} onUpdateQuantity={handleUpdateQuantity} />
            )
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed /50 p-6 border-border bg-muted/40">
              <span className="text-center text-sm font-medium text-muted-foreground dark:text-muted-foreground">{tCart("selectTable")}</span>
            </div>
          )}
        </div>

        {selectedTable && cart.length > 0 && (
          <CartSummary
            notes={notes}
            onNotesChange={setNotes}
            cartTotal={cartTotal}
            canViewAmounts={canViewAmounts}
            tCart={tCart}
          />
        )}

        <OrderActions
          selectedTable={selectedTable}
          cart={cart}
          isSubmitting={isSubmitting}
          shiftGateOk={shiftGateOk}
          isKitchenBusy={isKitchenBusy}
          expectedBuffer={expectedBuffer}
          submitOrder={submitOrder}
          tCart={tCart}
        />
      </div>

      <AlertDialog open={stockBlockOpen} onOpenChange={setStockBlockOpen}>
        <AlertDialogContent className="flex w-[min(96vw,42rem)] max-w-[min(96vw,42rem)] flex-col gap-4 overflow-hidden sm:max-w-2xl">
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/50">
              <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-500" aria-hidden />
            </div>
            <AlertDialogTitle className="text-center">
              {canForcePastCriticalStock ? tStock("criticalTitle") : tStock("warningTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center sm:text-start">
              {canForcePastCriticalStock ? tStock("criticalDesc") : tStock("warningDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-[min(70vh,640px)] space-y-3 overflow-y-auto rounded-lg border border-border /80 p-3 text-xs border-border bg-card/50 text-muted-foreground">
            {stockBlockIssues.map((i, idx) => {
              const isInsufficient = i.code === "INSUFFICIENT_STOCK" || i.code === "SOLD_OUT" || i.code === "LIMITED_EXCEEDED";
              const physicalQty = parseStockQty(i.physical);
              const reservedQty = parseStockQty(i.reserved);
              const requiredQty = parseStockQty(i.required);
              const availableQty = parseStockQty(i.available);
              const isReservedIssue = isInsufficient && physicalQty > 0 && availableQty <= 0;

              return (
                <li
                  key={`${i.stock_item_name}-${idx}`}
                  className="border-b border-border/80 pb-3 last:border-b-0 last:pb-0 border-border/80"
                >
                  <div className="flex items-center gap-3">
                    <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${isInsufficient ? "bg-rose-500" : "bg-amber-500"}`} />
                    <div className="flex min-w-0 flex-col">
                      <span className="font-bold text-foreground">{i.stock_item_name}</span>
                      <span className="text-2xs text-muted-foreground">{i.warehouse_name} {i.station_name ? `· ${i.station_name}` : ""}</span>
                    </div>
                  </div>

                  <div className="ml-5 mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1.5 rounded-md p-3 bg-muted/50">
                    <div className="text-2xs tracking-widertext-muted-foreground">{tStock("physical")}</div>
                    <div className="text-right text-sub font-medium tabular-nums text-foreground">{formatQuantityWithUnit(physicalQty, i.unit)}</div>

                    <div className="text-2xs tracking-widertext-muted-foreground">{tStock("reserved")}</div>
                    <div className="space-y-0.5 text-right text-sub font-medium tabular-nums text-amber-600 dark:text-amber-400">
                      {reservedQty > 0 ? (
                        <div>-{formatQuantityWithUnit(reservedQty, i.unit)}</div>
                      ) : null}
                      {requiredQty > 0 ? (
                        <div>-{formatQuantityWithUnit(requiredQty, i.unit)}</div>
                      ) : null}
                      {reservedQty === 0 && requiredQty === 0 ? (
                        <div className="text-muted-foreground">—</div>
                      ) : null}
                    </div>

                    <div className="border-t pt-1.5 text-2xs font-bold tracking-widertext-muted-foreground border-border">{tStock("available")}</div>
                    <div className={`border-t pt-1.5 text-right text-sub font-bold tabular-nums border-border ${availableQty <= 0 ? "text-rose-600 dark:text-rose-400" : "text-blue-600 dark:text-blue-400"}`}>
                      {formatQuantityWithUnit(availableQty, i.unit)}
                    </div>
                  </div>

                  <div className="ml-5 mt-2 text-2xs font-medium italic">
                    {isReservedIssue ? (
                      <span className="text-amber-700 dark:text-amber-400">{tStock("reservedDepleted")}</span>
                    ) : isInsufficient ? (
                      <span className="text-rose-600 dark:text-rose-400">{tStock("insufficient")}</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">{tStock("belowCritical")}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <AlertDialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel className="w-full sm:w-auto">{tStock("ok")}</AlertDialogCancel>
            {stockBlockIssues.length > 0 ? (
              <Button
                type="button"
                variant={canForcePastCriticalStock ? "default" : "destructive"}
                className={`w-full sm:w-auto ${canForcePastCriticalStock ? "bg-amber-600 hover:bg-amber-700" : ""}`}
                onClick={() => {
                  if (!canForcePastCriticalStock) {
                    setAuthDialogOpen(true);
                  } else {
                    void handleForceSubmitPastCritical();
                  }
                }}
              >
                {canForcePastCriticalStock ? tStock("forceStock") : tStock("forceStockAuth")}
              </Button>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/50">
              <AlertTriangle className="h-6 w-6 text-rose-600 dark:rose-500" aria-hidden />
            </div>
            <AlertDialogTitle className="text-center">{tAuth("title")}</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              {tAuth("desc")}
              <br /><br />
              <span className="font-bold text-foreground italic">
                {tAuth("requiredPermission")}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tAuth("cancel")}</AlertDialogCancel>
            {hasForceStockPermission ? (
              <AlertDialogAction
                className="bg-rose-600 text-white hover:bg-rose-700"
                onClick={() => {
                  setAuthDialogOpen(false);
                  void handleForceSubmitPastCritical();
                }}
              >
                {tAuth("confirm")}
              </AlertDialogAction>
            ) : (
              <div className="flex items-center justify-center rounded-lg p-2 text-sub text-muted-foreground bg-muted">
                {tAuth("noPermission")}
              </div>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={cartLimitDialog !== null}
        onOpenChange={(open) => !open && setCartLimitDialog(null)}
      >
        <AlertDialogContent className="flex w-[min(96vw,42rem)] max-w-[min(96vw,42rem)] flex-col gap-4 overflow-hidden sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{tMenu("cartLimitTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {cartLimitDialog && cartLimitDialog.added > 0
                ? tMenu("cartLimitDescPartial", {
                    max: cartLimitDialog.max,
                    added: cartLimitDialog.added,
                  })
                : cartLimitDialog
                  ? tMenu("cartLimitDesc", { max: cartLimitDialog.max })
                  : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setCartLimitDialog(null)}>
              {tMenu("cartLimitOk")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

export { CartSidebar };
