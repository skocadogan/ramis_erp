"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  CheckCircle,
  XCircle,
  Clock,
  CheckCheck,
  FileText,
  Trash2,
  Play,
} from "lucide-react"
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
import { StatusBadge } from "./StatusBadge"
import { DeficiencyTransferFulfilledLines } from "./DeficiencyTransferFulfilledLines"
import { cn } from "@/lib/utils"
import { formatDate, formatQuantityWithUnit } from "@/lib/formatters"
import type { DeficiencyReport } from "@/features/warehouse/types"
import {
  canDeleteDeficiencyReport,
  deficiencyReportHasTransferLineItems,
} from "@/features/warehouse/utils/deficiencyReportLineCount"
import {
  type DeficiencyAvailabilityRow,
  type DeficiencyItemAction,
  buildInitialItemActions,
  isDeficiencyActionAllowed,
  suggestDeficiencyItemAction,
} from "@/features/warehouse/utils/deficiencyItemActions"
import { useTranslations } from "next-intl"

interface Props {
  open: boolean
  report: DeficiencyReport | null
  availabilityData: DeficiencyAvailabilityRow[]
  isAvailabilityLoading: boolean
  deleteIsPending: boolean
  executeIsPending: boolean
  onClose: () => void
  onDelete: () => void
  onStartActions: (itemActions: Record<string, DeficiencyItemAction>) => void
}

const ACTION_OPTIONS: DeficiencyItemAction[] = [
  "PURCHASE_ALL",
  "PURCHASE_PARTIAL",
  "FULFILL_STOCK",
  "REJECT",
]

export function DeficiencyReportDetailModal({
  open,
  report,
  availabilityData,
  isAvailabilityLoading,
  deleteIsPending,
  executeIsPending,
  onClose,
  onDelete,
  onStartActions,
}: Props) {
  const t = useTranslations("warehouse")
  const canProcess =
    report &&
    (report.status === "PENDING" || report.status === "APPROVED") &&
    (report.items?.length ?? 0) > 0

  const itemIds = useMemo(
    () => (report?.items ?? []).map((i) => i.id),
    [report?.items],
  )

  const [itemActions, setItemActions] = useState<Record<string, DeficiencyItemAction>>({})

  // Kullanıcının manuel olarak değiştirdiği kalemleri takip eder.
  // Bu kalemler için availability her değiştiğinde default suggestion uygulanmaz.
  const userTouchedRef = useRef<Set<string>>(new Set())

  // (A) Rapor veya kalem listesi değiştiğinde: tüm kalemleri default'a ata ve
  //     "kullanıcı dokundu" setini sıfırla.
  //     availabilityData burada BİLİNÇLİ OLARAK dependency'de DEĞİLDİR:
  //     availability değişimleri effect (B) tarafından handle edilir.
  useEffect(() => {
    if (!canProcess) {
      setItemActions({})
      userTouchedRef.current = new Set()
      return
    }
    userTouchedRef.current = new Set()
    setItemActions(buildInitialItemActions(itemIds, availabilityData))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id, itemIds, canProcess])

  // (B) availability her değiştiğinde: kullanıcının değiştirmediği kalemler için
  //     default suggestion'ı güncelle. Böylece başka bir mutation sonucu
  //     availability invalidate olursa, kullanıcının seçimleri EZILMEZ.
  useEffect(() => {
    if (!canProcess) return
    const byId = new Map(availabilityData.map((a) => [a.item_id, a]))
    setItemActions((prev) => {
      const next = { ...prev }
      let changed = false
      for (const id of itemIds) {
        if (userTouchedRef.current.has(id)) continue
        const suggested = suggestDeficiencyItemAction(byId.get(id))
        if (next[id] !== suggested) {
          next[id] = suggested
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [availabilityData, itemIds, canProcess])

  const availById = useMemo(
    () => new Map(availabilityData.map((a) => [a.item_id, a])),
    [availabilityData],
  )

  const allItemsSelected = itemIds.length > 0 && itemIds.every((id) => itemActions[id])

  const actionLabel = (action: DeficiencyItemAction) => {
    switch (action) {
      case "PURCHASE_ALL":
        return t("deficiencyReports.actionPurchaseAll")
      case "PURCHASE_PARTIAL":
        return t("deficiencyReports.actionPurchasePartial")
      case "FULFILL_STOCK":
        return t("deficiencyReports.actionFulfillStock")
      case "REJECT":
        return t("deficiencyReports.actionReject")
      default:
        return action
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent layout="scroll" size="3xl" className="max-h-[85vh]">
        {report ? (
          <>
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>{report.report_number}</DialogTitle>
              <DialogDescription>
                {report.kitchen_station_name}
                {report.target_warehouse_name ? (
                  <span className="ml-1 text-muted-foreground">({report.target_warehouse_name})</span>
                ) : null}
              </DialogDescription>
            </div>
            <StatusBadge domain="deficiency" status={report.status} />
          </div>
        </DialogHeader>

      <DialogBody className="min-h-0 flex-1 space-y-5">
        <div className="grid grid-cols-2 gap-8 text-sm">
          <div className="space-y-4">
            <div className="flex flex-col gap-1">
              <span className="text-2xs font-ui-bold text-muted-foreground uppercase tracking-widest">
                {t("deficiencyReports.detailLabelCreated")}
              </span>
              <span className="text-foreground flex items-center gap-2">
                <Clock size={14} className="text-muted-foreground" />
                {formatDate(report.created_at)}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-2xs font-ui-bold text-muted-foreground uppercase tracking-widest">
                {t("deficiencyReports.detailLabelCreatedBy")}
              </span>
              <span className="text-foreground">{report.created_by_name || "—"}</span>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex flex-col gap-1">
              <span className="text-2xs font-ui-bold text-muted-foreground uppercase tracking-widest">
                {t("deficiencyReports.detailLabelApprovedOrCancel")}
              </span>
              <span className="text-foreground flex items-center gap-2">
                {report.approved_at ? (
                  <>
                    <CheckCheck size={14} className="text-emerald-500" /> {formatDate(report.approved_at)}
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-2xs font-ui-bold text-muted-foreground uppercase tracking-widest">
                {t("deficiencyReports.detailLabelActor")}
              </span>
              <span className="text-foreground">{report.approved_by_name || "—"}</span>
            </div>
          </div>
        </div>

        {report.notes && (
          <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100/50 dark:border-amber-900/20 text-sm italic text-muted-foreground">
            <FileText size={16} className="inline mr-2 text-amber-500" />
            &ldquo;{report.notes}&rdquo;
          </div>
        )}

        <div className="space-y-3">
          <h3 className="text-ui font-ui-bold uppercase tracking-[0.2em] text-foreground">
            {t("deficiencyReports.detailMaterialsTitle")}
          </h3>
          {(report.items?.length ?? 0) > 0 ? (
            <div className="flex max-h-[min(360px,42vh)] flex-col overflow-hidden rounded-2xl border border-border bg-background">
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 border-b border-border bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
                    <tr>
                      <th className="text-left px-4 py-3 font-ui-bold text-muted-foreground text-xs uppercase">
                        {t("deficiencyReports.detailColProduct")}
                      </th>
                      <th className="text-left px-4 py-3 font-ui-bold text-muted-foreground text-xs uppercase">
                        {t("deficiencyReports.detailColStockStatus")}
                      </th>
                      <th className="text-right px-4 py-3 font-ui-bold text-muted-foreground text-xs uppercase">
                        {t("deficiencyReports.detailColMinimum")}
                      </th>
                      {canProcess ? (
                        <th className="text-left px-4 py-3 font-ui-bold text-muted-foreground text-xs uppercase min-w-[12rem]">
                          {t("deficiencyReports.detailColAction")}
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.items!.map((item) => {
                      const avail = availById.get(item.id)
                      const useBranchAvailability = canProcess && !!avail
                      const hasTargetLevel = item.current_stock != null
                      const selectedAction = itemActions[item.id]

                      return (
                        <tr key={item.id} className="bg-background hover:bg-muted/20">
                          <td className="px-4 py-3 align-top">
                            <div className="flex flex-col">
                              <span className="text-foreground">{item.stock_item_name}</span>
                              {item.notes && (
                                <span className="text-xs text-muted-foreground italic mt-0.5">{item.notes}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            {isAvailabilityLoading && canProcess ? (
                              <span className="text-xs text-muted-foreground">
                                {t("deficiencyReports.detailAvailabilityQuerying")}
                              </span>
                            ) : useBranchAvailability && avail ? (
                              avail.can_fully_fulfill ? (
                                <span className="inline-flex items-center gap-1 text-xs font-ui-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
                                  <CheckCircle size={12} />{" "}
                                  {t("deficiencyReports.detailInStock", {
                                    qty: formatQuantityWithUnit(avail.total_available, item.unit),
                                  })}
                                </span>
                              ) : avail.can_partially_fulfill ? (
                                <span className="inline-flex items-center gap-1 text-2xs font-ui-bold text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                                  <Clock size={10} />{" "}
                                  {t("deficiencyReports.detailPartialStock", {
                                    qty: formatQuantityWithUnit(avail.total_available, item.unit),
                                  })}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-2xs font-ui-bold text-rose-600 bg-rose-50 dark:bg-rose-900/20 px-2 py-0.5 rounded-full">
                                  <XCircle size={10} /> {t("deficiencyReports.detailOutOfStock")}
                                </span>
                              )
                            ) : hasTargetLevel ? (
                              <span
                                className={cn(
                                  "inline-flex flex-col gap-0.5 text-sub font-ui-semibold px-2 py-0.5 rounded-lg",
                                  item.is_low_stock
                                    ? "text-amber-800 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-200"
                                    : "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-200",
                                )}
                              >
                                <span>
                                  {t("deficiencyReports.detailCurrent", {
                                    qty: formatQuantityWithUnit(item.current_stock!, item.unit),
                                  })}
                                </span>
                              </span>
                            ) : (
                              <span className="text-2xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-ui-bold text-foreground align-top">
                            {formatQuantityWithUnit(item.quantity, item.unit)}
                          </td>
                          {canProcess ? (
                            <td className="px-4 py-3 align-top">
                              <select
                                value={selectedAction ?? ""}
                                onChange={(e) => {
                                  // Kullanıcı bu kalemi manuel değiştirdi: artık
                                  // availability değişiminde suggestion ezilmesin.
                                  userTouchedRef.current.add(item.id)
                                  setItemActions((prev) => ({
                                    ...prev,
                                    [item.id]: e.target.value as DeficiencyItemAction,
                                  }))
                                }}
                                className="w-full min-w-[11rem] rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                              >
                                {ACTION_OPTIONS.map((opt) => (
                                  <option
                                    key={opt}
                                    value={opt}
                                    disabled={!isDeficiencyActionAllowed(opt, avail)}
                                  >
                                    {actionLabel(opt)}
                                  </option>
                                ))}
                              </select>
                            </td>
                          ) : null}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {report.transfers && deficiencyReportHasTransferLineItems(report) ? (
            <DeficiencyTransferFulfilledLines transfers={report.transfers} variant="warehouse" />
          ) : null}

          {(report.items?.length ?? 0) === 0 && !deficiencyReportHasTransferLineItems(report) ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              {t("deficiencyReports.detailNoItemsHint")}
            </p>
          ) : null}
        </div>
      </DialogBody>

      <DialogFooter>
        <div className="flex flex-wrap items-center gap-2 sm:mr-auto">
          {canProcess && (
            <Button
              type="button"
              onClick={() => onStartActions(itemActions)}
              disabled={
                executeIsPending ||
                isAvailabilityLoading ||
                !allItemsSelected ||
                availabilityData.length === 0
              }
            >
              <Play size={16} />
              {executeIsPending
                ? t("deficiencyReports.actionStartPending")
                : t("deficiencyReports.actionStart")}
            </Button>
          )}
          {canDeleteDeficiencyReport(report) && (
            <Button type="button" variant="destructive" onClick={onDelete} disabled={deleteIsPending}>
              <Trash2 size={16} />
              {t("deficiencyReports.detailDeleteButton")}
            </Button>
          )}
        </div>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("deficiencyReports.detailCloseButton")}
        </Button>
      </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
