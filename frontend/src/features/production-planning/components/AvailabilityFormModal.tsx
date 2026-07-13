"use client"

import React, { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Calendar, Search } from "lucide-react"
import { ProductDayAvailability, AvailabilityMode, ProductDayAvailabilityForm } from "../types"
import { BranchSelect } from "@/features/branches/components/BranchSelect"
import { useMenuData } from "@/features/menu/hooks/useMenuData"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fetchAllProductAvailabilities } from "../services/api"

interface AvailabilityFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: ProductDayAvailabilityForm[]) => void
  isSubmitting: boolean
  initialData?: ProductDayAvailability | null
}

interface BulkAvailabilityItem {
  product: string
  product_name: string
  mode: AvailabilityMode
  remaining_portions: number | null
}

export function AvailabilityFormModal({ isOpen, onClose, onSave, isSubmitting, initialData }: AvailabilityFormModalProps) {
  const t = useTranslations("production.availabilityForm")
  const { products, isLoading: isLoadingMenu } = useMenuData()
  const [branch, setBranch] = useState(initialData?.branch || "")
  const [date, setDate] = useState(initialData?.effective_date || new Date().toISOString().split('T')[0])
  const [items, setItems] = useState<BulkAvailabilityItem[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [sourceDate, setSourceDate] = useState("")
  const [isCopying, setIsCopying] = useState(false)

  useEffect(() => {
    if (isOpen && initialData) {
      setBranch(initialData.branch)
      setDate(initialData.effective_date)
    }
  }, [isOpen, initialData])

  useEffect(() => {
    const fetchExisting = async () => {
      if (!isOpen || !branch || !date || products.length === 0) return

      try {
        const existingRecords = await fetchAllProductAvailabilities({ branch_id: branch, date: date })

        setItems(products.map(p => {
          const existing = existingRecords.find(r => r.product === p.id)
          return {
            product: p.id,
            product_name: p.name,
            mode: (existing ? existing.mode : 'UNLIMITED') as AvailabilityMode,
            remaining_portions: existing ? existing.remaining_portions : null
          }
        }))
      } catch (error) {
        console.error("Mevcut kısıtlar yüklenemedi:", error)
      }
    }

    fetchExisting()
  }, [branch, date, isOpen, products])

  const handleCopyFromDate = async () => {
    if (!branch || !sourceDate || products.length === 0) return
    setIsCopying(true)
    try {
      const sourceRecords = await fetchAllProductAvailabilities({ branch_id: branch, date: sourceDate })
      setItems(products.map(p => {
        const existing = sourceRecords.find(r => r.product === p.id)
        return {
          product: p.id,
          product_name: p.name,
          mode: (existing ? existing.mode : 'UNLIMITED') as AvailabilityMode,
          remaining_portions: existing ? existing.remaining_portions : null
        }
      }))
    } catch (error) {
      console.error("Kopya verisi alınamadı:", error)
    } finally {
      setIsCopying(false)
    }
  }

  const handleUpdateItem = (
    productId: string,
    field: keyof BulkAvailabilityItem,
    value: BulkAvailabilityItem[keyof BulkAvailabilityItem],
  ) => {
    setItems(prev => prev.map(item =>
      item.product === productId ? { ...item, [field]: value } : item
    ))
  }

  const filteredItems = items.filter(item =>
    item.product_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!branch || !date) return

    const changedItems = items.filter(item => item.mode !== 'UNLIMITED')

    const payload = changedItems.map(item => ({
      branch,
      effective_date: date,
      product: item.product,
      mode: item.mode,
      remaining_portions: item.mode === 'LIMITED' ? item.remaining_portions : null
    }))

    onSave(payload)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent layout="scroll" size="7xl" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{initialData ? t("titleEdit") : t("titleBulk")}</DialogTitle>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <form
            id="availability-form"
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            autoComplete="off"
          >
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-12">
              {/* SOL SÜTUN */}
              <div className="min-h-0 space-y-6 overflow-y-auto border-b border-border p-6 md:col-span-4 md:border-b-0 md:border-r custom-scrollbar">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("branch")}</Label>
                    <BranchSelect value={branch} onChange={setBranch} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("date")}</Label>
                    <div className="relative">
                      <Calendar className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="date"
                        className="bg-transparent pl-9"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-amber-200/70 bg-background p-4 dark:border-amber-800/50">
                    <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-400">
                      <strong>{t("infoTitle")}</strong> {t("infoBody")}
                    </p>
                  </div>

                  <div className="mt-4 space-y-2 border-t border-border pt-4">
                    <Label>{t("copyFromDate")}</Label>
                    <div className="flex gap-2">
                      <Input
                        type="date"
                        value={sourceDate}
                        onChange={(e) => setSourceDate(e.target.value)}
                        className="h-9 bg-transparent text-xs"
                      />
                      <Button
                        type="button"
                        onClick={handleCopyFromDate}
                        disabled={!sourceDate || !branch || isCopying}
                        className="h-9 shrink-0 px-3 text-xs"
                        variant="outline"
                      >
                        {isCopying && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        {t("copy")}
                      </Button>
                    </div>
                    <p className="text-2xs text-muted-foreground">{t("copyHint")}</p>
                  </div>
                </div>
              </div>

              {/* SAĞ SÜTUN */}
              <div className="flex min-h-0 flex-col md:col-span-8">
                <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold">{t("menuProducts")}</h3>
                    <p className="truncate text-2xs text-muted-foreground">{t("menuProductsHint")}</p>
                  </div>
                  <div className="relative w-48 shrink-0">
                    <Input
                      placeholder={t("searchProduct")}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 bg-transparent pl-8 text-xs"
                    />
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
                  {isLoadingMenu ? (
                    <div className="flex justify-center p-8">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 z-20 border-b border-border bg-background text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left font-bold">{t("colProduct")}</th>
                            <th className="w-40 px-3 py-2 text-left font-bold">{t("colMode")}</th>
                            <th className="w-32 px-3 py-2 text-right font-bold">{t("colRemaining")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filteredItems.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="px-3 py-8 text-center italic text-muted-foreground">
                                {t("noProducts")}
                              </td>
                            </tr>
                          ) : (
                            filteredItems.map((item) => (
                              <tr key={item.product} className="transition-colors hover:bg-muted/20">
                                <td className="px-3 py-2 font-medium">{item.product_name}</td>
                                <td className="px-3 py-2">
                                  <Select
                                    value={item.mode}
                                    onValueChange={(val) => handleUpdateItem(item.product, 'mode', val)}
                                  >
                                    <SelectTrigger className="h-7 w-full bg-transparent text-2xs">
                                      <SelectValue>
                                        {item.mode === 'SOLD_OUT' ? t("modeSoldOutShort") :
                                          item.mode === 'LIMITED' ? t("modeLimitedShort") : t("modeUnlimitedShort")}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="UNLIMITED">{t("modeUnlimitedOpen")}</SelectItem>
                                      <SelectItem value="LIMITED">{t("modeLimitedShort")}</SelectItem>
                                      <SelectItem value="SOLD_OUT">{t("modeSoldOutShort")}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    type="number"
                                    disabled={item.mode !== 'LIMITED'}
                                    placeholder="-"
                                    value={item.remaining_portions ?? ""}
                                    onChange={(e) => handleUpdateItem(item.product, 'remaining_portions', e.target.value === "" ? null : parseFloat(e.target.value))}
                                    className="h-7 bg-transparent text-right font-mono text-xs"
                                    min="0"
                                    step="1"
                                  />
                                </td>
                              </tr>
                            ))
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
          <Button type="submit" form="availability-form" disabled={isSubmitting || !branch || !date}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initialData ? t("submitEdit") : t("submitSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
