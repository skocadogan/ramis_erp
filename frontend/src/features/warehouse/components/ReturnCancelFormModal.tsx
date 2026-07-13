"use client"

import React, { useMemo, useState } from "react"
import { isAxiosError } from "axios"
import { Loader2, Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import StockItemSelect from "@/features/inventory/components/StockItemSelect"
import { usePurchaseOrders } from "@/features/warehouse/hooks/useWarehouse"
import {
  filterReturnCancelPurchaseOrders,
  findPoLine,
  formatReturnCancelPoOption,
} from "@/features/warehouse/utils/returnCancelPurchaseOrder"
import {
  useCreateReturnCancelMovement,
  useReturnCancelReasonCodes,
} from "@/features/warehouse/hooks/useReturnCancelMovements"

const RETURN_CANCEL_PO_FILTERS = (warehouseId: string, stockItemId: string) => ({
  warehouse_id: warehouseId,
  stock_item_id: stockItemId,
})

type Props = {
  open: boolean
  defaultWarehouseId?: string
  onClose: () => void
}

export function ReturnCancelFormModal({ open, defaultWarehouseId, onClose }: Props) {
  const t = useTranslations("warehouse_return_cancel")
  const { data: reasonCodes = [] } = useReturnCancelReasonCodes()
  const createMutation = useCreateReturnCancelMovement()

  const [stockItemId, setStockItemId] = useState("")
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId || "")
  const [purchaseOrderId, setPurchaseOrderId] = useState("")
  const [movementType, setMovementType] = useState<"RETURN" | "CANCEL">("RETURN")
  const [quantity, setQuantity] = useState("")
  const [unit, setUnit] = useState("")
  const [unitPrice, setUnitPrice] = useState("")
  const [reasonCode, setReasonCode] = useState("EXPIRED")
  const [supplierId, setSupplierId] = useState("")
  const [notes, setNotes] = useState("")

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliersPicker"],
    queryFn: () => inventoryApi.getSuppliers(),
  })
  const { data: warehousesResp } = useQuery({
    queryKey: ["warehousesPicker"],
    queryFn: async () => {
      const apiMod = (await import("@/features/warehouse/services/warehouseApi")).warehouseApi
      const res = await apiMod.getWarehouses()
      return res.data as { results?: Array<{ id: string; name: string }> }
    },
  })
  const warehouses = warehousesResp?.results || []

  const purchaseOrderFilters = useMemo(
    () => (warehouseId && stockItemId ? RETURN_CANCEL_PO_FILTERS(warehouseId, stockItemId) : undefined),
    [warehouseId, stockItemId],
  )

  const { data: purchaseOrdersRaw = [], isLoading: purchaseOrdersLoading } = usePurchaseOrders(
    purchaseOrderFilters,
    { enabled: Boolean(purchaseOrderFilters) },
  )

  const purchaseOrders = useMemo(
    () => (stockItemId ? filterReturnCancelPurchaseOrders(purchaseOrdersRaw, stockItemId) : []),
    [purchaseOrdersRaw, stockItemId],
  )

  const resetPurchaseSelection = () => {
    setPurchaseOrderId("")
    setUnitPrice("")
    setSupplierId("")
  }

  const handlePurchaseOrderSelect = (poId: string) => {
    setPurchaseOrderId(poId)
    const po = purchaseOrders.find((p) => p.id === poId)
    if (!po) return
    const line = findPoLine(po, stockItemId)
    if (line) {
      setUnitPrice(String(line.unit_price ?? ""))
      if (line.unit) setUnit(line.unit)
    }
    if (po.supplier) setSupplierId(po.supplier)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = Number(quantity.replace(",", "."))
    if (!stockItemId || !warehouseId || !purchaseOrderId || !Number.isFinite(q) || q <= 0) {
      toast.error(t("createFailed"))
      return
    }
    createMutation.mutate(
      {
        stock_item_id: stockItemId,
        warehouse_id: warehouseId,
        movement_type: movementType,
        quantity: q,
        unit: unit || undefined,
        unit_price: Number(unitPrice.replace(",", ".")) || 0,
        reference: reasonCode,
        notes: notes.trim() || undefined,
        supplier_id: supplierId || undefined,
        purchase_order_id: purchaseOrderId,
      },
      {
        onSuccess: () => {
          toast.success(t("createSuccess"))
          onClose()
        },
        onError: (err) => {
          const data = isAxiosError(err)
            ? (err.response?.data as { error?: string; purchase_order_id?: string[] } | undefined)
            : undefined
          const msg = data?.purchase_order_id?.[0] ?? data?.error ?? t("createFailed")
          toast.error(msg)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent layout="scroll" size="lg">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
        </DialogHeader>

        <form id="return-cancel-form" onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("formWarehouse")}
              </label>
              <select
                value={warehouseId}
                onChange={(e) => {
                  setWarehouseId(e.target.value)
                  setStockItemId("")
                  setUnit("")
                  resetPurchaseSelection()
                }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                required
              >
                <option value="">—</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("formStockItem")}
              </label>
              <StockItemSelect
                value={stockItemId}
                warehouseId={warehouseId || undefined}
                disabled={!warehouseId}
                onSelect={(item) => {
                  setStockItemId(item.id)
                  setUnit(item.unit || "")
                  resetPurchaseSelection()
                }}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("formPurchaseOrder")}
              </label>
              <select
                value={purchaseOrderId}
                onChange={(e) => handlePurchaseOrderSelect(e.target.value)}
                disabled={!stockItemId || purchaseOrdersLoading}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
                required
              >
                <option value="">
                  {purchaseOrdersLoading
                    ? t("formPurchaseOrderLoading")
                    : purchaseOrders.length
                      ? t("formPurchaseOrderPlaceholder")
                      : t("formPurchaseOrderEmpty")}
                </option>
                {purchaseOrders.map((po) => (
                  <option key={po.id} value={po.id}>
                    {formatReturnCancelPoOption(po, stockItemId)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {t("formMovementType")}
                </label>
                <select
                  value={movementType}
                  onChange={(e) => setMovementType(e.target.value as "RETURN" | "CANCEL")}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="RETURN">{t("movementTypeReturn")}</option>
                  <option value="CANCEL">{t("movementTypeCancel")}</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {t("formReason")}
                </label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  {reasonCodes.map((r) => (
                    <option key={r.code} value={r.code}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {t("formQuantity")}
                </label>
                <input
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  inputMode="decimal"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {t("formUnit")}
                </label>
                <input value={unit} readOnly className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("formUnitPrice")}
              </label>
              <input
                value={unitPrice}
                readOnly
                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm"
                placeholder={t("formUnitPricePlaceholder")}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("formSupplier")}
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("formNotes")}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder={t("formNotesPlaceholder")}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("formCancel")}
            </Button>
            <Button type="submit" form="return-cancel-form" disabled={createMutation.isPending || !purchaseOrderId}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus size={16} />}
              {t("formSave")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
