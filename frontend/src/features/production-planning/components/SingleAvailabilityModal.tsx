"use client"

import React, { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { ProductDayAvailability, AvailabilityMode, ProductDayAvailabilityForm } from "../types"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface SingleAvailabilityModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: ProductDayAvailabilityForm) => void
  isSubmitting: boolean
  initialData: ProductDayAvailability | null
}

export function SingleAvailabilityModal({ isOpen, onClose, onSave, isSubmitting, initialData }: SingleAvailabilityModalProps) {
  const t = useTranslations("production.singleAvailability")
  const [formData, setFormData] = useState({
    mode: 'UNLIMITED' as AvailabilityMode,
    remaining_portions: '' as string | number
  })

  useEffect(() => {
    if (isOpen && initialData) {
      setFormData({
        mode: initialData.mode,
        remaining_portions: initialData.remaining_portions || ""
      })
    }
  }, [isOpen, initialData])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!initialData) return
    
    onSave({
      branch: initialData.branch,
      product: initialData.product,
      effective_date: initialData.effective_date,
      mode: formData.mode,
      remaining_portions:
        formData.mode === "LIMITED"
          ? Number(formData.remaining_portions) || null
          : null,
    })
  }

  if (!initialData) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t("title", { product: initialData.product_name ?? "" })}</DialogTitle>
          <DialogDescription>
            {initialData.branch_name} - {initialData.effective_date}
          </DialogDescription>
        </DialogHeader>

        <form id="single-availability-form" onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-2">
            <Label>{t("modeLabel")}</Label>
            <Select 
              value={formData.mode} 
              onValueChange={(val) => setFormData(prev => ({ ...prev, mode: val as AvailabilityMode }))}
            >
              <SelectTrigger className="w-full h-10">
                <SelectValue>
                  {formData.mode === 'SOLD_OUT' ? t("modeSoldOut") : 
                   formData.mode === 'LIMITED' ? t("modeLimited") : t("modeUnlimitedSales")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UNLIMITED">{t("modeUnlimitedItem")}</SelectItem>
                <SelectItem value="LIMITED">{t("modeLimited")}</SelectItem>
                <SelectItem value="SOLD_OUT">{t("modeSoldOut")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.mode === 'LIMITED' && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <Label>{t("remainingLabel")}</Label>
              <Input 
                type="number"
                min="0"
                step="1"
                value={formData.remaining_portions}
                onChange={(e) => setFormData(prev => ({ ...prev, remaining_portions: e.target.value }))}
                placeholder={t("remainingPlaceholder")}
                className="h-10"
                required
              />
            </div>
          )}

          <div className="rounded-lg border border-border bg-background p-4">
             <p className="text-2xs text-muted-foreground leading-relaxed">
               {t("hint")}
             </p>
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button type="submit" form="single-availability-form" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
