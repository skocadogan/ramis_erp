"use client"

import { useTranslations } from "next-intl"
import { Plus, Edit, Loader2 } from "lucide-react"
import { RecipeCategory } from "../types"
import { RecipeCategorySelectTree } from "./RecipeCategorySelectTree"
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

interface RecipeCategoryFormModalProps {
  open: boolean
  onClose: () => void
  editingCategoryId: string | null
  formData: { name: string; code: string; parent: string }
  setFormData: (data: { name: string; code: string; parent: string }) => void
  isSubmitting: boolean
  onSubmit: () => void
  categories: RecipeCategory[]
}

export function RecipeCategoryFormModal({
  open,
  onClose,
  editingCategoryId,
  formData,
  setFormData,
  isSubmitting,
  onSubmit,
  categories,
}: RecipeCategoryFormModalProps) {
  const t = useTranslations("recipes.categoryForm")
  const title = editingCategoryId ? t("titleEdit") : formData.parent ? t("titleNewChild") : t("titleNew")

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent layout="scroll" size="md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <div className="grid gap-2">
            <Label htmlFor="rc-name">{t("nameLabel")}</Label>
            <Input
              id="rc-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t("namePlaceholder")}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="rc-code">{t("codeLabel")}</Label>
            <Input
              id="rc-code"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className="font-mono uppercase"
              placeholder={t("codePlaceholder")}
            />
          </div>

          <div className="grid gap-2">
            <Label>{t("parentLabel")}</Label>
            <RecipeCategorySelectTree
              categories={categories.filter((c) => c.id !== editingCategoryId)}
              value={formData.parent}
              onChange={(val) => setFormData({ ...formData, parent: val })}
              placeholder={t("parentNone")}
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
            disabled={isSubmitting || !formData.name || !formData.code}
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" size={16} />
            ) : editingCategoryId ? (
              <Edit size={16} />
            ) : (
              <Plus size={16} />
            )}
            {editingCategoryId ? t("update") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
