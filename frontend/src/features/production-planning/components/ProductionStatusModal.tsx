"use client"

import React, { useMemo } from "react"
import { useTranslations, useLocale } from "next-intl"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, ClipboardList, TrendingUp, Package, AlertCircle, Calendar, Filter } from "lucide-react"
import { useAllProductionPlans, useAllProductAvailabilities } from "../hooks/useProductionPlanning"
import { formatNumber } from "@/lib/formatters"
import { format, parseISO } from "date-fns"
import { tr, enUS } from "date-fns/locale"
import { ProductionPlan, ProductDayAvailability, ProductionPlanLine } from "../types"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { useProductionStatusSocket } from "../hooks/useProductionStatusSocket"

interface ProductionStatusModalProps {
  isOpen: boolean
  onClose: () => void
  branchId: string
}

interface ProductionStatusItem extends ProductionPlanLine {
  target: number
  remaining: number | null
  sold: number
  status: 'ok' | 'warning' | 'critical'
  soldPercent: number
}

export function ProductionStatusModal({ isOpen, onClose, branchId }: ProductionStatusModalProps) {
  const t = useTranslations("production.statusModal")
  const locale = useLocale()
  const dateLocale = locale === "tr" ? tr : enUS
  const [selectedDate, setSelectedDate] = React.useState(() => format(new Date(), "yyyy-MM-dd"))
  const [selectedCategory, setSelectedCategory] = React.useState<string>("ALL")

  // WebSocket dinleyicisi
  useProductionStatusSocket(branchId, isOpen)

  // Global QueryClient staleTime (60s) bu ekranda eski satış/kalan değerlerini gösterir; modal her açılışta DB’den taze veri.
  const modalQueryOptions = {
    enabled: Boolean(isOpen && branchId),
    staleTime: 0,
    refetchOnMount: "always" as const,
  }

  const { data: plans = [], isLoading: isPlansLoading } = useAllProductionPlans(
    {
      branch_id: branchId,
      start_date: selectedDate,
      end_date: selectedDate,
    },
    {
      ...modalQueryOptions,
      refetchOnWindowFocus: true,
    }
  )

  const { data: availabilities = [], isLoading: isAvailLoading } = useAllProductAvailabilities(
    {
      branch_id: branchId,
      date: selectedDate,
    },
    {
      ...modalQueryOptions,
      refetchOnWindowFocus: true,
    }
  )

  const isLoading = isPlansLoading || isAvailLoading

  const activePlan = useMemo(() => {
    return plans.find((p: ProductionPlan) => p.status === "APPROVED") || plans[0]
  }, [plans])

  const statusData = useMemo(() => {
    if (!activePlan) return []

    const availList = availabilities

    const mapped = activePlan.lines.map((line: ProductionPlanLine) => {
      const avail = (availList as ProductDayAvailability[]).find((a: ProductDayAvailability) => a.product === line.product)

      const target = parseFloat(String(line.target_quantity || 0))
      let remaining = null
      let sold = 0
      let status: 'ok' | 'warning' | 'critical' = 'ok'

      if (avail) {
        if (avail.mode === 'LIMITED') {
          remaining = parseFloat(String(avail.remaining_portions || 0))
          sold = Math.max(0, target - remaining)
        } else if (avail.mode === 'SOLD_OUT') {
          remaining = 0
          sold = target
        }
      }

      const soldPercent = target > 0 ? (sold / target) * 100 : 0
      if (soldPercent >= 100) status = 'critical'
      else if (soldPercent >= 80) status = 'warning'

      return {
        ...line,
        target,
        remaining,
        sold,
        status,
        soldPercent
      }
    })

    // Ürün gruplarına (kategoriye) göre sırala
    const sorted = mapped.sort((a: ProductionStatusItem, b: ProductionStatusItem) => {
      const catA = a.category_name || ""
      const catB = b.category_name || ""
      if (catA < catB) return -1
      if (catA > catB) return 1
      return (a.product_name || "").localeCompare(b.product_name || "")
    })

    if (selectedCategory !== "ALL") {
      return sorted.filter((item: ProductionStatusItem) => item.category_name === selectedCategory)
    }
    return sorted
  }, [activePlan, availabilities, selectedCategory])

  const categories = useMemo(() => {
    if (!activePlan) return []
    const set = new Set<string>(activePlan.lines.map((l: ProductionPlanLine) => l.category_name || "Genel"))
    return Array.from(set).sort()
  }, [activePlan])

  const labelCategory = (name: string) =>
    name === "Genel" ? t("categoryFallback") : name

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent layout="scroll" size="4xl" className="max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-blue-100 p-1.5 text-blue-900 dark:bg-blue-900/50 dark:text-blue-100">
              <ClipboardList size={18} />
            </div>
            <div>
              <DialogTitle className="text-sm">{t("title")}</DialogTitle>
              <p className="text-xs text-muted-foreground">
                {format(parseISO(selectedDate), "d MMMM yyyy, EEEE", { locale: dateLocale })} • {activePlan?.branch_name || t("branchFallback")}
              </p>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
              <p className="text-muted-foreground font-medium">{t("loading")}</p>
            </div>
          ) : !activePlan ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
              <div className="rounded-full border border-border bg-background p-4">
                <AlertCircle className="h-12 w-12 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">{t("noPlanTitle")}</h3>
                <p className="text-muted-foreground max-w-xs mx-auto mt-2">
                  {t("noPlanBody")}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col lg:flex-row gap-4 mb-4 shrink-0">
                {/* Küçük Stat Kartları */}
                <div className="grid grid-cols-3 gap-3 flex-1">
                  <div className="bg-background p-3 rounded-xl border border-border flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-2xs font-bold mb-0.5">
                      <Package className="h-3 w-3 text-blue-500" />
                      {t("statProduct")}
                    </div>
                    <div className="text-xl font-bold text-foreground">{statusData.length}</div>
                  </div>
                  <div className="bg-background p-3 rounded-xl border border-border flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-2xs font-bold mb-0.5">
                      <TrendingUp className="h-3 w-3 text-emerald-500" />
                      {t("statCritical")}
                    </div>
                    <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
                      {statusData.filter((d: ProductionStatusItem) => d.status === 'warning').length}
                    </div>
                  </div>
                  <div className="bg-background p-3 rounded-xl border border-border flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-2xs font-bold mb-0.5">
                      <AlertCircle className="h-3 w-3 text-rose-500" />
                      {t("stat86")}
                    </div>
                    <div className="text-xl font-bold text-rose-600 dark:text-rose-400">
                      {statusData.filter((d: ProductionStatusItem) => d.status === 'critical').length}
                    </div>
                  </div>
                </div>

                {/* Filtre Alanı */}
                <div className="flex gap-3 bg-background p-3 rounded-xl border border-border lg:w-[500px]">
                  <div className="w-[140px]">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-2xs font-bold mb-1.5">
                      <Calendar className="h-3 w-3" /> {t("filterDate")}
                    </div>
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="h-8 border-none bg-transparent text-xs focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-2xs font-bold mb-1.5">
                      <Filter className="h-3 w-3" /> {t("filterCategory")}
                    </div>
                    <Select value={selectedCategory} onValueChange={(val) => setSelectedCategory(val || "ALL")}>
                      <SelectTrigger className="h-8 border-none bg-transparent text-xs focus-visible:ring-1 focus-visible:ring-ring">
                        <SelectValue>
                          {selectedCategory === "ALL" ? t("allGroups") : labelCategory(selectedCategory)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">{t("allGroups")}</SelectItem>
                        {categories.map((cat: string) => (
                          <SelectItem key={cat} value={cat}>{labelCategory(cat)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="bg-background rounded-xl border border-border overflow-hidden flex flex-col min-h-0">
                <div className="overflow-auto flex-1">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-muted">
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="text-left px-6 py-4 font-bold">{t("table.product")}</th>
                        <th className="text-right px-4 py-4 font-bold">{t("table.target")}</th>
                        <th className="text-right px-4 py-4 font-bold">{t("table.sold")}</th>
                        <th className="text-right px-4 py-4 font-bold">{t("table.remaining")}</th>
                        <th className="text-right px-6 py-4 font-bold">{t("table.status")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {statusData.map((item: ProductionStatusItem) => (
                        <tr key={item.id} className="group transition-colors hover:bg-muted/20">
                          <td className="px-6 py-4">
                            <div className="font-bold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {item.product_name}
                            </div>
                            <div className="flex items-center gap-2 text-2xs text-muted-foreground dark:text-muted-foreground mt-0.5">
                              <span className="bg-muted px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400 font-medium">
                                {labelCategory(item.category_name || "Genel")}
                              </span>
                              <span>•</span>
                              <span>{t("station")} {item.station_name || '-'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right font-semibold text-foreground">
                            {formatNumber(item.target, 0)}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className={item.sold > 0 ? "text-blue-600 dark:text-blue-400 font-bold" : "text-muted-foreground font-medium"}>
                              {formatNumber(item.sold, 0)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className={`font-bold ${item.remaining === 0 ? "text-rose-600 dark:text-rose-400" :
                              item.remaining !== null && item.remaining <= 5 ? "text-amber-600 dark:text-amber-400" :
                                "text-emerald-600 dark:text-emerald-400"
                              }`}>
                              {item.remaining !== null ? formatNumber(item.remaining, 0) : '∞'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {item.remaining !== null ? (
                              <div className="flex items-center gap-3 justify-end">
                                <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all duration-500 ${item.status === 'critical' ? 'bg-rose-500' :
                                      item.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
                                      }`}
                                    style={{ width: `${Math.min(100, item.soldPercent)}%` }}
                                  />
                                </div>
                                <span className="text-sub font-bold w-8 text-right text-muted-foreground">
                                  %{Math.round(item.soldPercent)}
                                </span>
                              </div>
                            ) : (
                              <div className="text-right text-2xs font-medium text-muted-foreground italic">
                                {t("noLimit")}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </DialogBody>

        <DialogFooter className="justify-center sm:justify-center">
          <Button onClick={onClose} variant="outline" className="min-w-[120px] font-medium">
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
