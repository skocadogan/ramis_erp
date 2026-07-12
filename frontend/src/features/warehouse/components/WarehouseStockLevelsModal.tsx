"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, Save } from "lucide-react"
import { warehouseApi } from "@/features/warehouse/services/warehouseApi"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useSetWarehouseStockMinimum } from "@/features/warehouse/hooks/useWarehouseActions"
import { formatQuantityWithUnit } from "@/lib/formatters"

type StockLevel = {
  id: string
  stock_item: string
  stock_item_name: string
  stock_item_sku: string
  stock_item_unit: string
  quantity: string
  minimum_quantity: string
  is_low_stock: boolean
}

export function WarehouseStockLevelsModal({
  open,
  warehouseId,
  warehouseName,
  onClose,
}: {
  open: boolean
  warehouseId: string
  warehouseName: string
  onClose: () => void
}) {
  const t = useTranslations("warehouse.stockLevelsModal")
  const [lowOnly, setLowOnly] = useState(true)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const setMinMut = useSetWarehouseStockMinimum()

  const { data: levels = [], isLoading } = useQuery<StockLevel[]>({
    queryKey: ["warehouse-stock-levels", warehouseId, lowOnly],
    queryFn: async () => {
      const res = await warehouseApi.getWarehouseStockLevels(warehouseId, { low_stock: lowOnly })
      return res.data.results ?? res.data
    },
    enabled: !!warehouseId && open,
  })

  const rows = useMemo(() => {
    return levels.slice().sort((a, b) => (a.is_low_stock === b.is_low_stock ? 0 : a.is_low_stock ? -1 : 1))
  }, [levels])

  const saveRow = async (row: StockLevel) => {
    const minVal = edits[row.stock_item] ?? row.minimum_quantity
    await setMinMut.mutateAsync({
      warehouseId,
      stock_item_id: row.stock_item,
      minimum_quantity: minVal,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent layout="scroll" size="3xl" className="max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{warehouseName}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
            {t("lowOnlyLabel")}
          </label>

          <div className="rounded-xl border border-border/80 overflow-hidden bg-background">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-background">
                    <th className="text-left px-4 py-3 font-ui-semibold text-muted-foreground">{t("colStock")}</th>
                    <th className="text-right px-4 py-3 font-ui-semibold text-muted-foreground">{t("colCurrent")}</th>
                    <th className="text-right px-4 py-3 font-ui-semibold text-muted-foreground">{t("colMinimum")}</th>
                    <th className="text-center px-4 py-3 font-ui-semibold text-muted-foreground">{t("colAction")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    <tr>
                      <td colSpan={4} className="text-center py-12 text-muted-foreground">
                        {t("loading")}
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-12 text-muted-foreground">
                        {t("empty")}
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id} className="hover:bg-background transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {r.is_low_stock ? <AlertTriangle className="text-amber-600" size={16} /> : null}
                            <div>
                              <div className="font-ui-medium text-foreground">{r.stock_item_name}</div>
                              <div className="text-xs text-muted-foreground">{r.stock_item_sku}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-foreground">
                          {formatQuantityWithUnit(r.quantity, r.stock_item_unit)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            inputMode="decimal"
                            min={-1}
                            step="0.001"
                            value={edits[r.stock_item] ?? r.minimum_quantity}
                            onChange={(e) => setEdits((p) => ({ ...p, [r.stock_item]: e.target.value }))}
                            className="w-28 text-right px-2 py-1 rounded-md border border-border bg-background text-sm outline-none"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => saveRow(r)}
                            disabled={setMinMut.isPending}
                          >
                            <Save size={14} />
                            {t("save")}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
