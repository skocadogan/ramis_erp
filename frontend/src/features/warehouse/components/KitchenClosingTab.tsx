"use client"

import { useMemo, useState } from "react"
import { ChefHat, Save } from "lucide-react"
import { useKitchenClosingItems, useSubmitKitchenClosing, useWarehouses } from "@/features/warehouse/hooks/useWarehouse"
import { formatQuantityWithUnit, formatQuantity } from "@/lib/formatters"
import { formatKitchenClosingNotes } from "@/features/warehouse/utils/kitchenClosingDisplay"
import { useQuery } from "@tanstack/react-query"
import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import { format } from "date-fns"
import { useTranslations } from "next-intl"

export function KitchenClosingTab({ branchId }: { branchId?: string }) {
  const t = useTranslations("warehouse")
  const { data: warehouses = [], isLoading: warehousesLoading } = useWarehouses(branchId)
  const kitchenWarehouses = useMemo(
    () => warehouses.filter((w) => w.warehouse_type === "KITCHEN"),
    [warehouses]
  )
  const otherWarehouses = useMemo(
    () => warehouses.filter((w) => w.warehouse_type !== "KITCHEN"),
    [warehouses]
  )

  const [warehouseId, setWarehouseId] = useState<string>("")
  const { data: items = [], isLoading } = useKitchenClosingItems(warehouseId || undefined)
  const submitMut = useSubmitKitchenClosing()

  const [counts, setCounts] = useState<Record<string, string>>({})

  // Fetch previous closing records (Waste movements with reference="Gün Sonu Kapanış Sayımı")
  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ["kitchenClosingHistory", warehouseId],
    queryFn: () =>
      inventoryApi.getStockMovements({
        movement_type: "WASTE",
        warehouse_id: warehouseId || undefined,
        search: "Gün Sonu Kapanış",
        page_size: 50,
      }),
    enabled: !!warehouseId,
    refetchOnMount: "always",
  })

  const handleSubmit = async () => {
    if (!warehouseId) return
    const payloadItems = items.map((i) => ({
      stock_item_id: i.stock_item_id,
      counted_quantity: Number(
        counts[i.stock_item_id] !== undefined && counts[i.stock_item_id] !== ""
          ? counts[i.stock_item_id]
          : i.theoretical_quantity ?? 0
      ),
    }))
    await submitMut.mutateAsync({ warehouse_id: warehouseId, items: payloadItems })
    setCounts({})
    refetchHistory()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-foreground">
          <ChefHat size={18} />
          <span className="text-sm font-ui-semibold">{t("kitchenClosing.title")}</span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            disabled={warehousesLoading || warehouses.length === 0}
            className="min-w-[14rem] max-w-[22rem] px-3 py-2 rounded-lg border border-border bg-card text-sm outline-none disabled:opacity-60"
          >
            <option value="">
              {warehousesLoading
                ? t("kitchenClosing.optLoadingWarehouses")
                : warehouses.length === 0
                  ? t("kitchenClosing.optNoWarehouses")
                  : t("kitchenClosing.optSelectWarehouse")}
            </option>
            {kitchenWarehouses.length > 0 ? (
              <optgroup label={t("kitchenClosing.optgroupKitchen")}>
                {kitchenWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </optgroup>
            ) : null}
            {otherWarehouses.length > 0 ? (
              <optgroup
                label={
                  kitchenWarehouses.length > 0
                    ? t("kitchenClosing.optgroupOtherWithKitchen")
                    : t("kitchenClosing.optgroupBranches")
                }
              >
                {otherWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code}) — {t(`warehouseTypeShort.${w.warehouse_type}`)}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!warehouseId || submitMut.isPending || items.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-ui-medium hover:bg-orange-700 disabled:opacity-60 disabled:hover:bg-orange-600 transition-colors shadow-sm"
          >
            <Save size={16} />
            <span>{t("kitchenClosing.save")}</span>
          </button>
        </div>
      </div>

      {!branchId ? (
        <p className="text-xs text-amber-700 dark:text-amber-400/90 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          {t("kitchenClosing.branchFilterHint")}
        </p>
      ) : null}

      {!warehousesLoading && warehouses.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("kitchenClosing.noWarehouseForView")}</p>
      ) : null}

      <div className="rounded-xl border border-border/80 dark:border-slate-800 overflow-hidden bg-card/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50">
                <th className="text-left px-4 py-3 font-ui-semibold text-muted-foreground">{t("kitchenClosing.colStock")}</th>
                <th className="text-right px-4 py-3 font-ui-semibold text-muted-foreground">{t("kitchenClosing.colTheoretical")}</th>
                <th className="text-right px-4 py-3 font-ui-semibold text-muted-foreground">{t("kitchenClosing.colCounted")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="text-center py-12 text-muted-foreground">
                    {t("kitchenClosing.loadingTable")}
                  </td>
                </tr>
              ) : !warehouseId ? (
                <tr>
                  <td colSpan={3} className="text-center py-12 text-muted-foreground">
                    {t("kitchenClosing.selectWarehouseHint")}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-12 text-muted-foreground">
                    {t("kitchenClosing.noMovementsToday")}
                  </td>
                </tr>
              ) : (
                items.map((i) => (
                  <tr key={i.stock_item_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-ui-medium text-slate-900 dark:text-slate-200">{i.stock_item_name}</div>
                      <div className="text-xs text-muted-foreground">{i.stock_item_sku}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">
                      {formatQuantityWithUnit(i.theoretical_quantity, i.unit)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.001"
                        value={counts[i.stock_item_id] ?? ""}
                        onChange={(e) =>
                          setCounts((prev) => ({
                            ...prev,
                            [i.stock_item_id]: e.target.value,
                          }))
                        }
                        placeholder={formatQuantity(i.theoretical_quantity)}
                        className="w-28 text-right px-2 py-1 rounded-md border border-border bg-card text-sm outline-none"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* History Table */}
      {warehouseId && (
        <div className="mt-8 space-y-4">
          <div className="flex items-center gap-2 text-foreground">
            <span className="text-sm font-ui-semibold">{t("kitchenClosing.historySectionTitle")}</span>
          </div>
          <div className="rounded-xl border border-border/80 dark:border-slate-800 overflow-hidden bg-card/50">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <th className="text-left px-4 py-3 font-ui-semibold text-muted-foreground">{t("kitchenClosing.historyColDate")}</th>
                    <th className="text-left px-4 py-3 font-ui-semibold text-muted-foreground">{t("kitchenClosing.historyColStock")}</th>
                    <th className="text-right px-4 py-3 font-ui-semibold text-muted-foreground">{t("kitchenClosing.historyColWasteQty")}</th>
                    <th className="text-left px-4 py-3 font-ui-semibold text-muted-foreground">{t("kitchenClosing.historyColNotes")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {historyLoading ? (
                    <tr>
                      <td colSpan={4} className="text-center py-6 text-muted-foreground">{t("kitchenClosing.loadingTable")}</td>
                    </tr>
                  ) : historyData?.results && historyData.results.length > 0 ? (
                    historyData.results.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {format(new Date(m.created_at), "dd.MM.yyyy HH:mm")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-ui-medium text-slate-900 dark:text-slate-200">{m.stock_item_name}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-ui-medium text-red-600">
                          {formatQuantityWithUnit(m.quantity, m.unit)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatKitchenClosingNotes(m.notes) || m.reference || "-"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="text-center py-6 text-muted-foreground">{t("kitchenClosing.historyEmpty")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

