"use client"

import { Loader2 } from "lucide-react"
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
import { formatQuantityWithUnit } from "@/lib/formatters"
import type { DeficiencyActionPlanSummary } from "@/features/warehouse/utils/deficiencyItemActions"
import { useTranslations } from "next-intl"

interface Props {
  open: boolean
  summary: DeficiencyActionPlanSummary | null
  supplierId: string
  setSupplierId: (v: string) => void
  warehouseId: string
  setWarehouseId: (v: string) => void
  suppliers: { id: string; name: string }[]
  warehouses: { id: string; name: string }[]
  isPending: boolean
  onClose: () => void
  onConfirm: () => void
  actionLabel: (action: string) => string
}

export function DeficiencyActionConfirmModal({
  open,
  summary,
  supplierId,
  setSupplierId,
  warehouseId,
  setWarehouseId,
  suppliers,
  warehouses,
  isPending,
  onClose,
  onConfirm,
  actionLabel,
}: Props) {
  const t = useTranslations("warehouse")

  const canConfirm = summary && (!summary.requires_purchase_config || (!!supplierId && !!warehouseId))

  return (
    <Dialog open={open && !!summary} onOpenChange={(v) => !v && onClose()}>
      <DialogContent layout="scroll" size="lg" className="max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{t("deficiencyReports.actionConfirmTitle")}</DialogTitle>
          <DialogDescription>{summary?.report_number}</DialogDescription>
        </DialogHeader>

        {summary ? (
          <>
            <DialogBody className="space-y-4 text-sm">
              <p className="text-muted-foreground">{t("deficiencyReports.actionConfirmIntro")}</p>

              {summary.transfers.length > 0 ? (
                <section>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {t("deficiencyReports.actionConfirmTransfers")}
                  </h4>
                  <ul className="space-y-2">
                    {summary.transfers.map((tr, idx) => (
                      <li key={idx} className="rounded-xl border border-border bg-background p-3">
                        <div className="font-semibold text-foreground">{tr.source_warehouse_name}</div>
                        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          {tr.items.map((it, i) => (
                            <li key={i}>
                              {it.stock_item_name} — {formatQuantityWithUnit(it.quantity, it.unit)}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {summary.purchases.length > 0 ? (
                <section>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {t("deficiencyReports.actionConfirmPurchases")}
                  </h4>
                  <ul className="mb-3 space-y-1 text-xs text-muted-foreground">
                    {summary.purchases.map((p, i) => (
                      <li key={i}>
                        {p.stock_item_name} — {formatQuantityWithUnit(p.quantity, p.unit)}
                      </li>
                    ))}
                  </ul>
                  <div className="grid gap-3">
                    <div>
                      <label className="mb-1 block text-2xs font-bold uppercase tracking-widest text-muted-foreground">
                        {t("deficiencyReports.labelSupplier")}
                      </label>
                      <select
                        value={supplierId}
                        onChange={(e) => setSupplierId(e.target.value)}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                      >
                        <option value="">{t("purchaseOrders.selectPlaceholder")}</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-2xs font-bold uppercase tracking-widest text-muted-foreground">
                        {t("deficiencyReports.labelTargetWarehouse")}
                      </label>
                      <select
                        value={warehouseId}
                        onChange={(e) => setWarehouseId(e.target.value)}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                      >
                        <option value="">{t("purchaseOrders.selectPlaceholder")}</option>
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>
              ) : null}

              {summary.rejected.length > 0 ? (
                <section>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {t("deficiencyReports.actionConfirmRejected")}
                  </h4>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {summary.rejected.map((r, i) => (
                      <li key={i}>{r.stock_item_name}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {t("deficiencyReports.actionConfirmLines")}
                </h4>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                  {summary.lines.map((line) => (
                    <li key={line.item_id} className="flex justify-between gap-2 border-b border-border/60 py-1">
                      <span className="text-foreground">{line.stock_item_name}</span>
                      <span className="shrink-0 text-muted-foreground">{actionLabel(line.action)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                {t("warehouseForm.cancel")}
              </Button>
              <Button type="button" onClick={onConfirm} disabled={isPending || !canConfirm}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 inline size-4 animate-spin" />
                    {t("deficiencyReports.actionConfirmPending")}
                  </>
                ) : (
                  t("deficiencyReports.actionConfirmApprove")
                )}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
