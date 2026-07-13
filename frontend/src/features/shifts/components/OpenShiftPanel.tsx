"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Loader2, Keyboard, Vault } from "lucide-react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/operationalToast";
import { VirtualKeyboard } from "@/components/ui/VirtualKeyboard";
import { cn } from "@/lib/utils";
import { normalizeDecimalCashInput } from "@/lib/cashInputNormalize";
import { openShift } from "../services/shiftsApi";
import { useInvalidateActiveShift } from "../hooks/useActiveShift";

interface OpenShiftPanelProps {
  branchId: string;
  atTerminalId?: string | null;
  onOpened?: () => void;
  /** Dokunmatik sanal klavye (POS vb.) */
  touchKeyboard?: boolean;
}

export function OpenShiftPanel({ 
  branchId, 
  atTerminalId,
  onOpened, 
  touchKeyboard = false 
}: OpenShiftPanelProps) {
  const t = useTranslations("shifts");
  const [opening, setOpening] = useState("0");
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const invalidate = useInvalidateActiveShift();

  const setOpeningFromKb = (next: string) => {
    setOpening(normalizeDecimalCashInput(next));
  };

  const handleOpen = async () => {
    setIsSubmitting(true);
    try {
      await openShift(branchId, opening || "0", atTerminalId);
      toast.success(t("openPanel.toastOpen"));
      invalidate(branchId);
      onOpened?.();
    } catch (e) {
      toastApiError(e, t("openPanel.toastFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border p-8 shadow-md border-border bg-card">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white">
          <Vault size={28} />
        </div>
        <h2 className="text-lg font-bold text-foreground">{t("openPanel.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("openPanel.subtitle")}
        </p>
      </div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("openPanel.openingCash")}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={opening}
          onChange={(e) => setOpening(normalizeDecimalCashInput(e.target.value))}
          className="min-w-0 flex-1 rounded-xl border border-border px-3 py-2.5 border-input bg-muted text-foreground"
        />
        {touchKeyboard && (
          <button
            type="button"
            aria-label={showKeyboard ? t("openPanel.ariaHideKeyboard") : t("openPanel.ariaShowKeyboard")}
            aria-expanded={showKeyboard}
            onClick={() => setShowKeyboard((v) => !v)}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border   transition hover:",
              "border-input bg-muted text-foreground dark:hover:/80",
              showKeyboard && "border-blue-400 bg-blue-50 text-blue-800 dark:border-blue-600 dark:bg-blue-950/50 dark:text-blue-100",
            )}
          >
            <Keyboard className="size-5" aria-hidden />
          </button>
        )}
      </div>
      {touchKeyboard && showKeyboard && (
        <div className="mt-3">
          <VirtualKeyboard
            value={opening}
            onChange={setOpeningFromKb}
            mode="numeric"
            showModeToggle={false}
            onSubmit={() => {
              if (!isSubmitting) void handleOpen();
            }}
            onCancel={() => setShowKeyboard(false)}
            className="shadow-md"
          />
        </div>
      )}
      <button
        type="button"
        disabled={isSubmitting}
        onClick={() => void handleOpen()}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : null}
        {t("openPanel.submit")}
      </button>
    </div>
  );
}
