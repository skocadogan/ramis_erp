"use client";

import { useState } from "react";
import { isAxiosError } from "axios";
import { Flame, Loader2, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KdsWarehouseStockItemSelect } from "@/features/kds/components/KdsWarehouseStockItemSelect";
import { recordKdsReturnCancel, recordKdsWaste } from "@/features/kds/services/kdsApi";
import { inventoryApi } from "@/features/inventory/services/inventoryApi";
import { queryKeys } from "@/lib/queryKeys";
import type { KdsLinkedStockLevel } from "@/features/kds/hooks/useKdsLinkedStock";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type OperationMode = "WASTE" | "RETURN" | "CANCEL";

interface Props {
  open: boolean;
  stationId: string;
  warehouseName?: string | null;
  onClose: () => void;
}

export function KdsWasteModal({ open, stationId, warehouseName, onClose }: Props) {
  const t = useTranslations("kds");
  const qc = useQueryClient();
  const [mode, setMode] = useState<OperationMode>("WASTE");
  const [stockItemId, setStockItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [reasonCode, setReasonCode] = useState("EXPIRED");
  const [serverError, setServerError] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState("");

  const { data: reasonCodes = [] } = useQuery({
    queryKey: ["kdsReturnCancelReasonCodes"],
    queryFn: () => inventoryApi.getReturnCancelReasonCodes(),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        stock_item_id: stockItemId,
        quantity: Number(quantity.replace(",", ".")),
        unit: selectedUnit || undefined,
        notes: notes.trim() || undefined,
      };
      if (mode === "WASTE") {
        return recordKdsWaste(stationId, payload);
      }
      return recordKdsReturnCancel(stationId, {
        ...payload,
        movement_type: mode,
        reason_code: reasonCode,
      });
    },
    onSuccess: () => {
      toast.success(
        mode === "WASTE"
          ? t("waste.successMessage")
          : mode === "RETURN"
            ? t("waste.returnSuccessMessage")
            : t("waste.cancelSuccessMessage"),
      );
      void qc.invalidateQueries({ queryKey: queryKeys.kdsLinkedStock(stationId) });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = isAxiosError(err)
        ? String(
            (err.response?.data as { error?: string } | undefined)?.error ??
              (err.response?.data as { detail?: string } | undefined)?.detail ??
              t("waste.errorGeneric"),
          )
        : t("waste.errorGeneric");
      setServerError(msg);
      toast.error(msg);
    },
  });

  const onSelectItem = (level: KdsLinkedStockLevel) => {
    setStockItemId(level.stock_item);
    setSelectedUnit(level.stock_item_unit || "");
    setServerError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (!stockItemId) {
      toast.error(t("waste.errorNoItem"));
      return;
    }
    const q = Number(quantity.replace(",", "."));
    if (!Number.isFinite(q) || q <= 0) {
      toast.error(t("waste.errorInvalidQty"));
      return;
    }
    submitMutation.mutate();
  };

  const title =
    mode === "WASTE" ? t("waste.title") : mode === "RETURN" ? t("waste.returnTitle") : t("waste.cancelTitle");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent layout="scroll" size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="rounded-md bg-amber-100 p-1.5 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">
              {mode === "WASTE" ? <Flame size={18} /> : <RotateCcw size={18} />}
            </span>
            {title}
          </DialogTitle>
          <DialogDescription>
            {warehouseName ? (
              t("waste.warehouseLabel", { name: warehouseName })
            ) : (
              <span className="text-amber-700 dark:text-amber-400">{t("inventory.noWarehouse")}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form id="kds-waste-form" onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {(["WASTE", "RETURN", "CANCEL"] as OperationMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs font-ui-semibold transition-colors",
                    mode === m
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {m === "WASTE" ? t("waste.modeWaste") : m === "RETURN" ? t("waste.modeReturn") : t("waste.modeCancel")}
                </button>
              ))}
            </div>

            {serverError ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {serverError}
              </div>
            ) : null}

            <div>
              <label className="mb-1.5 block text-xs font-ui-bold uppercase tracking-wide text-muted-foreground">
                {t("waste.stockItem")}
              </label>
              <KdsWarehouseStockItemSelect
                stationId={stationId}
                value={stockItemId}
                onSelect={onSelectItem}
                disabled={submitMutation.isPending}
              />
            </div>

            {mode !== "WASTE" ? (
              <div>
                <label className="mb-1.5 block text-xs font-ui-bold uppercase tracking-wide text-muted-foreground">
                  {t("waste.reason")}
                </label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                  disabled={submitMutation.isPending}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  {reasonCodes.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-ui-bold uppercase tracking-wide text-muted-foreground">
                  {t("waste.quantity")}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => {
                    setQuantity(e.target.value);
                    setServerError(null);
                  }}
                  placeholder="0"
                  disabled={submitMutation.isPending}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-ui-bold uppercase tracking-wide text-muted-foreground">
                  {t("waste.unit")}
                </label>
                <input
                  value={selectedUnit}
                  readOnly
                  className="w-full cursor-not-allowed rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-ui-bold uppercase tracking-wide text-muted-foreground">
                {t("waste.notes")}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                disabled={submitMutation.isPending}
                placeholder={t("waste.notesPlaceholder")}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <p className="text-sub leading-relaxed text-muted-foreground">
              {mode === "WASTE" ? t("waste.infoText") : t("waste.returnCancelInfoText")}
            </p>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitMutation.isPending}>
              {t("actions.cancel")}
            </Button>
            <Button type="submit" form="kds-waste-form" disabled={submitMutation.isPending || !warehouseName}>
              {submitMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "WASTE" ? (
                <Flame size={16} />
              ) : (
                <RotateCcw size={16} />
              )}
              {t("waste.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
