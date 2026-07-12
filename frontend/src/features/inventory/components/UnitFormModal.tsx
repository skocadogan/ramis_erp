"use client"

import { Plus, Edit2, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { NumberInput } from "@/components/ui/number-input"
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

interface UnitFormModalProps {
  showUnitForm: boolean
  setShowUnitForm: (show: boolean) => void
  editingUnitId: string | null
  unitFormData: { name: string; short_name: string; multiplier: string }
  setUnitFormData: (data: { name: string; short_name: string; multiplier: string }) => void
  isSubmitting: boolean
  handleUnitSubmit: () => void
}

export function UnitFormModal({
  showUnitForm,
  setShowUnitForm,
  editingUnitId,
  unitFormData,
  setUnitFormData,
  isSubmitting,
  handleUnitSubmit,
}: UnitFormModalProps) {
  const t = useTranslations("inventory.unitForm")

  const title = editingUnitId ? t("titleEdit") : t("titleNew")
  const subtitle = editingUnitId ? t("subtitleEdit") : t("subtitleNew")

  return (
    <Dialog open={showUnitForm} onOpenChange={setShowUnitForm}>
      <DialogContent layout="scroll" size="md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="unit-name">{t("name")}</Label>
            <Input
              id="unit-name"
              type="text"
              value={unitFormData.name}
              onChange={(e) => setUnitFormData({ ...unitFormData, name: e.target.value })}
              placeholder={t("namePh")}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="unit-short">{t("shortName")}</Label>
            <Input
              id="unit-short"
              type="text"
              value={unitFormData.short_name}
              onChange={(e) => setUnitFormData({ ...unitFormData, short_name: e.target.value })}
              className="font-mono"
              placeholder={t("shortPh")}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="unit-multiplier">{t("multiplier")}</Label>
            <NumberInput
              id="unit-multiplier"
              step="0.001"
              value={unitFormData.multiplier}
              onChange={(val) => setUnitFormData({ ...unitFormData, multiplier: val })}
              placeholder={t("multiplierPh")}
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setShowUnitForm(false)} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleUnitSubmit}
            disabled={isSubmitting || !unitFormData.name || !unitFormData.short_name || !unitFormData.multiplier}
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" size={15} />
            ) : editingUnitId ? (
              <Edit2 size={15} />
            ) : (
              <Plus size={15} />
            )}
            {editingUnitId ? t("update") : t("add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
