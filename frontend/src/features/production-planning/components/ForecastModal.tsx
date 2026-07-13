"use client"

import React, { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2 } from "lucide-react"
import { productionPlanningApi } from "../services/api"
import { toast } from "sonner"

interface ForecastModalProps {
  isOpen: boolean
  onClose: () => void
  onApply: (data: { target_date: string; horizon_weeks: number; overwrite: boolean }) => void
  isSubmitting: boolean
  defaultTargetDate: string
  planId?: string
}

export function ForecastModal({ isOpen, onClose, onApply, isSubmitting, defaultTargetDate, planId }: ForecastModalProps) {
  const t = useTranslations("production.forecastModal")
  const [targetDate, setTargetDate] = useState(defaultTargetDate)
  const [horizonWeeks, setHorizonWeeks] = useState(4)
  const [overwrite, setOverwrite] = useState(true)
  const [previewData, setPreviewData] = useState<{ product_id: string; product_name: string; target_quantity: number; historical_avg: number }[] | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)

  // Reset internal state when modal opens with new target date
  useEffect(() => {
    if (isOpen) {
      setTargetDate(defaultTargetDate)
      setPreviewData(null)
    }
  }, [isOpen, defaultTargetDate])

  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!planId) return
    setIsPreviewing(true)
    try {
      const { data } = await productionPlanningApi.previewForecast(planId, { horizon_weeks: horizonWeeks })
      setPreviewData(data.preview)
    } catch {
      toast.error(t("previewError"))
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleApply = () => {
    onApply({ target_date: targetDate, horizon_weeks: horizonWeeks, overwrite })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent layout="scroll" size="lg" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {!previewData ? (
            <form id="forecast-form" onSubmit={handlePreview} className="space-y-4">
              <div className="space-y-2">
                <Label>{t("targetDate")}</Label>
                <Input 
                  type="date" 
                  value={targetDate} 
                  onChange={(e) => setTargetDate(e.target.value)} 
                  required 
                />
              </div>

              <div className="space-y-2">
                <Label>{t("horizonWeeks")}</Label>
                <Input 
                  type="number" 
                  value={horizonWeeks} 
                  onChange={(e) => setHorizonWeeks(parseInt(e.target.value))} 
                  required 
                  min="1"
                  max="12"
                />
                <p className="text-2xs text-muted-foreground">{t("horizonHint")}</p>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <Checkbox 
                  id="overwrite" 
                  checked={overwrite} 
                  onCheckedChange={(checked) => setOverwrite(checked === true)} 
                />
                <Label htmlFor="overwrite" className="text-sm font-normal">
                  {t("overwrite")}
                </Label>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-md border border-border bg-background p-3">
                <div className="text-sm">
                  {t("previewLine", { weeks: horizonWeeks, date: targetDate })}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setPreviewData(null)}>{t("back")}</Button>
              </div>
              
              <div className="border border-border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">{t("columns.product")}</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">{t("columns.historicalAvg")}</th>
                      <th className="px-3 py-2 text-right font-semibold text-blue-600 dark:text-blue-400">{t("columns.target")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewData.length === 0 ? (
                      <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">{t("noForecastProducts")}</td></tr>
                    ) : (
                      previewData.map(item => (
                        <tr key={item.product_id} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium">{item.product_name}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{item.historical_avg.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-bold text-blue-600">{item.target_quantity}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting || isPreviewing}>
            {t("cancel")}
          </Button>
          {!previewData ? (
            <Button type="submit" form="forecast-form" disabled={isPreviewing || !targetDate || !planId}>
              {isPreviewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("preview")}
            </Button>
          ) : (
            <Button type="button" onClick={handleApply} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("apply")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
