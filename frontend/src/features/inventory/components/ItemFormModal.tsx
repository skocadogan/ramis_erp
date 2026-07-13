"use client"

import type { Dispatch, SetStateAction } from "react"
import { useTranslations } from "next-intl"
import { Plus, Loader2 } from "lucide-react"
import { NumberInput } from "@/components/ui/number-input"
import { StockCategory, StockUnit } from "@/features/inventory/types"
import { CategorySelectTree } from "./CategorySelectTree"
import { MINIMUM_UNLIMITED_SENTINEL } from "@/lib/stockMinimum"
import { AllergenMultiSelect } from "@/features/allergens/components/AllergenMultiSelect"
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

interface ItemFormModalProps {
  showForm: boolean
  setShowForm: (show: boolean) => void
  editingItemId: string | null
  formData: { name: string; sku: string; barcode: string; category: string; unit: string; minimum_quantity: string; last_purchase_price: string; allergen_ids: string[] }
  setFormData: Dispatch<
    SetStateAction<{
      name: string
      sku: string
      barcode: string
      category: string
      unit: string
      minimum_quantity: string
      last_purchase_price: string
      allergen_ids: string[]
    }>
  >
  isSubmitting: boolean
  handleItemSubmit: () => void
  categories: StockCategory[]
  stockUnits: StockUnit[]
}

export function ItemFormModal({
  showForm,
  setShowForm,
  editingItemId,
  formData,
  setFormData,
  isSubmitting,
  handleItemSubmit,
  categories,
  stockUnits,
}: ItemFormModalProps) {
  const t = useTranslations("inventory.itemForm")

  const title = editingItemId ? t("titleEdit") : t("titleNew")
  const subtitle = editingItemId ? t("subtitleEdit") : t("subtitleNew")

  return (
    <Dialog open={showForm} onOpenChange={setShowForm}>
      <DialogContent layout="scroll" size="4xl" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-col gap-0 p-0 lg:flex-row">
          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
            <div className="grid gap-2">
              <Label htmlFor="item-name">{t("productName")}</Label>
              <Input id="item-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={t("productPh")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="item-sku">{t("sku")}</Label>
              <Input id="item-sku" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} className="font-mono" placeholder={t("skuPh")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="item-barcode">{t("barcode")}</Label>
              <Input id="item-barcode" value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} className="font-mono" placeholder={t("barcodePh")} />
            </div>
            <div className="grid gap-2">
              <Label>{t("category")}</Label>
              <CategorySelectTree
                categories={categories}
                value={formData.category}
                onChange={(val) => setFormData({ ...formData, category: val })}
                placeholder={t("categoryPh")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="item-unit">{t("unit")}</Label>
                <select id="item-unit" value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} className="w-full px-3 py-2 border border-border rounded-md text-ui-sm bg-background transition-all outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring">
                  <option value="">{t("select")}</option>
                  {stockUnits.map((u) => (
                    <option key={u.id} value={u.short_name}>
                      {u.name} ({u.short_name})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="item-min-qty">{t("minQty")}</Label>
                <NumberInput
                  id="item-min-qty"
                  min={MINIMUM_UNLIMITED_SENTINEL}
                  step="any"
                  value={formData.minimum_quantity}
                  onChange={(val) => {
                    if (val === "" || val === "-") {
                      setFormData({ ...formData, minimum_quantity: val })
                      return
                    }
                    const n = Number(String(val).replace(",", "."))
                    if (Number.isNaN(n)) return
                    if (n === MINIMUM_UNLIMITED_SENTINEL) {
                      setFormData({ ...formData, minimum_quantity: String(MINIMUM_UNLIMITED_SENTINEL) })
                      return
                    }
                    if (n < 0) return
                    setFormData({ ...formData, minimum_quantity: val })
                  }}
                />
                <p className="text-sub text-muted-foreground">{t("minQtyHint")}</p>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="item-price">{t("lastPrice")}</Label>
              <NumberInput id="item-price" step="0.01" value={formData.last_purchase_price} onChange={(val) => setFormData({ ...formData, last_purchase_price: val })} suffix="" />
            </div>
          </div>

          <div className="flex w-full shrink-0 flex-col border-t border-border p-5 lg:w-80 lg:border-t-0 lg:border-l">
            <AllergenMultiSelect
              value={formData.allergen_ids}
              onChange={(allergen_ids) => setFormData({ ...formData, allergen_ids })}
              className="flex flex-1 flex-col"
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setShowForm(false)} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleItemSubmit}
            disabled={isSubmitting || !formData.name || !formData.category || !formData.unit}
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
            {editingItemId ? t("update") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
