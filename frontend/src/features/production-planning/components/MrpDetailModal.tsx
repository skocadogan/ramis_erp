"use client"

import React, { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, AlertTriangle, CheckCircle2, Filter } from "lucide-react"
import { usePlanMrp } from "../hooks/useProductionPlanning"
import { ProductionPlan, MrpResult, MrpResultItem } from "../types"
import { formatNumber, useLocalizedFormatters } from "@/lib/formatters"
import { isMinimumUnlimited } from "@/lib/stockMinimum"
import { adminApi, type KitchenStation } from "@/features/admin/services/adminApi"
import { AsyncPdfExportButton } from "@/components/AsyncPdfExportButton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface MrpDetailModalProps {
  isOpen: boolean
  onClose: () => void
  plan: ProductionPlan | null
  activeStationId?: string
}

export function MrpDetailModal({ isOpen, onClose, plan, activeStationId }: MrpDetailModalProps) {
  const t = useTranslations("production.mrpModal")
  const { formatDate: formatDateLocalized } = useLocalizedFormatters()
  const [selectedStationId, setSelectedStationId] = useState<string | null>("all")
  const [stations, setStations] = useState<KitchenStation[]>([])

  // Şubeye ait mutfak istasyonlarını getir
  useEffect(() => {
    if (isOpen && plan?.branch) {
      adminApi.getStations({ branch_id: plan.branch }).then((res) => {
        if (Array.isArray(res)) {
          setStations(res)
        }
      })
    }
  }, [isOpen, plan?.branch])

  const { data: mrpData, isLoading } = usePlanMrp(
    plan?.id || "",
    (selectedStationId === "all" || !selectedStationId) ? undefined : selectedStationId
  )

  const handleSendToDeficiency = async () => {
    if (!mrpData || !plan) return

    // Tüm depolardaki eksikleri topla
    interface DeficiencyItem { stock_item_id: string; quantity: number; unit: string; notes: string }
    const allMissingItems: DeficiencyItem[] = []
    const mrpWarehouses: MrpResult[] = Array.isArray(mrpData)
      ? mrpData
      : (mrpData.items ? [mrpData] : Object.values(mrpData).filter((v): v is MrpResult => v !== null && typeof v === 'object' && 'items' in v))

    mrpWarehouses.forEach((wh) => {
      wh.items?.forEach((item: MrpResultItem) => {
        const gap = item.gap
        const unlimited =
          item.is_minimum_unlimited === true || isMinimumUnlimited(item.minimum_quantity)

        // Sınırsız / izlenmiyor kalemler eksik listesine eklenmez
        if (gap > 0 && !unlimited) {
          allMissingItems.push({
            stock_item_id: item.stock_item_id,
            quantity: Math.round(gap * 1000) / 1000,
            unit: item.unit || "",
            notes: `${t("notesPrefix")} ${formatDateLocalized(plan.plan_date, { dateStyle: "short" })}`
          })
        }
      })
    })

    if (allMissingItems.length === 0) {
      // Toast notification is handled globally by api.ts interceptor if backend returns message
      // but here we can add a local check
      return
    }

    try {
      const { warehouseApi } = await import("@/features/warehouse/services/warehouseApi")
      const { toast } = await import("sonner")

      const stationId = activeStationId || (selectedStationId === "all" ? undefined : selectedStationId)

      if (!stationId) {
        toast.error(t("toastStationRequired"))
        return
      }

      await warehouseApi.createDeficiencyReport({
        kitchen_station_id: stationId,
        notes: t("deficiencyNotes", { date: formatDateLocalized(plan.plan_date, { dateStyle: "short" }) }),
        items: allMissingItems
      })
      toast.success(t("toastDeficiencySuccess", { count: allMissingItems.length }))
    } catch (error) {
      console.error("Deficiency report creation failed:", error)
    }
  }

  const formattedDate = plan?.plan_date ? formatDateLocalized(plan.plan_date, { dateStyle: "short" }) : ""
  const isDateValid = Boolean(plan?.plan_date && !Number.isNaN(Date.parse(String(plan.plan_date))))

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent layout="scroll" size="7xl" className="max-h-[90vh]">
        <DialogHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <DialogTitle>{t("title")}</DialogTitle>
              {isDateValid && (
                <p className="text-sm text-muted-foreground">
                  {t("subtitle", {
                    date: formattedDate,
                    branch: plan?.branch_name || t("branchFallback"),
                  })}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
                <Filter size={14} className="text-muted-foreground" />
                <Select value={selectedStationId} onValueChange={setSelectedStationId} disabled={stations.length === 0}>
                  <SelectTrigger className="h-8 border-none bg-transparent focus:ring-0 w-[180px] p-0 text-xs font-medium">
                    <SelectValue placeholder={t("filterStations")}>
                      {selectedStationId === "all"
                        ? t("allStations")
                        : stations.find(s => s.id === selectedStationId)?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("allStations")}</SelectItem>
                    {stations.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <AsyncPdfExportButton
                reportSlug="production-plan-mrp"
                params={{
                  plan_id: plan?.id,
                  station_id: selectedStationId === "all" ? undefined : selectedStationId,
                  station_name: stations.find(s => s.id === selectedStationId)?.name || t("allStations")
                }}
                filename={`MRP_${plan?.plan_date}.pdf`}
                size="sm"
              />
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="min-h-0 flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : !mrpData || Object.keys(mrpData).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {t("empty")}
            </div>
          ) : (
            <div className="space-y-8">
              {/* Backend tek bir depo objesi dönüyor: { warehouse_name, items: [] } */}
              {(() => {
                const mrpWarehouses: MrpResult[] = Array.isArray(mrpData)
                  ? mrpData
                  : (mrpData.items ? [mrpData] : Object.values(mrpData).filter((v): v is MrpResult => v !== null && typeof v === 'object' && 'items' in v))

                return mrpWarehouses.map((warehouseData, idx) => (
                  <div key={idx} className="border border-border rounded-lg overflow-hidden">
                    <div className="border-b border-border bg-muted px-4 py-3">
                      <h3 className="font-semibold text-foreground">{warehouseData.warehouse_name}</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted text-muted-foreground">
                          <tr>
                            <th className="text-left px-4 py-2 font-medium">{t("columns.stockItem")}</th>
                            <th className="text-left px-4 py-2 font-medium">{t("columns.station")}</th>
                            <th className="text-right px-4 py-2 font-medium">{t("columns.required")}</th>
                            <th className="text-right px-4 py-2 font-medium">{t("columns.onHand")}</th>
                            <th className="text-right px-4 py-2 font-medium">{t("columns.gap")}</th>
                            <th className="text-center px-4 py-2 font-medium">{t("columns.status")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {warehouseData.items?.map((item: MrpResultItem) => {
                            const gapVal = item.gap
                            const reqVal = item.required_quantity
                            const onHandVal = item.on_hand
                            const unlimited =
                              item.is_minimum_unlimited === true ||
                              isMinimumUnlimited(item.minimum_quantity)

                            return (
                              <tr key={item.stock_item_id} className="border-t border-border transition-colors hover:bg-muted/20">
                                <td className="px-4 py-2 font-medium text-foreground">
                                  {item.stock_item_name}
                                </td>
                                <td className="px-4 py-2 text-xs text-muted-foreground">
                                  {item.kitchen_station}
                                </td>
                                <td className="px-4 py-2 text-right">
                                  {formatNumber(reqVal, 2)} {item.unit}
                                </td>
                                <td className="px-4 py-2 text-right text-muted-foreground">
                                  {unlimited ? (
                                    <span className="text-muted-foreground italic text-xs">{t("unlimited")}</span>
                                  ) : (
                                    <>
                                      {formatNumber(onHandVal, 2)} {item.unit}
                                    </>
                                  )}
                                </td>
                                <td className={`px-4 py-2 text-right font-semibold ${unlimited ? "text-muted-foreground font-normal" : gapVal > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                                  {unlimited ? (
                                    <span className="italic text-xs font-normal">—</span>
                                  ) : (
                                    <>
                                      {formatNumber(Math.abs(gapVal), 2)} {item.unit}
                                    </>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-center">
                                  {unlimited ? (
                                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">
                                      {t("notTracked")}
                                    </span>
                                  ) : gapVal > 0 ? (
                                    <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 px-2 py-0.5 rounded-full text-2xs font-bold dark:bg-red-900/30 dark:text-red-400">
                                      <AlertTriangle size={12} /> {t("shortage")}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 px-2 py-0.5 rounded-full text-2xs font-bold dark:bg-green-900/30 dark:text-green-400">
                                      <CheckCircle2 size={12} /> {t("sufficient")}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                          {(!warehouseData.items || warehouseData.items.length === 0) && (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-muted-foreground italic">
                                {t("warehouseEmpty")}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              })()}
            </div>
          )}
        </DialogBody>

        <DialogFooter className="flex-row flex-wrap items-center justify-between gap-3 sm:justify-between">
          <Button
            onClick={handleSendToDeficiency}
            disabled={isLoading || !mrpData}
            className="gap-2"
          >
            <AlertTriangle size={16} />
            {t("sendDeficiency")}
          </Button>
          <Button onClick={onClose} variant="outline">{t("close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
