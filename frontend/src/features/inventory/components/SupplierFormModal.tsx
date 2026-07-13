"use client"

import { useState, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Plus, Edit, Loader2, Search, Check, ChevronDown, X } from "lucide-react"
import type { StockItem } from "@/features/inventory/types"
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

interface SupplierFormModalProps {
  showSupplierForm: boolean
  setShowSupplierForm: (show: boolean) => void
  editingSupplierId: string | null
  supplierFormData: {
    name: string
    contact_person: string
    phone: string
    email: string
    address: string
    notes: string
    stock_items: string[]
  }
  setSupplierFormData: (data: {
    name: string
    contact_person: string
    phone: string
    email: string
    address: string
    notes: string
    stock_items: string[]
  }) => void
  isSubmitting: boolean
  handleSupplierSubmit: () => void
  stockItems?: StockItem[]
}

const lbl = "text-xs font-semibold text-muted-foreground uppercase tracking-wide"

export function SupplierFormModal({
  showSupplierForm,
  setShowSupplierForm,
  editingSupplierId,
  supplierFormData,
  setSupplierFormData,
  isSubmitting,
  handleSupplierSubmit,
  stockItems = [],
}: SupplierFormModalProps) {
  const t = useTranslations("inventory.supplierForm")
  const [itemSearch, setItemSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [catOpen, setCatOpen] = useState(false)

  const categories = useMemo(() => {
    const map = new Map<string, string>()
    stockItems.forEach((i) => {
      if (i.category && i.category_name) map.set(i.category, i.category_name)
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [stockItems])

  const filteredItems = useMemo(() => {
    return stockItems.filter((item) => {
      const matchCat = categoryFilter === "all" || item.category === categoryFilter
      const q = itemSearch.toLowerCase()
      const matchSearch = !q || item.name.toLowerCase().includes(q) || (item.sku ?? "").toLowerCase().includes(q)
      return matchCat && matchSearch
    })
  }, [stockItems, categoryFilter, itemSearch])

  const title = editingSupplierId ? t("titleEdit") : t("titleNew")
  const subtitle = editingSupplierId ? t("subtitleEdit") : t("subtitleNew")
  const selectedItems = supplierFormData.stock_items ?? []

  const selectedInFiltered = filteredItems.filter((i) => selectedItems.includes(i.id))
  const allFilteredSelected = filteredItems.length > 0 && selectedInFiltered.length === filteredItems.length
  const someFilteredSelected = selectedInFiltered.length > 0 && !allFilteredSelected
  const selectedCatName =
    categoryFilter === "all"
      ? t("allCategories")
      : (categories.find((c) => c.id === categoryFilter)?.name ?? t("categoryFallback"))

  const toggleItem = (id: string) => {
    const next = selectedItems.includes(id)
      ? selectedItems.filter((x) => x !== id)
      : [...selectedItems, id]
    setSupplierFormData({ ...supplierFormData, stock_items: next })
  }

  const toggleAllFiltered = () => {
    const filteredIds = filteredItems.map((i) => i.id)
    if (allFilteredSelected) {
      setSupplierFormData({ ...supplierFormData, stock_items: selectedItems.filter((id) => !filteredIds.includes(id)) })
    } else {
      const merged = Array.from(new Set([...selectedItems, ...filteredIds]))
      setSupplierFormData({ ...supplierFormData, stock_items: merged })
    }
  }

  const set = (key: string, val: string) => setSupplierFormData({ ...supplierFormData, [key]: val })

  return (
    <Dialog open={showSupplierForm} onOpenChange={setShowSupplierForm}>
      <DialogContent layout="scroll" size="6xl" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-col gap-0 overflow-hidden p-0 md:flex-row">
          <div className="shrink-0 space-y-4 overflow-y-auto p-6 md:w-80">
            <p className={lbl}>{t("companyInfo")}</p>

            <div className="grid gap-2">
              <Label htmlFor="supplier-name">
                {t("name")} <span className="text-rose-500">*</span>
              </Label>
              <Input id="supplier-name" value={supplierFormData.name} onChange={(e) => set("name", e.target.value)} placeholder={t("namePh")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supplier-contact">{t("contact")}</Label>
              <Input id="supplier-contact" value={supplierFormData.contact_person} onChange={(e) => set("contact_person", e.target.value)} placeholder={t("contactPh")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supplier-phone">{t("phone")}</Label>
              <Input id="supplier-phone" value={supplierFormData.phone} onChange={(e) => set("phone", e.target.value)} className="font-mono" placeholder={t("phonePh")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supplier-email">{t("email")}</Label>
              <Input id="supplier-email" type="email" value={supplierFormData.email} onChange={(e) => set("email", e.target.value)} placeholder={t("emailPh")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supplier-address">{t("address")}</Label>
              <Textarea id="supplier-address" value={supplierFormData.address} onChange={(e) => set("address", e.target.value)} rows={2} placeholder={t("addressPh")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supplier-notes">{t("notes")}</Label>
              <Textarea id="supplier-notes" value={supplierFormData.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder={t("notesPh")} />
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden border-t border-border p-6 md:border-t-0 md:border-l">
            <div className="flex shrink-0 items-center justify-between">
              <p className={lbl}>{t("suppliedProducts")}</p>
              {selectedItems.length > 0 && (
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                  {t("selectedCount", { count: selectedItems.length })}
                </span>
              )}
            </div>

            {stockItems.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background p-8 text-center">
                <p className="text-sm text-muted-foreground">{t("noItems")}</p>
              </div>
            ) : (
              <>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setCatOpen((v) => !v)}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-blue-400 dark:hover:border-blue-600"
                    >
                      <span className="max-w-[120px] truncate">{selectedCatName}</span>
                      <ChevronDown size={12} />
                    </button>
                    {catOpen && (
                      <div className="absolute left-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-border bg-background shadow-lg">
                        <div className="max-h-56 overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => { setCategoryFilter("all"); setCatOpen(false) }}
                            className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${categoryFilter === "all" ? "font-semibold text-blue-600 dark:text-blue-400" : "text-foreground"}`}
                          >
                            {t("allCategories")}
                          </button>
                          {categories.map((cat) => (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => { setCategoryFilter(cat.id); setCatOpen(false) }}
                              className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${categoryFilter === cat.id ? "font-semibold text-blue-600 dark:text-blue-400" : "text-foreground"}`}
                            >
                              {cat.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
                    <Search size={13} className="shrink-0 text-muted-foreground" />
                    <input
                      type="text"
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      placeholder={t("searchPh")}
                      className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    {itemSearch && (
                      <button type="button" onClick={() => setItemSearch("")} className="text-muted-foreground hover:text-foreground">
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={toggleAllFiltered}
                    disabled={filteredItems.length === 0}
                    className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                      allFilteredSelected
                        ? "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-400"
                        : "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                    }`}
                  >
                    {allFilteredSelected ? t("deselectAllFiltered") : someFilteredSelected ? t("selectRest") : t("selectAllFiltered")}
                  </button>
                </div>

                <div className="grid shrink-0 grid-cols-[1.25rem_1fr_10rem] items-center gap-3 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span />
                  <span>{t("colProductName")}</span>
                  <span className="text-right">{t("colCode")}</span>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                  {filteredItems.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">{t("noMatch")}</p>
                  ) : (
                    filteredItems.map((item) => {
                      const isSelected = selectedItems.includes(item.id)
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleItem(item.id)}
                          className={`grid w-full grid-cols-[1.25rem_1fr_10rem] items-center gap-3 px-3 py-2 text-left transition-colors ${
                            isSelected ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-background"
                          }`}
                        >
                          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                            isSelected ? "border-blue-600 bg-blue-600" : "border-border"
                          }`}>
                            {isSelected && <Check size={10} className="text-white" strokeWidth={3} />}
                          </span>
                          <span className={`truncate text-sm font-medium ${isSelected ? "text-blue-700 dark:text-blue-300" : "text-foreground"}`}>
                            {item.name}
                          </span>
                          <span className="truncate text-right font-mono text-xs text-muted-foreground">{item.sku}</span>
                        </button>
                      )
                    })
                  )}
                </div>

                <div className="flex shrink-0 items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {t("showingCount", { count: filteredItems.length })}
                    {categoryFilter !== "all" && <span className="ml-1">({selectedCatName})</span>}
                  </span>
                  {selectedItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSupplierFormData({ ...supplierFormData, stock_items: [] })}
                      className="transition-colors hover:text-rose-500"
                    >
                      {t("clearAllSelections")}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setShowSupplierForm(false)} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={handleSupplierSubmit} disabled={isSubmitting || !supplierFormData.name}>
            {isSubmitting ? <Loader2 className="animate-spin" size={15} /> : editingSupplierId ? <Edit size={15} /> : <Plus size={15} />}
            {editingSupplierId ? t("update") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
