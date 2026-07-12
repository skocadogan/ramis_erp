"use client"

import { useState } from "react"
import { useWarehouses } from "@/features/warehouse/hooks/useWarehouse"
import { useTranslations } from "next-intl"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface StockCountingFormModalProps {
  open: boolean
  onSave: (data: Record<string, unknown>) => Promise<void>
  onClose: () => void
  isLoading?: boolean
}

export function StockCountingFormModal({ open, onSave, onClose, isLoading }: StockCountingFormModalProps) {
  const t = useTranslations("warehouse")
  const { data: warehouses = [] } = useWarehouses()

  const [form, setForm] = useState({
    warehouse_id: "",
    counting_date: new Date().toISOString().split("T")[0],
    notes: "",
    auto_populate: true,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSave({ ...form, items: [] })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent layout="scroll" size="md">
        <DialogHeader>
          <DialogTitle>{t("countingForm.titleNew")}</DialogTitle>
        </DialogHeader>

        <form id="counting-form" onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="counting-warehouse">{t("countingForm.warehouseLabel")}</Label>
              <select
                id="counting-warehouse"
                value={form.warehouse_id}
                onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/20"
              >
                <option value="">{t("countingForm.selectWarehouse")}</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="counting-date">{t("countingForm.dateLabel")}</Label>
              <input
                id="counting-date"
                type="date"
                value={form.counting_date}
                onChange={(e) => setForm({ ...form, counting_date: e.target.value })}
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="auto_populate"
                checked={form.auto_populate}
                onChange={(e) => setForm({ ...form, auto_populate: e.target.checked })}
                className="rounded border-border"
              />
              <Label htmlFor="auto_populate">{t("countingForm.autoPopulate")}</Label>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="counting-notes">{t("countingForm.notesLabel")}</Label>
              <Textarea
                id="counting-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              {t("warehouseForm.cancel")}
            </Button>
            <Button type="submit" form="counting-form" disabled={isLoading}>
              {isLoading ? t("countingForm.creating") : t("countingForm.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
