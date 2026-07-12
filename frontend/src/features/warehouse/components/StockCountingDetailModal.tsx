"use client"

import { useState, useEffect } from "react"
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
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { StockCounting, type StockCountingItem, type CountingDifferenceReason, COUNTING_DIFFERENCE_REASONS } from "@/features/warehouse/types"
import {
  useUpdateCountingItems,
  useStartStockCounting,
  useFinishStockCounting,
  useApproveStockCounting,
  useDeleteStockCounting,
} from "@/features/warehouse/hooks/useWarehouseActions"
import { toast } from "sonner"
import { StatusBadge } from "./StatusBadge"
import { ConfirmActionDialog } from "./ConfirmActionDialog"
import { Save, Play, CheckCircle, PackageCheck, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/store/useAuthStore"
import {
  canDeleteStockCountingRecord,
  PERMISSION_WAREHOUSE_APPROVE_STOCK_COUNTING,
} from "@/lib/constants"
import { useModulePermissions } from "@/hooks/useModulePermissions"
import { useTranslations } from "next-intl"
import { formatQuantity } from "@/lib/formatters"

type EditableCountingItem = Omit<StockCountingItem, "counted_quantity" | "notes" | "difference_reason"> & {
  counted_quantity: number | string
  notes: string
  difference_reason: CountingDifferenceReason | "" | null
}

const STOCK_OUT_REASONS: CountingDifferenceReason[] = ["CANCEL_RETURN", "WASTE"]

/** Modal içinde thead/tbody hizası için tek grid şablonu (HTML table + çift scroll sorununu önler) */
const COUNTING_GRID =
  "grid w-full grid-cols-[minmax(0,1fr)_5.25rem_7rem_3.75rem_2.75rem_minmax(7.5rem,1fr)_minmax(0,1fr)] gap-x-2 sm:gap-x-3"

interface StockCountingDetailModalProps {
  open: boolean
  counting: StockCounting | null
  onClose: () => void
  /** Kayıt güncellendiğinde (ör. kalemler kaydı) liste/detay senkronu için */
  onCountingUpdated?: (c: StockCounting) => void
}

export default function StockCountingDetailModal({
  open,
  counting,
  onClose,
  onCountingUpdated,
}: StockCountingDetailModalProps) {
  const t = useTranslations("warehouse")
  const { canManage } = useModulePermissions()
  const canApproveStockCounting = canManage(PERMISSION_WAREHOUSE_APPROVE_STOCK_COUNTING)
  const user = useAuthStore((s) => s.user)
  const [items, setItems] = useState<EditableCountingItem[]>([])
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const updateItemsMutation = useUpdateCountingItems()
  const startMutation = useStartStockCounting()
  const finishMutation = useFinishStockCounting()
  const approveMutation = useApproveStockCounting()
  const deleteMutation = useDeleteStockCounting()

  useEffect(() => {
    if (counting) {
      setItems(
        counting.items.map((item) => ({
          ...item,
          counted_quantity: item.counted_quantity || 0,
          notes: item.notes || "",
          difference_reason: item.difference_reason || "",
        }))
      )
    }
  }, [counting])

  const handleUpdateItem = (
    index: number,
    field: "counted_quantity" | "notes" | "difference_reason",
    value: string | number,
  ) => {
    const newItems = [...items]
    const row = { ...newItems[index], [field]: value }

    if (field === "counted_quantity") {
      const diff = (Number(value) || 0) - Number(row.system_quantity)
      if (diff === 0) {
        row.difference_reason = ""
      } else if (
        row.difference_reason &&
        STOCK_OUT_REASONS.includes(row.difference_reason as CountingDifferenceReason) &&
        diff > 0
      ) {
        row.difference_reason = ""
      }
    }

    if (field === "difference_reason" && value === "") {
      row.difference_reason = ""
    }

    newItems[index] = row
    setItems(newItems)
  }

  const validateItemsBeforeSave = (): boolean => {
    for (const item of items) {
      const diff = (Number(item.counted_quantity) || 0) - Number(item.system_quantity)
      if (diff === 0) continue
      if (!item.difference_reason) {
        toast.error(t("countingDetail.reasonRequired"))
        return false
      }
      if (diff > 0 && STOCK_OUT_REASONS.includes(item.difference_reason as CountingDifferenceReason)) {
        toast.error(t("countingDetail.reasonStockOutPositive"))
        return false
      }
    }
    return true
  }

  const handleSaveItems = async () => {
    if (!counting || !validateItemsBeforeSave()) return
    try {
      const res = await updateItemsMutation.mutateAsync({
        id: counting.id,
        items: items.map((i) => ({
          id: i.id,
          counted_quantity: Number(i.counted_quantity),
          notes: i.notes,
          difference_reason: i.difference_reason || null,
        })),
      })
      if (res.data) onCountingUpdated?.(res.data as StockCounting)
      toast.success(t("countingDetail.itemsUpdated"))
    } catch {
      toast.error(t("countingDetail.updateError"))
    }
  }

  const handleConfirmDelete = async () => {
    if (!counting) return
    try {
      await deleteMutation.mutateAsync(counting.id)
      toast.success(t("countingDetail.deleted"))
      onClose()
    } catch {
      toast.error(t("countingDetail.deleteFailed"))
    }
  }

  const handleStart = async () => {
    if (!counting) return
    await startMutation.mutateAsync(counting.id)
    toast.success(t("countingDetail.started"))
  }

  const handleFinish = async () => {
    if (!counting || !validateItemsBeforeSave()) return
    await finishMutation.mutateAsync(counting.id)
    toast.success(t("countingDetail.finishedPending"))
  }

  const handleApprove = async () => {
    if (!counting) return
    await approveMutation.mutateAsync(counting.id)
    toast.success(t("countingDetail.approved"))
    onClose()
  }

  const isEditable = counting ? counting.status !== "APPROVED" : false
  const canDelete = counting
    ? canDeleteStockCountingRecord(counting.status, user?.permissions, user?.is_superuser)
    : false

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent layout="scroll" size="3xl" className="max-h-[95vh]">
        {counting ? (
          <>
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                <PackageCheck className="size-5 shrink-0 text-muted-foreground" />
                {t("countingDetail.detailTitle", { number: counting.counting_number })}
              </DialogTitle>
              <DialogDescription>{counting.warehouse_name}</DialogDescription>
            </div>
            <StatusBadge domain="counting" status={counting.status} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            <span>
              <span className="font-ui-medium text-foreground">{t("countingDetail.labelDate")} </span>
              {new Date(counting.counting_date).toLocaleDateString("tr-TR")}
            </span>
          </div>
        </DialogHeader>

        <DialogBody
          className="min-h-0 min-w-0 flex-1 overflow-auto px-0 pb-3"
          role="region"
          aria-label={t("countingDetail.itemsAria")}
        >
          <div className="w-full min-w-[min(100%,36rem)]">
            <div
              className={cn(
                COUNTING_GRID,
                "sticky top-0 z-10 border-b border-border bg-muted/80 px-5 py-2.5 text-xs font-ui-semibold text-foreground sm:px-6 sm:text-sm",
              )}
            >
              <div className="min-w-0 leading-snug">{t("countingDetail.colStockItem")}</div>
              <div className="text-right leading-snug">{t("countingDetail.colSystem")}</div>
              <div className="text-right leading-snug">{t("countingDetail.colCountedQty")}</div>
              <div className="text-right leading-snug">{t("countingDetail.colDiff")}</div>
              <div className="leading-snug">{t("countingDetail.colUnit")}</div>
              <div className="min-w-0 leading-snug">{t("countingDetail.colReason")}</div>
              <div className="min-w-0 leading-snug">{t("countingDetail.colNote")}</div>
            </div>
            <div className="divide-y divide-border">
              {items.map((item, index) => {
                const diff = (Number(item.counted_quantity) || 0) - Number(item.system_quantity)
                return (
                  <div
                    key={item.id}
                    className={cn(
                      COUNTING_GRID,
                      "items-start px-5 py-2.5 text-sm text-foreground sm:px-6",
                    )}
                  >
                    <div className="min-w-0 break-words font-ui-medium leading-snug">{item.stock_item_name}</div>
                    <div className="pt-0.5 text-right tabular-nums">{formatQuantity(item.system_quantity)}</div>
                    <div className="pt-0.5 text-right">
                      {isEditable ? (
                        <NumberInput
                          variant="compact"
                          value={item.counted_quantity}
                          onChange={(v) => handleUpdateItem(index, "counted_quantity", v)}
                          step="any"
                          min={0}
                          className="h-8"
                        />
                      ) : (
                        <span className="tabular-nums">{formatQuantity(item.counted_quantity)}</span>
                      )}
                    </div>
                    <div
                      className={cn(
                        "pt-0.5 text-right font-ui-semibold tabular-nums",
                        diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "",
                      )}
                    >
                      {diff > 0 ? "+" : ""}
                      {formatQuantity(diff)}
                    </div>
                    <div className="pt-0.5 tabular-nums text-muted-foreground">{item.unit}</div>
                    <div className="min-w-0 pt-0.5">
                      {isEditable && diff !== 0 ? (
                        <select
                          value={item.difference_reason || ""}
                          onChange={(e) =>
                            handleUpdateItem(index, "difference_reason", e.target.value)
                          }
                          required
                          className="h-9 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="">{t("countingDetail.reasonPlaceholder")}</option>
                          {COUNTING_DIFFERENCE_REASONS.map((reason) => {
                            const disabled = diff > 0 && STOCK_OUT_REASONS.includes(reason)
                            return (
                              <option key={reason} value={reason} disabled={disabled}>
                                {t(`countingDetail.differenceReason.${reason}`)}
                              </option>
                            )
                          })}
                        </select>
                      ) : (
                        <span className="break-words text-muted-foreground leading-snug">
                          {item.difference_reason
                            ? t(`countingDetail.differenceReason.${item.difference_reason}`)
                            : item.difference_reason_display || "—"}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 pt-0.5">
                      {isEditable ? (
                        <Input
                          value={item.notes}
                          onChange={(e) => handleUpdateItem(index, "notes", e.target.value)}
                          className="h-9 w-full min-w-0"
                          placeholder={t("countingDetail.notePlaceholder")}
                        />
                      ) : (
                        <span className="break-words text-muted-foreground leading-snug">
                          {item.notes || "—"}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          {canDelete && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmDeleteOpen(true)}
              loading={deleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t("countingDetail.toolbarDelete")}
            </Button>
          )}

          <Button type="button" variant="outline" onClick={onClose}>
            {t("countingDetail.closeButton")}
          </Button>

          {counting.status === "DRAFT" && (
            <Button
              type="button"
              onClick={handleStart}
              variant="outline"
              loading={startMutation.isPending}
            >
              <Play className="w-4 h-4 mr-2" />
              {t("countingDetail.startButton")}
            </Button>
          )}

          {isEditable && (
            <Button
              type="button"
              onClick={handleSaveItems}
              loading={updateItemsMutation.isPending}
            >
              <Save className="w-4 h-4 mr-2" />
              {t("countingDetail.saveButton")}
            </Button>
          )}

          {counting.status === "IN_PROGRESS" && (
            <Button type="button" onClick={handleFinish} loading={finishMutation.isPending}>
              <CheckCircle className="w-4 h-4 mr-2" />
              {t("countingDetail.finishButton")}
            </Button>
          )}

          {counting.status === "COMPLETED" && canApproveStockCounting && (
            <Button type="button" onClick={handleApprove} loading={approveMutation.isPending}>
              <PackageCheck className="w-4 h-4 mr-2" />
              {t("countingDetail.approveButton")}
            </Button>
          )}
        </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>

    {counting ? (
      <ConfirmActionDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        onConfirm={handleConfirmDelete}
        title={t("countingDetail.deleteTitle")}
        description={
          counting.status === "APPROVED" || counting.status === "COMPLETED"
            ? t("countingDetail.deleteWarnApproved")
            : t("countingDetail.deleteWarnDraft")
        }
        confirmText={t("confirm.delete")}
        variant="destructive"
      />
    ) : null}
    </>
  )
}
