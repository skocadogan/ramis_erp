"use client"

import { Hash, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import type { MenuTagForm } from "@/features/menu/hooks/useMenuTagsManagement"
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

interface Props {
  mode: "create" | "edit"
  form: MenuTagForm
  isSubmitting: boolean
  onChange: (form: MenuTagForm) => void
  onSubmit: () => void
  onClose: () => void
}

export function MenuTagFormModal({
  mode,
  form,
  isSubmitting,
  onChange,
  onSubmit,
  onClose,
}: Props) {
  const t = useTranslations("menu_management.menuTagsTab")

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent layout="scroll" size="md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("createTitle") : t("editTitle")}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="menu-tag-name">{t("name")}</Label>
            <div className="relative">
              <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="menu-tag-name"
                value={form.name}
                onChange={(e) => onChange({ ...form, name: e.target.value })}
                placeholder={t("namePlaceholder")}
                className="pl-8"
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("nameHint")}</p>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={onSubmit} disabled={isSubmitting || !form.name.trim()}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("saving")}
              </>
            ) : (
              t("save")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
