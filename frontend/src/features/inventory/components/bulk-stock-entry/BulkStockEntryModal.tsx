"use client"

import { Loader2 } from "lucide-react"
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
import { BulkStockEntryFinalizeDialog } from "./BulkStockEntryFinalizeDialog"
import { BulkStockEntryFooter } from "./BulkStockEntryFooter"
import { BulkStockEntryLeftColumn } from "./BulkStockEntryLeftColumn"
import { BulkStockEntryLinesTable } from "./BulkStockEntryLinesTable"
import type { BulkStockEntryModalProps } from "./bulkStockEntry.types"
import { useBulkStockEntryModal } from "./useBulkStockEntryModal"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export function BulkStockEntryModal(props: BulkStockEntryModalProps) {
  const t = useTranslations("inventory")
  const { open, onClose, warehouses, suppliers, stockUnits, categories } = props
  const vm = useBulkStockEntryModal(props)

  const handleDraftSelect = (value: string) => {
    if (!value) {
      vm.startNewDraftForm()
      return
    }
    void vm.loadDraftById(value)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
        <DialogContent layout="scroll" size="7xl" className="max-h-[92vh] xl:max-w-[90rem]">
          <DialogHeader>
            <DialogTitle>{t("bulkStockModal.title")}</DialogTitle>
            <DialogDescription>{t("bulkStockModal.subtitle")}</DialogDescription>
          </DialogHeader>

          <DialogBody className="min-h-0 overflow-x-hidden overflow-y-auto p-0 lg:overflow-hidden">
            <div className="flex min-h-[min(280px,40vh)] min-w-0 flex-col gap-4 px-4 py-3 sm:p-5 lg:h-full lg:min-h-0 lg:flex-row lg:items-stretch">
              <BulkStockEntryLeftColumn
                draftId={vm.draftId}
                status={vm.status}
                draftSummaries={vm.draftSummaries}
                draftListLoading={vm.draftListLoading}
                loadingDraft={vm.loadingDraft}
                warehouseName={vm.warehouseName}
                onDraftSelect={handleDraftSelect}
                autoSaveEnabled={vm.autoSaveEnabled}
                setAutoSaveEnabled={vm.setAutoSaveEnabled}
                autoSaveBusy={vm.autoSaveBusy}
                lastSavedAt={vm.lastSavedAt}
                saveError={vm.saveError}
                finalizeError={vm.finalizeError}
                warehouseId={vm.warehouseId}
                setWarehouseId={vm.setWarehouseId}
                supplierId={vm.supplierId}
                setSupplierId={vm.setSupplierId}
                reference={vm.reference}
                setReference={vm.setReference}
                notes={vm.notes}
                setNotes={vm.setNotes}
                warehouses={warehouses}
                suppliers={suppliers}
              />

              <BulkStockEntryLinesTable
                lines={vm.lines}
                status={vm.status}
                stockUnits={stockUnits}
                categories={categories}
                onAddLine={vm.addEmptyLine}
                onPatchLine={vm.patchLine}
                onRemoveLine={vm.removeLine}
              />
            </div>
          </DialogBody>

          <DialogFooter className="block p-0">
            <BulkStockEntryFooter
              draftId={vm.draftId}
              status={vm.status}
              validLineCount={vm.validLines.length}
              onClose={onClose}
              onSaveDraft={vm.handleSaveDraft}
              onRequestFinalize={() => {
                vm.setFinalizeError("")
                vm.setFinalizeConfirmOpen(true)
              }}
              onDeleteDraft={vm.deleteDraft}
              canSave={vm.canSave}
              canFinalize={vm.canFinalize}
              manualSaving={vm.manualSaving}
              finalizing={vm.finalizing}
              deletingDraft={vm.deletingDraft}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkStockEntryFinalizeDialog
        open={vm.finalizeConfirmOpen}
        onOpenChange={vm.setFinalizeConfirmOpen}
        onConfirm={vm.runFinalize}
      />

      <AlertDialog open={vm.showDeleteConfirm} onOpenChange={vm.setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("bulkStockEntry.confirmDeleteTitle") || t("bulkStockModal.deleteTitle") || t("common.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {vm.status === "POSTED"
                ? t("bulkStockEntry.confirmDeletePosted")
                : t("bulkStockEntry.confirmDeleteDraft")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={vm.isDeleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void vm.executeDelete()
              }}
              disabled={vm.isDeleting}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {vm.isDeleting && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
