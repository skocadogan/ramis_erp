"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { ChefHat, Layers, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { NumberInput } from "@/components/ui/number-input"
import { CategorySelectTree } from "./CategorySelectTree"
import type { Category, CategoryForm, MenuTag } from "@/features/menu/types"
import type { KitchenStation } from "@/features/admin/services/adminApi"
import { MenuTagSelect } from "./MenuTagSelect"
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
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"

interface Props {
  mode: "create" | "edit"
  form: CategoryForm
  isSubmitting: boolean
  onChange: (form: CategoryForm) => void
  onSubmit: () => void
  onClose: () => void
  stations?: KitchenStation[]
  categories?: Category[]
  menuTags?: MenuTag[]
}

export default function CategoryFormModal({
  mode,
  form,
  isSubmitting,
  onChange,
  onSubmit,
  onClose,
  stations = [],
  categories = [],
  menuTags = [],
}: Props) {
  const t = useTranslations("menu_management")
  const selectedStation = stations.find(s => s.id === form.station) ?? null

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent layout="scroll" size="lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("categoryForm.createTitle") : t("categoryForm.editTitle")}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="category-name">{t("categoryForm.name")}</Label>
            <Input
              id="category-name"
              value={form.name}
              onChange={e => onChange({ ...form, name: e.target.value })}
              placeholder={mode === "create" ? t("categoryForm.namePlaceholder") : undefined}
            />
          </div>

          <div className="grid gap-2">
            <Label>{t("categoryForm.tags")}</Label>
            <MenuTagSelect
              value={form.tag_ids}
              onChange={(tag_ids) => onChange({ ...form, tag_ids })}
              tags={menuTags}
            />
          </div>

          <div className="grid gap-2">
            <Label className="flex items-center gap-1.5">
              <Layers size={14} className="text-amber-500" />
              {t("categoryForm.parent")}
            </Label>
            <CategorySelectTree
              categories={mode === "edit" ? categories.filter(c => c.id !== form.parent) : categories}
              value={form.parent ?? ""}
              onChange={(val) => onChange({ ...form, parent: val || null })}
              placeholder={t("categoryForm.parentPh")}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="category-description">{t("categoryForm.description")}</Label>
            <Textarea
              id="category-description"
              value={form.description}
              onChange={e => onChange({ ...form, description: e.target.value })}
              rows={2}
              className="min-h-0 resize-none"
            />
          </div>

          <div className="grid gap-2">
            <Label>{t("categoryForm.order")}</Label>
            <NumberInput
              value={form.order}
              onChange={val => onChange({ ...form, order: parseInt(val) || 0 })}
            />
          </div>

          <div className="grid gap-2">
            <Label>{t("categoryForm.color")}</Label>
            <div className="flex flex-wrap gap-2">
              {['#64748b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'].map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onChange({ ...form, color: c })}
                  className={cn(
                    "h-7 w-7 shrink-0 rounded-full border-2 transition-all hover:scale-105",
                    form.color === c
                      ? "scale-110 border-primary shadow-sm ring-2 ring-primary/30"
                      : "border-border hover:border-muted-foreground/50",
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={t("categoryForm.colorAria", { code: c })}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="category-station" className="flex items-center gap-1.5">
              <ChefHat size={14} className="text-indigo-500" />
              {t("categoryForm.station")}
            </Label>
            <select
              id="category-station"
              value={form.station ?? ""}
              onChange={e => onChange({ ...form, station: e.target.value || null })}
              className={selectClass}
            >
              <option value="">{t("categoryForm.stationPlaceholder")}</option>
              {stations.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.branch_name})</option>
              ))}
            </select>
            {selectedStation && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: selectedStation.color }}
                />
                <span>{t("categoryForm.stationHint", { name: selectedStation.name })}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="category-form-active"
              checked={form.is_active}
              onCheckedChange={checked => onChange({ ...form, is_active: !!checked })}
            />
            <Label htmlFor="category-form-active" className="cursor-pointer font-normal">
              {t("categoryForm.active")}
            </Label>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t("categoryForm.cancel")}
          </Button>
          <Button type="button" onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {isSubmitting
              ? t("categoryForm.saving")
              : mode === "create"
                ? t("categoryForm.save")
                : t("categoryForm.update")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
