"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type {
  ExpiringLot,
  ExpiryActionPreviewSummary,
  ExpiryActionType,
  Warehouse,
} from "@/features/warehouse/types"

type ExpiryActionDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  lot: ExpiringLot | null
  actionType: ExpiryActionType | null
  automationEnabled?: boolean
  warehouses?: Warehouse[]
  onLegacyConfirm: (notes: string) => void
  onPreview: (payload: {
    notes: string
    target_warehouse_id?: string
  }) => Promise<ExpiryActionPreviewSummary>
  onExecute: (payload: {
    notes: string
    target_warehouse_id?: string
  }) => void
  preview: ExpiryActionPreviewSummary | null
  isPreviewPending?: boolean
  isExecutePending?: boolean
}

export function ExpiryActionDialog({
  open,
  onOpenChange,
  lot,
  actionType,
  automationEnabled = false,
  warehouses = [],
  onLegacyConfirm,
  onPreview,
  onExecute,
  preview,
  isPreviewPending,
  isExecutePending,
}: ExpiryActionDialogProps) {
  const t = useTranslations("warehouse")
  const [notes, setNotes] = useState("")
  const [targetWarehouseId, setTargetWarehouseId] = useState("")
  const [step, setStep] = useState<"form" | "preview">("form")

  const sourceWarehouse = useMemo(
    () => warehouses.find((w) => w.id === lot?.warehouse_id),
    [warehouses, lot?.warehouse_id],
  )
  const needsTargetWarehouse =
    automationEnabled && actionType === "TRANSFER_SUGGEST" && sourceWarehouse?.warehouse_type === "KITCHEN"

  const targetOptions = useMemo(
    () => warehouses.filter((w) => w.id !== lot?.warehouse_id),
    [warehouses, lot?.warehouse_id],
  )

  useEffect(() => {
    if (open) {
      setNotes("")
      setTargetWarehouseId("")
      setStep("form")
    }
  }, [open, lot?.id, actionType])

  useEffect(() => {
    if (preview && automationEnabled) {
      setStep("preview")
    }
  }, [preview, automationEnabled])

  const actionLabel =
    actionType === "PRIORITY_CONSUME"
      ? t("expiryActions.priorityConsume")
      : actionType === "TRANSFER_SUGGEST"
        ? t("expiryActions.transferSuggest")
        : actionType === "PLAN_NOTE"
          ? t("expiryActions.planNote")
          : ""

  const handleFormSubmit = async () => {
    if (!lot || !actionType) return
    if (!automationEnabled) {
      onLegacyConfirm(notes)
      return
    }
    await onPreview({
      notes,
      target_warehouse_id: needsTargetWarehouse ? targetWarehouseId || undefined : undefined,
    })
  }

  const handleExecute = () => {
    onExecute({
      notes,
      target_warehouse_id: needsTargetWarehouse ? targetWarehouseId || undefined : undefined,
    })
  }

  const isPending = isPreviewPending || isExecutePending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {step === "preview" && automationEnabled
              ? t("expiryActions.previewTitle")
              : t("expiryActions.dialogTitle")}
          </DialogTitle>
          <DialogDescription>
            {lot
              ? t("expiryActions.dialogDescription", { product: lot.stock_item_name, action: actionLabel })
              : null}
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <DialogBody className="space-y-4">
            {needsTargetWarehouse ? (
              <div>
                <label htmlFor="expiry-target-wh" className="mb-1.5 block text-sm font-medium text-foreground">
                  {t("expiryActions.targetWarehouseLabel")}
                </label>
                <select
                  id="expiry-target-wh"
                  value={targetWarehouseId}
                  onChange={(e) => setTargetWarehouseId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  <option value="">{t("expiryActions.selectWarehouse")}</option>
                  {targetOptions.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div>
              <label htmlFor="expiry-action-notes" className="mb-1.5 block text-sm font-medium text-foreground">
                {t("expiryActions.notesLabel")}
              </label>
              <textarea
                id="expiry-action-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
                placeholder={t("expiryActions.notesPlaceholder")}
              />
            </div>
          </DialogBody>
        ) : preview ? (
          <DialogBody className="space-y-3 text-sm">
            {preview.warnings?.map((w) => (
              <p key={w} className="rounded-md bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                {w}
              </p>
            ))}
            {preview.action_type === "PRIORITY_CONSUME" ? (
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  {t("expiryActions.previewFefoBoost", {
                    value: preview.fefo_boost_value ?? 0,
                  })}
                </li>
                {(preview.prep_tasks ?? []).length > 0 ? (
                  <li>
                    {t("expiryActions.previewPrepCount", { count: preview.prep_tasks?.length ?? 0 })}
                  </li>
                ) : null}
              </ul>
            ) : null}
            {preview.action_type === "TRANSFER_SUGGEST" ? (
              <p className="text-foreground">
                {t("expiryActions.previewTransfer", {
                  from: preview.source_warehouse_name ?? "",
                  to: preview.target_warehouse_name ?? "",
                  qty: preview.quantity ?? "",
                  unit: preview.unit ?? "",
                })}
              </p>
            ) : null}
            {preview.action_type === "PLAN_NOTE" && preview.note_preview ? (
              <p className="whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-xs text-foreground">
                {preview.note_preview}
              </p>
            ) : null}
          </DialogBody>
        ) : null}

        <DialogFooter>
          {step === "preview" && automationEnabled ? (
            <Button type="button" variant="outline" onClick={() => setStep("form")} disabled={isPending}>
              {t("expiryActions.back")}
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {t("confirmActionDialog.cancel")}
            </Button>
          )}
          {step === "form" ? (
            <Button
              type="button"
              onClick={() => void handleFormSubmit()}
              disabled={
                isPending ||
                !lot ||
                !actionType ||
                (needsTargetWarehouse && !targetWarehouseId)
              }
            >
              {isPending
                ? t("expiryActions.saving")
                : automationEnabled
                  ? t("expiryActions.previewButton")
                  : t("expiryActions.confirm")}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleExecute}
              disabled={isPending || !preview?.can_execute}
            >
              {isExecutePending ? t("expiryActions.saving") : t("expiryActions.executeConfirm")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
