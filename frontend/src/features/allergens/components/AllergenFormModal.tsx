"use client"

import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { NumberInput } from "@/components/ui/number-input"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AllergenFormState } from "@/features/allergens/types"

interface AllergenFormModalProps {
  open: boolean
  onClose: () => void
  editingId: string | null
  formData: AllergenFormState
  setFormData: (data: AllergenFormState) => void
  isSubmitting: boolean
  onSubmit: () => void
}

export function AllergenFormModal({
  open,
  onClose,
  editingId,
  formData,
  setFormData,
  isSubmitting,
  onSubmit,
}: AllergenFormModalProps) {
  const t = useTranslations("allergens.form")

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent layout="scroll" size="md">
        <DialogHeader>
          <DialogTitle>{editingId ? t("titleEdit") : t("titleNew")}</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="allergen-code">{t("code")}</Label>
            <Input
              id="allergen-code"
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className="font-mono uppercase"
              placeholder={t("codePh")}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="allergen-name">{t("name")}</Label>
            <Input
              id="allergen-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t("namePh")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="allergen-prevalence">{t("prevalence")}</Label>
              <NumberInput
                id="allergen-prevalence"
                step="0.01"
                value={formData.prevalence_pct}
                onChange={(val) => setFormData({ ...formData, prevalence_pct: val })}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="allergen-risk">{t("riskScore")}</Label>
              <NumberInput
                id="allergen-risk"
                step="1"
                value={formData.risk_score}
                onChange={(val) => setFormData({ ...formData, risk_score: val })}
                placeholder="1-10"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="allergen-sort">{t("sortOrder")}</Label>
            <NumberInput
              id="allergen-sort"
              step="1"
              value={formData.sort_order}
              onChange={(val) => setFormData({ ...formData, sort_order: val })}
              placeholder="0"
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting || !formData.code || !formData.name}
          >
            {isSubmitting && <Loader2 className="animate-spin" size={15} />}
            {editingId ? t("update") : t("add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
