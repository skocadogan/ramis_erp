"use client"

import { Plus, Edit, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { StockCategory } from "@/features/inventory/types"
import { CategorySelectTree } from "./CategorySelectTree"
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

interface CategoryFormModalProps {
  showCategoryForm: boolean
  setShowCategoryForm: (show: boolean) => void
  editingCategoryId: string | null
  categoryFormData: { name: string; code: string; parent: string }
  setCategoryFormData: (data: { name: string; code: string; parent: string }) => void
  isSubmitting: boolean
  handleCategorySubmit: () => void
  categories: StockCategory[]
}

export function CategoryFormModal({
  showCategoryForm,
  setShowCategoryForm,
  editingCategoryId,
  categoryFormData,
  setCategoryFormData,
  isSubmitting,
  handleCategorySubmit,
  categories,
}: CategoryFormModalProps) {
  const t = useTranslations("inventory.categoryForm")

  const title = editingCategoryId ? t("titleEdit") : categoryFormData.parent ? t("titleSub") : t("titleNew")
  const subtitle = editingCategoryId ? t("subtitleEdit") : t("subtitleNew")

  return (
    <Dialog open={showCategoryForm} onOpenChange={setShowCategoryForm}>
      <DialogContent layout="scroll" size="md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="category-name">{t("name")}</Label>
            <Input
              id="category-name"
              value={categoryFormData.name}
              onChange={(e) => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
              placeholder={t("namePh")}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="category-code">{t("code")}</Label>
            <Input
              id="category-code"
              value={categoryFormData.code}
              onChange={(e) => setCategoryFormData({ ...categoryFormData, code: e.target.value })}
              className="font-mono"
              placeholder={t("codePh")}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("parent")}</Label>
            <CategorySelectTree
              categories={categories.filter((c) => c.id !== editingCategoryId)}
              value={categoryFormData.parent}
              onChange={(val) => setCategoryFormData({ ...categoryFormData, parent: val })}
              placeholder={t("parentPh")}
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setShowCategoryForm(false)} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleCategorySubmit}
            disabled={isSubmitting || !categoryFormData.name || !categoryFormData.code}
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" size={15} />
            ) : editingCategoryId ? (
              <Edit size={15} />
            ) : (
              <Plus size={15} />
            )}
            {editingCategoryId ? t("update") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
