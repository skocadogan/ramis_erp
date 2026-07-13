"use client"

import type { ReactNode } from "react"
import { format } from "date-fns"
import { Trash2 } from "lucide-react"
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
import { cn } from "@/lib/utils"
import type { StockMovement } from "@/features/inventory/types"
import {
  isKnownReturnCancelReason,
  parseReturnCancelNotesMeta,
  returnCancelLineTotal,
} from "@/features/warehouse/utils/returnCancelDetail"
import { formatQuantityWithUnit } from "@/lib/formatters"

type Props = {
  open: boolean
  row: StockMovement | null
  canManage: boolean
  onClose: () => void
  onDelete?: (row: StockMovement) => void
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-3 gap-y-1 border-b border-border/60 py-2.5 last:border-b-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground break-words">{children}</dd>
    </div>
  )
}

export function ReturnCancelDetailModal({ open, row, canManage, onClose, onDelete }: Props) {
  const t = useTranslations("warehouse_return_cancel")
  const currency = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" })

  if (!row) return null

  const isReturn = row.movement_type === "RETURN"
  const notesMeta = parseReturnCancelNotesMeta(row.notes)
  const lineTotal = returnCancelLineTotal(row)
  const reasonText = isKnownReturnCancelReason(row.reference)
    ? t(`reasons.${row.reference}` as "reasons.EXPIRED")
    : row.reference || "—"

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent layout="scroll" size="2xl" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{t("detailTitle")}</DialogTitle>
          <DialogDescription className="truncate">{row.stock_item_name}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <dl>
            <DetailRow label={t("detailId")}>
              <span className="font-mono text-xs">{row.id}</span>
            </DetailRow>
            <DetailRow label={t("colDateTime")}>
              {format(new Date(row.created_at), "dd.MM.yyyy HH:mm")}
            </DetailRow>
            <DetailRow label={t("colType")}>
              <span
                className={cn(
                  "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold",
                  isReturn
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                    : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
                )}
              >
                {isReturn ? t("movementTypeReturn") : t("movementTypeCancel")}
              </span>
            </DetailRow>
            <DetailRow label={t("colProduct")}>{row.stock_item_name || "—"}</DetailRow>
            <DetailRow label={t("colWarehouse")}>{row.warehouse_name || "—"}</DetailRow>
            <DetailRow label={t("colQuantity")}>
              <span className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                {formatQuantityWithUnit(row.quantity, row.unit)}
              </span>
            </DetailRow>
            <DetailRow label={t("colUnitCost")}>
              <span className="tabular-nums">{currency.format(row.unit_price || 0)}</span>
            </DetailRow>
            <DetailRow label={t("colTotal")}>
              <span className="font-semibold tabular-nums">{currency.format(lineTotal)}</span>
            </DetailRow>
            <DetailRow label={t("colReason")}>{reasonText}</DetailRow>
            {notesMeta.purchaseOrder ? (
              <DetailRow label={t("detailPurchaseOrder")}>{notesMeta.purchaseOrder}</DetailRow>
            ) : null}
            {notesMeta.goodsReceiving ? (
              <DetailRow label={t("detailGoodsReceiving")}>{notesMeta.goodsReceiving}</DetailRow>
            ) : null}
            <DetailRow label={t("colSupplier")}>{row.supplier_name || "—"}</DetailRow>
            <DetailRow label={t("detailPerformedBy")}>{row.performed_by_name || "—"}</DetailRow>
            {notesMeta.userNotes ? (
              <DetailRow label={t("detailUserNotes")}>{notesMeta.userNotes}</DetailRow>
            ) : null}
            {notesMeta.fullNotes ? (
              <DetailRow label={t("detailFullNotes")}>
                <span className="whitespace-pre-wrap text-muted-foreground">{notesMeta.fullNotes}</span>
              </DetailRow>
            ) : null}
          </dl>
        </DialogBody>

        <DialogFooter>
          {canManage && onDelete ? (
            <Button type="button" variant="destructive" onClick={() => onDelete(row)}>
              <Trash2 size={16} />
              {t("delete")}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={onClose}>
            {t("detailClose")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
