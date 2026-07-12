"use client"

import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ModifierGroupForm } from "@/features/menu/types"
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
import { Checkbox } from "@/components/ui/checkbox"

interface Props {
  form: ModifierGroupForm
  isSubmitting: boolean
  mode: "create" | "edit"
  onChange: (form: ModifierGroupForm) => void
  onSubmit: () => void
  onClose: () => void
}

export function ModifierGroupFormModal({
  form,
  isSubmitting,
  mode,
  onChange,
  onSubmit,
  onClose,
}: Props) {
  const t = useTranslations("menu_management.modifierGroups")

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent layout="scroll" size="md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("createGroupTitle") : t("editGroupTitle")}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="modifier-group-name">{t("groupName")}</Label>
            <Input
              id="modifier-group-name"
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="modifier-group-required"
              checked={form.is_required}
              onCheckedChange={(checked) => onChange({ ...form, is_required: checked === true })}
            />
            <Label htmlFor="modifier-group-required" className="cursor-pointer font-normal">
              {t("isRequired")}
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="modifier-group-multiple"
              checked={form.is_multiple}
              onCheckedChange={(checked) => onChange({ ...form, is_multiple: checked === true })}
            />
            <Label htmlFor="modifier-group-multiple" className="cursor-pointer font-normal">
              {t("isMultiple")}
            </Label>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            disabled={isSubmitting || !form.name.trim()}
            onClick={onSubmit}
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
