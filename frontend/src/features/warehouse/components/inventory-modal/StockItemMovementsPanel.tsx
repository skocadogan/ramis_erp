"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"
import type { StockMovement } from "@/features/inventory/types"
import { formatDate, formatQuantityWithUnit } from "@/lib/formatters"
import {
  formatStockMovementReference,
  formatStockMovementQuantitySign,
  getStockMovementSignedQuantity,
  getStockMovementTypeLabel,
  stockMovementQuantityTextClass,
} from "@/lib/stockMovementDisplay"
import { fetchAllStockMovementsForItem } from "./fetchStockMovements"
import { movementTypeClass } from "./movementTypeClass"

export function StockItemMovementsPanel({
  stockItemId,
  warehouseId,
}: {
  stockItemId: string
  warehouseId: string
}) {
  const t = useTranslations("warehouse.inventoryModal")
  const tReason = useTranslations("inventory.returnCancelReason")
  const [onlyThisWarehouse, setOnlyThisWarehouse] = useState(true)

  const movementTypeLabel = (mt: StockMovement["movement_type"]) =>
    getStockMovementTypeLabel(mt, (key) => t(`movementType.${key}`))

  const { data: movements = [], isLoading, isError } = useQuery({
    queryKey: ["warehouse-stock-item-movements", stockItemId],
    queryFn: () => fetchAllStockMovementsForItem(stockItemId),
    enabled: !!stockItemId,
  })

  const filtered = useMemo(() => {
    if (!onlyThisWarehouse) return movements
    return movements.filter((m) => (m.warehouse ?? m.warehouse_id) === warehouseId)
  }, [movements, onlyThisWarehouse, warehouseId])

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-slate-50/80 px-4 py-8 text-center text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-800/40">
        {t("movements.loading")}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50/80 px-4 py-6 text-center text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
        {t("movements.loadError")}
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/30">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={onlyThisWarehouse}
          onChange={(e) => setOnlyThisWarehouse(e.target.checked)}
        />
        {t("movements.onlyThisWarehouse")}
      </label>
      <p className="text-xs text-muted-foreground">{t("movements.filterHint")}</p>
      <div className="max-h-72 overflow-auto rounded-md border border-border/80 dark:border-slate-700">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/80">
            <tr>
              <th className="px-2 py-2 text-left font-ui-semibold text-muted-foreground">{t("movements.colDate")}</th>
              <th className="px-2 py-2 text-left font-ui-semibold text-muted-foreground">{t("movements.colWarehouse")}</th>
              <th className="px-2 py-2 text-left font-ui-semibold text-muted-foreground">{t("movements.colType")}</th>
              <th className="px-2 py-2 text-right font-ui-semibold text-muted-foreground">{t("movements.colQty")}</th>
              <th className="px-2 py-2 text-left font-ui-semibold text-muted-foreground">{t("movements.colReference")}</th>
              <th className="px-2 py-2 text-left font-ui-semibold text-muted-foreground">{t("movements.colPerformedBy")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">
                  {t("movements.empty")}
                </td>
              </tr>
            ) : (
              filtered.map((m) => (
                <tr key={m.id} className="hover:bg-white/60 dark:hover:bg-slate-900/40">
                  <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{formatDate(m.created_at)}</td>
                  <td className="px-2 py-2 text-foreground">{m.warehouse_name ?? "—"}</td>
                  <td className="px-2 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 font-ui-medium ${movementTypeClass(m.movement_type)}`}>
                      {movementTypeLabel(m.movement_type)}
                    </span>
                  </td>
                  <td
                    className={`px-2 py-2 text-right font-ui-semibold ${stockMovementQuantityTextClass(m)}`}
                  >
                    {formatStockMovementQuantitySign(m)}
                    {formatQuantityWithUnit(Math.abs(getStockMovementSignedQuantity(m)), m.unit)}
                  </td>
                  <td className="max-w-[140px] truncate px-2 py-2 text-muted-foreground">
                    {formatStockMovementReference(m.reference, m.notes, (key) => tReason(key))}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">{m.performed_by_name ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
