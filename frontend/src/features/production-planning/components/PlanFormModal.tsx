"use client"

import React, { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Loader2, Calendar } from "lucide-react"
import { ProductionPlanForm, ProductionPlanLine, ProductionPlan } from "../types"
import { BranchSelect } from "@/features/branches/components/BranchSelect"

import { useMenuData } from "@/features/menu/hooks/useMenuData"

interface PlanFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: ProductionPlanForm) => void
  isSubmitting: boolean
  initialData?: ProductionPlan | null
}

const defaultFormData: ProductionPlanForm = {
  branch: "",
  plan_date: new Date().toISOString().split('T')[0],
  notes: "",
  lines: []
}

export function PlanFormModal({ isOpen, onClose, onSave, isSubmitting, initialData }: PlanFormModalProps) {
  const t = useTranslations("production.planForm")
  const { products, isLoading: isLoadingMenu } = useMenuData()
  const [formData, setFormData] = useState<ProductionPlanForm>(defaultFormData)

  useEffect(() => {
    if (isOpen && products.length > 0) {
      if (initialData) {
        // Düzenleme modu: Tüm ürünleri listele, planda olanların miktarını doldur
        const mergedLines: ProductionPlanLine[] = products.map(p => {
          const existingLine = initialData.lines?.find(l => {
            const lProductId = typeof l.product === "object" && l.product !== null && "id" in l.product
              ? String((l.product as { id: string }).id)
              : String(l.product);
            return String(lProductId) === String(p.id);
          });

          return {
            product: p.id,
            product_name: p.name,
            target_quantity: existingLine ? existingLine.target_quantity : 0
          }
        })
        setFormData({
          branch: initialData.branch,
          plan_date: initialData.plan_date,
          notes: initialData.notes || "",
          lines: mergedLines
        })
      } else {
        // Yeni plan: Tüm ürünleri boş hedefle listele
        const initialLines: ProductionPlanLine[] = products.map(p => ({
          product: p.id,
          product_name: p.name,
          target_quantity: 0
        }))
        setFormData({ ...defaultFormData, lines: initialLines })
      }
    }
  }, [isOpen, initialData, products])

  const [searchQuery, setSearchQuery] = useState("")

  const filteredLines = formData.lines.filter(line => {
    if (!searchQuery) return true
    const pName = line.product_name || products.find(p => p.id === line.product)?.name || ""
    return pName.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const handleUpdateLine = (index: number, field: keyof ProductionPlanLine, value: string | number) => {
    setFormData(prev => {
      const newLines = [...prev.lines]
      let finalValue = value
      
      // Miktar alanları için ondalık istemiyoruz
      if (field === "target_quantity" && value !== "") {
        finalValue = parseInt(String(value), 10) || 0
      }
      
      newLines[index] = { ...newLines[index], [field]: finalValue }
      return { ...prev, lines: newLines }
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Filtrele: Sadece hedef adeti girilmiş olanları gönderelim (isteğe bağlı, ama temiz veri için iyi olur)
    // Ancak backend boş stringleri veya 0'ları kabul ediyorsa kalsın. 
    // Kullanıcı "sadece doldurduklarımı gönder" demedi, ama genelde mantıklısı budur.
    const finalData = {
      ...formData,
      lines: formData.lines.filter(l => l.target_quantity > 0)
    }

    if (!finalData.branch || !finalData.plan_date) return
    onSave(finalData)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent layout="scroll" size="7xl" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{initialData ? t("titleEdit") : t("titleCreate")}</DialogTitle>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <form id="plan-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden" autoComplete="off">
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-12">
            {/* SOL SÜTUN: Genel Bilgiler */}
            <div className="min-h-0 space-y-6 overflow-y-auto border-r border-border p-6 no-scrollbar md:col-span-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("branch")}</Label>
                  <BranchSelect
                    value={formData.branch}
                    onChange={(val) => setFormData(prev => ({ ...prev, branch: val }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("planDate")}</Label>
                  <div className="relative">
                    <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="date"
                      className="pl-9"
                      value={formData.plan_date}
                      onChange={(e) => setFormData(prev => ({ ...prev, plan_date: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("notes")}</Label>
                  <textarea
                    className="flex min-h-[120px] w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder={t("notesPlaceholder")}
                  />
                </div>
              </div>
            </div>

            {/* SAĞ SÜTUN: Menü Ürünleri */}
            <div className="flex min-h-0 flex-col md:col-span-8">
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-4">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold truncate">{t("menuProducts")}</h3>
                  <p className="text-2xs text-muted-foreground truncate">{t("menuProductsHint")}</p>
                </div>
                <div className="relative w-48 shrink-0">
                  <Input
                    placeholder={t("searchProduct")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 text-xs pl-8"
                  />
                  <Plus className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground rotate-45" /> {/* Using Plus rotated as X/Search icon visually if needed or just search icon */}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 scrollbar-thin">
                {isLoadingMenu ? (
                  <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /></div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-border bg-background">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-20 border-b border-border bg-background text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-bold">{t("colProduct")}</th>
                          <th className="px-3 py-2 text-right font-bold w-40">{t("colTarget")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredLines.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="px-3 py-8 text-center text-muted-foreground italic">
                              {t("noProducts")}
                            </td>
                          </tr>
                        ) : (
                          filteredLines.map((line) => {
                            const realIdx = formData.lines.findIndex(l => l.product === line.product);
                            const pName = line.product_name || products.find(p => p.id === line.product)?.name || t("unknownProduct")

                            return (
                              <tr key={line.product} className="transition-colors hover:bg-muted/20">
                                <td className="px-3 py-2 font-medium">{pName}</td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="number"
                                    placeholder="0"
                                    value={line.target_quantity}
                                    onChange={(e) => handleUpdateLine(realIdx, "target_quantity", e.target.value)}
                                    className="h-7 text-right font-mono text-xs focus:ring-1 focus:ring-blue-500"
                                    min="0"
                                    step="1"
                                    autoComplete="off"
                                  />
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button type="submit" form="plan-form" disabled={isSubmitting || !formData.branch || !formData.plan_date}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initialData ? t("submitEdit") : t("submitCreate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
