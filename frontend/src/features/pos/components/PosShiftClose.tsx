"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useShallow } from "zustand/react/shallow";
import { usePosStore } from "@/store/usePosStore";
import { useAuthStore } from "@/store/useAuthStore";
import { usePosTables } from "@/features/pos/hooks/usePosTables";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import {
  useActiveShift,
  useInvalidateActiveShift,
} from "@/features/shifts/hooks/useActiveShift";
import { closeShift, fetchZReport } from "@/features/shifts/services/shiftsApi";
import { toastApiError } from "@/lib/operationalToast";
import { normalizeDecimalCashInput } from "@/lib/cashInputNormalize";
import { formatAmount } from "@/lib/formatters";
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VirtualKeyboard } from "@/components/ui/VirtualKeyboard";
import { isPosOfflineQueueEnabled } from "@/features/pos/offline/config";
import { hasPendingQueueOperations, subscribeOfflineQueue } from "@/features/pos/offline/queueService";

function readExpectedCash(shift: Record<string, unknown> | undefined): string | null {
  if (!shift) return null;
  const v = shift.expected_cash;
  if (v === undefined || v === null) return null;
  return String(v);
}

function tableHasOpenAccount(t: {
  active_order?: unknown;
  active_orders?: unknown;
}): boolean {
  if (t.active_order != null) return true;
  const ao = t.active_orders;
  if (Array.isArray(ao)) return ao.length > 0;
  return false;
}

type PosShiftCloseLabelMode = "sm" | "fullhd";

interface PosShiftCloseProps {
  /** POS: yazılar yalnızca 1920×1080+; garson başlığı: sm ile eski davranış */
  labelBreakpoint?: PosShiftCloseLabelMode;
}

export function PosShiftClose({ labelBreakpoint = "sm" }: PosShiftCloseProps) {
  const userBranchId = useAuthStore((s) => s.user?.branch_id ?? "");
  const { activeBranchId, posTerminalUuid } = usePosStore(
    useShallow((s) => ({
      activeBranchId: s.activeBranchId,
      posTerminalUuid: s.posTerminalUuid,
    })),
  );
  const { data: posTables = [] } = usePosTables(activeBranchId ?? undefined, "pos");
  const hasOpenChecks = posTables.some((t) => tableHasOpenAccount(t));
  const branchId = activeBranchId || userBranchId || "";
  const { canManage } = useModulePermissions();
  const canClose = canManage("shifts.close_shift") || canManage("shifts.manage_shift");
  const canViewAmounts = useCanViewAmounts();
  const tShift = useTranslations("pos.shift");
  const tPay = useTranslations("pos.payment");
  const { data: activeShift } = useActiveShift(branchId || null, posTerminalUuid);
  const invalidate = useInvalidateActiveShift();

  const [open, setOpen] = useState(false);
  const [actualCash, setActualCash] = useState("");
  const [actualCard, setActualCard] = useState("");
  const [actualOther, setActualOther] = useState("");
  const [notes, setNotes] = useState("");
  const [closing, setClosing] = useState(false);
  const [didPrefill, setDidPrefill] = useState(false);
  const [activeKbdField, setActiveKbdField] = useState<"cash" | "card" | "other" | "notes" | null>(null);
  const [pendingQueueBlock, setPendingQueueBlock] = useState(false);
  const [queueGuardOpen, setQueueGuardOpen] = useState(false);

  useEffect(() => {
    if (!isPosOfflineQueueEnabled()) return;
    const refresh = () => {
      void hasPendingQueueOperations().then(setPendingQueueBlock);
    };
    refresh();
    return subscribeOfflineQueue(refresh);
  }, []);

  const shiftId = activeShift?.id;

  const blockCloseForOpenChecks = hasOpenChecks;
  const tQueue = useTranslations("pos.offlineQueue.shift");

  const zQuery = useQuery({
    queryKey: ["shift-z-prefill", shiftId],
    queryFn: () => fetchZReport(shiftId as string),
    enabled: open && !!shiftId,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!open) return;
    if (didPrefill || !zQuery.isSuccess || !zQuery.data) return;

    // Prefill actuals from system totals initially
    const cashVal = readExpectedCash(zQuery.data.shift as Record<string, unknown>);
    if (cashVal !== null) setActualCash(cashVal);

    setActualCard(String(zQuery.data.payment_breakdown?.CARD || 0));
    setActualOther(String(zQuery.data.payment_breakdown?.OTHER || 0));

    setDidPrefill(true);
  }, [open, didPrefill, zQuery.isSuccess, zQuery.data]);

  const openDialog = () => {
    if (pendingQueueBlock) {
      setQueueGuardOpen(true);
      return;
    }
    setNotes("");
    setActualCash("");
    setActualCard("");
    setActualOther("");
    setDidPrefill(false);
    setOpen(true);
  };

  const submitClose = async () => {
    if (!shiftId) return;
    setClosing(true);
    try {
      await closeShift(
        shiftId,
        actualCash.trim() || "0",
        actualCard.trim() || "0",
        actualOther.trim() || "0",
        notes.trim(),
      );
      toast.success(tShift("closed"));
      invalidate(branchId);
      // Vardiya kapandığında bir sonraki açılış için terminal seçimini de temizle
      void usePosStore.getState().persistTerminalSelection("", null);
      setOpen(false);
    } catch (e) {
      toastApiError(e, tShift("closeError"));
    } finally {
      setClosing(false);
    }
  };

  if (!branchId || !activeShift || !canClose) return null;

  const expectedCash =
    didPrefill && zQuery.isSuccess && zQuery.data
      ? Number(readExpectedCash(zQuery.data.shift as Record<string, unknown>) || 0)
      : 0;

  const expectedCard = zQuery.data?.payment_breakdown?.CARD || 0;
  const expectedOther = zQuery.data?.payment_breakdown?.OTHER || 0;

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={blockCloseForOpenChecks}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border py-2 text-sm font-medium  shadow-sm transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-900 disabled:cursor-not-allowed disabled:opacity-50 border-input bg-card text-foreground dark:hover:border-amber-700 dark:hover:bg-amber-950/30",
          labelBreakpoint === "fullhd" ? "px-2 fullhd:px-3" : "px-3",
        )}
        title={
          blockCloseForOpenChecks
            ? tShift("openChecksTooltip")
            : pendingQueueBlock
              ? tQueue("pendingQueueTitle")
              : tShift("closeTooltip")
        }
      >
        <Lock size={16} className="text-amber-600 dark:text-amber-400" />
        <span className={labelBreakpoint === "fullhd" ? "hidden fullhd:inline" : "hidden sm:inline"}>
          {tShift("close")}
        </span>
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setDidPrefill(false);
            setNotes("");
            setActualCash("");
            setActualCard("");
            setActualOther("");
            setActiveKbdField(null);
          }
        }}
      >
        <DialogContent className={cn(
          "transition-[max-width] duration-300 ease-in-out",
          activeKbdField ? "sm:max-w-[850px]" : "sm:max-w-md"
        )}>
          <DialogHeader>
            <DialogTitle>{tShift("close")}</DialogTitle>
            <DialogDescription>
              {tShift("confirmSummary")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col md:flex-row gap-6 items-start">
            <div className="flex-1 w-full space-y-4">

          {blockCloseForOpenChecks && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              {tShift("openChecksWarning")}
            </p>
          )}

          {zQuery.isFetching && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {tShift("updating")}
            </div>
          )}

          <div className="space-y-4">
            {/* Nakit */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <label>{tPay("cashRegister")}</label>
                {zQuery.isSuccess && (
                  <span>{tPay("system")}: {formatAmount(expectedCash, canViewAmounts)}</span>
                )}
              </div>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={actualCash}
                onFocus={() => setActiveKbdField("cash")}
                onChange={(e) => setActualCash(normalizeDecimalCashInput(e.target.value))}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-lg font-semibold tracking-tight focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 border-input bg-card text-foreground"
                placeholder="0.00"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Kredi Kartı */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-2xs font-medium text-muted-foreground uppercase tracking-wider">
                  <label>{tPay("card")}</label>
                  {zQuery.isSuccess && (
                    <span>{formatAmount(expectedCard, canViewAmounts)}</span>
                  )}
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  onFocus={() => setActiveKbdField("card")}
                  value={actualCard}
                  onChange={(e) => setActualCard(normalizeDecimalCashInput(e.target.value))}
                  className="w-full rounded-lg border border-border px-3 py-2 focus:border-blue-500 border-input bg-card text-foreground"
                  placeholder="0.00"
                />
              </div>

              {/* Diğer */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-2xs font-medium text-muted-foreground uppercase tracking-wider">
                  <label>{tPay("other")}</label>
                  {zQuery.isSuccess && (
                    <span>{formatAmount(expectedOther, canViewAmounts)}</span>
                  )}
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  onFocus={() => setActiveKbdField("other")}
                  value={actualOther}
                  onChange={(e) => setActualOther(normalizeDecimalCashInput(e.target.value))}
                  className="w-full rounded-lg border border-border px-3 py-2 focus:border-blue-500 border-input bg-card text-foreground"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Notlar */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{tShift("notes")}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onFocus={() => setActiveKbdField("notes")}
                rows={2}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 border-input bg-card text-foreground"
                placeholder={tShift("notesPlaceholder")}
              />
            </div>
          </div>

              <button
                type="button"
                disabled={closing || blockCloseForOpenChecks}
                onClick={() => void submitClose()}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white shadow-md shadow-slate-900/10 transition hover: disabled:opacity-50 dark:hover:"
              >
                {closing ? <Loader2 className="size-4 animate-spin" /> : null}
                {closing ? tShift("closing") : tShift("close")}
              </button>
            </div>

            {/* Sağ Taraftaki Klavye Konteyneri */}
            {activeKbdField && (
              <div className="w-full md:w-[380px] shrink-0 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="rounded-xl border /50 p-1 border-border bg-card/50">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-white border-border mb-2">
                    <span className="text-2xs font-bold tracking-widertext-muted-foreground">
                      {activeKbdField === "notes" ? tShift("kbdAlpha") : tShift("kbdNumeric")}
                    </span>
                    <button 
                      onClick={() => setActiveKbdField(null)}
                      className="text-2xs font-medium text-blue-600 hover:underline"
                    >
                      {tShift("kbdClose")}
                    </button>
                  </div>
                  <VirtualKeyboard
                    value={
                      activeKbdField === "cash" ? actualCash :
                      activeKbdField === "card" ? actualCard :
                      activeKbdField === "other" ? actualOther :
                      notes
                    }
                    mode={activeKbdField === "notes" ? "alpha" : "numeric"}
                    onChange={(v) => {
                       if (activeKbdField === "cash") setActualCash(normalizeDecimalCashInput(v));
                       else if (activeKbdField === "card") setActualCard(normalizeDecimalCashInput(v));
                       else if (activeKbdField === "other") setActualOther(normalizeDecimalCashInput(v));
                       else setNotes(v);
                    }}
                    onCancel={() => setActiveKbdField(null)}
                    onSubmit={() => setActiveKbdField(null)}
                    className="border-none shadow-none bg-transparent p-0"
                  />
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={queueGuardOpen} onOpenChange={setQueueGuardOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tQueue("pendingQueueTitle")}</DialogTitle>
            <DialogDescription>{tQueue("pendingQueueDescription")}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
