"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useBranches } from "@/features/warehouse/hooks/useWarehouse"
import { WAREHOUSE_TYPE_CODES, type Warehouse } from "@/features/warehouse/types"
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
import { Textarea } from "@/components/ui/textarea"

interface WarehouseFormModalProps {
  open: boolean
  warehouse?: Warehouse | null
  currentBranchId?: string
  onSave: (data: Record<string, unknown>) => Promise<void>
  onClose: () => void
  isLoading?: boolean
}

type WarehouseFormState = {
  name: string
  code: string
  warehouse_type: string
  branches: string[]
  address: string
  capacity_info: string
  is_default: boolean
  notes: string
}

function buildFormState(
  warehouse: Warehouse | null | undefined,
  currentBranchId?: string,
): WarehouseFormState {
  return {
    name: warehouse?.name ?? "",
    code: warehouse?.code ?? "",
    warehouse_type: warehouse?.warehouse_type ?? "MAIN",
    branches: warehouse?.branches ?? (currentBranchId ? [currentBranchId] : []),
    address: warehouse?.address ?? "",
    capacity_info: warehouse?.capacity_info ?? "",
    is_default: warehouse?.is_default ?? false,
    notes: warehouse?.notes ?? "",
  }
}

export function WarehouseFormModal({
  open,
  warehouse,
  currentBranchId,
  onSave,
  onClose,
  isLoading,
}: WarehouseFormModalProps) {
  const t = useTranslations("warehouse")
  const { data: branches = [] } = useBranches()
  const isEdit = !!warehouse

  const [form, setForm] = useState(() => buildFormState(warehouse, currentBranchId))

  useEffect(() => {
    if (!open) return
    setForm(buildFormState(warehouse, currentBranchId))
  }, [open, warehouse, currentBranchId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.branches.length === 0) {
      toast.error(t("warehouseForm.alertSelectBranch"))
      return
    }
    await onSave(form)
  }

  const update = (field: string, value: unknown) => setForm((prev) => ({ ...prev, [field]: value }))

  const toggleBranch = (branchId: string) => {
    setForm((prev) => {
      const nextBranches = prev.branches.includes(branchId)
        ? prev.branches.filter((id) => id !== branchId)
        : [...prev.branches, branchId]
      return { ...prev, branches: nextBranches }
    })
  }

  const title = isEdit ? t("warehouseForm.titleEdit") : t("warehouseForm.titleNew")

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent layout="scroll" size="lg" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {isEdit && warehouse ? (
            <DialogDescription>
              {warehouse.code} · {warehouse.name}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <DialogBody className="space-y-4">
          <form id="warehouse-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="wh-code">{t("warehouseForm.codeLabel")}</Label>
                <Input
                  id="wh-code"
                  value={form.code}
                  onChange={(e) => update("code", e.target.value)}
                  required
                  placeholder={t("warehouseForm.codePlaceholder")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="wh-name">{t("warehouseForm.nameLabel")}</Label>
                <Input
                  id="wh-name"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  required
                  placeholder={t("warehouseForm.namePlaceholder")}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>{t("warehouseForm.branchesLabel")}</Label>
              <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-lg border border-border bg-background p-2">
                {branches.length === 0 ? (
                  <div className="py-2 text-center text-xs text-muted-foreground">{t("warehouseForm.noBranches")}</div>
                ) : (
                  branches.map((b) => (
                    <label
                      key={b.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={form.branches.includes(b.id)}
                        onChange={() => toggleBranch(b.id)}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-sm text-foreground">{b.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="wh-type">{t("warehouseForm.typeLabel")}</Label>
              <select
                id="wh-type"
                value={form.warehouse_type}
                onChange={(e) => update("warehouse_type", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/20"
              >
                {WAREHOUSE_TYPE_CODES.map((val) => (
                  <option key={val} value={val}>
                    {t(`warehouseType.${val}` as never)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="wh-address">{t("warehouseForm.addressLabel")}</Label>
              <Input
                id="wh-address"
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
                placeholder={t("warehouseForm.addressPlaceholder")}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_default"
                checked={form.is_default}
                onChange={(e) => update("is_default", e.target.checked)}
                className="rounded border-border"
              />
              <Label htmlFor="is_default">{t("warehouseForm.defaultCheckbox")}</Label>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="wh-notes">{t("warehouseForm.notesLabel")}</Label>
              <Textarea
                id="wh-notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                rows={2}
              />
            </div>
          </form>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            {t("warehouseForm.cancel")}
          </Button>
          <Button type="submit" form="warehouse-form" disabled={isLoading}>
            {isLoading ? t("warehouseForm.saving") : isEdit ? t("warehouseForm.update") : t("warehouseForm.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
