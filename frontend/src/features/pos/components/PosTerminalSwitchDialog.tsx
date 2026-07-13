"use client";

import { useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePosStore } from "@/store/usePosStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { PosTerminalShiftStatusBadge } from "@/features/pos/components/PosTerminalShiftStatusBadge";

export interface PosTerminalSwitchRow {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  /** Bu terminalde açık vardiya var mı */
  has_open_shift_at_terminal?: boolean;
  /** Şubedeki (ilk) açık vardiyada bu kasadan satış var mı — geriye dönük */
  used_in_open_shift?: boolean;
}

interface PosTerminalSwitchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  terminals: PosTerminalSwitchRow[];
  currentTerminalUuid: string | null;
}

export function PosTerminalSwitchDialog({
  open,
  onOpenChange,
  terminals,
  currentTerminalUuid,
}: PosTerminalSwitchDialogProps) {
  const t = useTranslations("pos.terminalSwitch");
  const switchPosTerminal = usePosStore((s) => s.switchPosTerminal);
  const cart = usePosStore((s) => s.cart);

  const [pending, setPending] = useState<PosTerminalSwitchRow | null>(null);

  const activeList = terminals.filter((t) => t.is_active);

  function applySwitch(t: PosTerminalSwitchRow) {
    switchPosTerminal(t.code, t.id);
    setPending(null);
    onOpenChange(false);
  }

  function onPickTerminal(t: PosTerminalSwitchRow) {
    if (t.id === currentTerminalUuid) {
      onOpenChange(false);
      return;
    }
    if (cart.length > 0) {
      setPending(t);
      return;
    }
    applySwitch(t);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="border-border bg-background text-foreground sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600/15 text-blue-600 dark:text-blue-400">
              <MonitorSmartphone className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center text-lg">{t("title")}</DialogTitle>
            <DialogDescription className="text-center text-sm">
              {t("description")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[min(60vh,24rem)] flex-col gap-2 overflow-y-auto py-2">
            {activeList.map((term) => {
              const isCurrent = term.id === currentTerminalUuid;
              return (
                <button
                  key={term.id}
                  type="button"
                  onClick={() => onPickTerminal(term)}
                  className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                    isCurrent
                      ? "border-blue-500 bg-blue-50/80 text-slate-900 dark:border-blue-600 dark:bg-blue-950/40 dark:text-slate-100"
                      : "border-border bg-background text-foreground hover:border-blue-400 hover:bg-muted/60"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block">
                      {term.name}
                      {isCurrent ? (
                        <span className="ml-2 text-xs font-normal text-blue-600 dark:text-blue-400">
                          {t("current")}
                        </span>
                      ) : null}
                    </span>
                    <span className="block font-mono text-xs font-normal text-muted-foreground">
                      {term.code}
                    </span>
                  </span>
                  <PosTerminalShiftStatusBadge
                    hasOpenShift={Boolean(term.has_open_shift_at_terminal)}
                    openLabel={t("shiftOpen")}
                    closedLabel={t("shiftClosed")}
                    openTitle={t("shiftOpenTooltip")}
                    closedTitle={t("shiftClosedTooltip")}
                    className="px-2 py-0.5"
                  />
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("resetCartTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("resetCartDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) applySwitch(pending);
              }}
            >
              {t("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
