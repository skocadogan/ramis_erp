"use client"

import { useTranslations } from "next-intl"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { WarehouseInventoryToolbar } from "./WarehouseInventoryToolbar"
import { WarehouseInventoryLevelsPanel } from "./WarehouseInventoryLevelsPanel"
import { WarehouseInventoryModalDialogs } from "./WarehouseInventoryModalDialogs"
import { useWarehouseInventoryModal } from "./useWarehouseInventoryModal"

export function WarehouseInventoryModal({
  open,
  warehouseId,
  warehouseName,
  onClose,
}: {
  open: boolean
  warehouseId: string
  warehouseName: string
  onClose: () => void
}) {
  const t = useTranslations("warehouse.inventoryModal")
  const vm = useWarehouseInventoryModal({ warehouseId, warehouseName })

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent layout="scroll" size="4xl" className="max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{warehouseName}</DialogDescription>
          </DialogHeader>

          <DialogBody className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-5">
            <WarehouseInventoryToolbar {...vm.toolbar} />
            <WarehouseInventoryLevelsPanel {...vm.levels} />
          </DialogBody>
        </DialogContent>
      </Dialog>

      <WarehouseInventoryModalDialogs {...vm.dialogs} />
    </>
  )
}
