"use client"

import { useTranslations } from "next-intl"
import { TransferStockInsufficientDialog } from "../TransferStockInsufficientDialog"
import { ConfirmActionDialog } from "../ConfirmActionDialog"
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
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { WarehouseInventoryModalDialogsProps } from "./inventoryModalProps"

export function WarehouseInventoryModalDialogs({
  warehouseName,
  partialStock,
  setPartialStock,
  confirmTransferAll,
  setConfirmTransferAll,
  pendingTransferAllRows,
  setPendingTransferAllRows,
  editQtyRow,
  setEditQtyRow,
  editQtyInput,
  setEditQtyInput,
  editQtyNotes,
  setEditQtyNotes,
  editMinRow,
  setEditMinRow,
  editMinInput,
  setEditMinInput,
  removeRow,
  setRemoveRow,
  stockMovementApiError,
  setStockMovementApiError,
  createMutIsPending,
  adjustMutIsPending,
  setMinMutIsPending,
  runCreateTransfer,
  handleTransferAllConfirm,
  submitEditQty,
  submitEditMin,
  submitRemoveFromWarehouse,
}: WarehouseInventoryModalDialogsProps) {
  const t = useTranslations("warehouse.inventoryModal")

  return (
    <>
      <TransferStockInsufficientDialog
        open={!!partialStock}
        onOpenChange={(open) => !open && setPartialStock(null)}
        title={t("insufficientStock.title")}
        description={t("insufficientStock.description")}
        insufficientItems={partialStock?.insufficient ?? []}
        variant="partial"
        feasibleCount={partialStock?.feasibleCount ?? 0}
        isLoading={createMutIsPending}
        confirmLabel={t("insufficientStock.confirmPartial")}
        onConfirmPartial={async () => {
          if (!partialStock) return
          await runCreateTransfer(partialStock.payload)
        }}
      />

      <ConfirmActionDialog
        open={confirmTransferAll}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmTransferAll(false)
            setPendingTransferAllRows(null)
          }
        }}
        onConfirm={handleTransferAllConfirm}
        title={t("confirmTransferAll.title")}
        description={t("confirmTransferAll.description", {
          count: pendingTransferAllRows?.length ?? 0,
        })}
        confirmText={t("confirmTransferAll.confirm")}
      />

      <Dialog open={!!editQtyRow} onOpenChange={(open) => !open && setEditQtyRow(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{t("editQty.title")}</DialogTitle>
            <DialogDescription>
              {editQtyRow ? (
                <>
                  <span className="font-ui-medium text-foreground">{editQtyRow.stock_item_name}</span>
                  {" — "}
                  {warehouseName}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="wh-inv-qty">
                {t("editQty.labelQty", { unit: editQtyRow?.stock_item_unit ?? "" })}
              </Label>
              <Input
                id="wh-inv-qty"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.001"
                value={editQtyInput}
                onChange={(e) => setEditQtyInput(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wh-inv-notes">{t("editQty.labelNotes")}</Label>
              <Input
                id="wh-inv-notes"
                type="text"
                value={editQtyNotes}
                onChange={(e) => setEditQtyNotes(e.target.value)}
                placeholder={t("editQty.notesPlaceholder")}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditQtyRow(null)}>
              {t("editQty.cancel")}
            </Button>
            <Button type="button" onClick={() => void submitEditQty()} disabled={adjustMutIsPending}>
              {t("editQty.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editMinRow} onOpenChange={(open) => !open && setEditMinRow(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{t("editMin.title")}</DialogTitle>
            <DialogDescription>
              {editMinRow ? (
                <>
                  <span className="font-ui-medium text-foreground">{editMinRow.stock_item_name}</span>
                  {" — "}
                  {warehouseName}. {t("editMin.descriptionSuffix")}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-2">
              <Label htmlFor="wh-inv-min">
                {t("editMin.labelMin", { unit: editMinRow?.stock_item_unit ?? "" })}
              </Label>
              <Input
                id="wh-inv-min"
                type="number"
                inputMode="decimal"
                min={-1}
                step="0.001"
                value={editMinInput}
                onChange={(e) => setEditMinInput(e.target.value)}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditMinRow(null)}>
              {t("editMin.cancel")}
            </Button>
            <Button type="button" onClick={() => void submitEditMin()} disabled={setMinMutIsPending}>
              {t("editMin.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={!!removeRow}
        onOpenChange={(open) => !open && setRemoveRow(null)}
        onConfirm={() => void submitRemoveFromWarehouse()}
        title={t("removeFromWarehouse.title")}
        description={
          removeRow ? t("removeFromWarehouse.description", { name: removeRow.stock_item_name }) : ""
        }
        confirmText={t("removeFromWarehouse.confirm")}
        variant="destructive"
      />

      <AlertDialog
        open={!!stockMovementApiError}
        onOpenChange={(open) => {
          if (!open) setStockMovementApiError(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("adjustmentError.title")}</AlertDialogTitle>
            <AlertDialogDescription className="max-h-[min(50vh,20rem)] overflow-y-auto text-left text-sm text-foreground whitespace-pre-wrap">
              {stockMovementApiError}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction type="button" onClick={() => setStockMovementApiError(null)}>
              {t("adjustmentError.ok")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
