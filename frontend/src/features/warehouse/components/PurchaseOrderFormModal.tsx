"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { useDirtyFormWarning } from "@/hooks/useDirtyFormWarning"
import { useWarehouses, useSuppliers } from "@/features/warehouse/hooks/useWarehouse"
import StockItemSelect from "@/features/inventory/components/StockItemSelect"
import type { StockItem } from "@/features/inventory/types"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { newClientId } from "@/lib/clientId"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { formatAmount } from "@/lib/formatters"
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts"
import type { PurchaseOrder } from "@/features/warehouse/types"

interface PurchaseOrderFormModalProps {
  open: boolean
  /** Doluysa taslak / onay bekleyen sipariş düzenleme modu. */
  initialOrder?: PurchaseOrder | null
  branchId?: string
  onSave: (data: Record<string, unknown>) => Promise<void>
  onClose: () => void
  isLoading?: boolean
}

interface ItemRow {
  rowKey: string
  stock_item_id: string
  quantity: string
  unit: string
  unit_price: string
  notes: string
  prefetchedLabel?: { id: string; name: string; sku: string } | null
}

type FormState = {
  supplier_id: string
  warehouse_id: string
  order_date: string
  expected_date: string
  notes: string
}

const emptyItemRow = (): ItemRow => ({
  rowKey: newClientId("po-row"),
  stock_item_id: "",
  quantity: "",
  unit: "",
  unit_price: "",
  notes: "",
})

function todayIsoDate() {
  return new Date().toISOString().split("T")[0]
}

function buildFormState(initialOrder?: PurchaseOrder | null): { form: FormState; items: ItemRow[] } {
  if (initialOrder) {
    return {
      form: {
        supplier_id: initialOrder.supplier,
        warehouse_id: initialOrder.warehouse,
        order_date: initialOrder.order_date.slice(0, 10),
        expected_date: initialOrder.expected_date ? initialOrder.expected_date.slice(0, 10) : "",
        notes: initialOrder.notes ?? "",
      },
      items: initialOrder.items?.length
        ? initialOrder.items.map((it) => ({
            rowKey: it.id || newClientId("po-row"),
            stock_item_id: it.stock_item,
            quantity: String(it.quantity),
            unit: it.unit,
            unit_price: String(it.unit_price),
            notes: it.notes ?? "",
            prefetchedLabel: it.stock_item_name
              ? {
                  id: it.stock_item,
                  name: it.stock_item_name,
                  sku: it.stock_item_sku ?? "",
                }
              : null,
          }))
        : [emptyItemRow()],
    }
  }

  return {
    form: {
      supplier_id: "",
      warehouse_id: "",
      order_date: todayIsoDate(),
      expected_date: "",
      notes: "",
    },
    items: [emptyItemRow()],
  }
}

const fieldInputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"

export function PurchaseOrderFormModal({
  open,
  initialOrder = null,
  branchId,
  onSave,
  onClose,
  isLoading,
}: PurchaseOrderFormModalProps) {
  const t = useTranslations("warehouse")
  const canViewAmounts = useCanViewAmounts()
  const { data: warehouses = [] } = useWarehouses(branchId)
  const { data: suppliers = [] } = useSuppliers()
  const isEdit = !!initialOrder

  const [form, setForm] = useState<FormState>(() => buildFormState(initialOrder).form)
  const [items, setItems] = useState<ItemRow[]>(() => buildFormState(initialOrder).items)

  useEffect(() => {
    if (!open) return
    const next = buildFormState(initialOrder)
    setForm(next.form)
    setItems(next.items)
  }, [open, initialOrder])

  const addItem = () => setItems((prev) => [...prev, emptyItemRow()])
  const removeItem = (rowKey: string) => setItems((prev) => prev.filter((row) => row.rowKey !== rowKey))

  const updateItem = (rowKey: string, field: keyof Omit<ItemRow, "rowKey">, value: string) => {
    setItems((prev) =>
      prev.map((row) => (row.rowKey === rowKey ? { ...row, [field]: value } : row)),
    )
  }

  const handleStockItemSelect = (rowKey: string, stockItem: StockItem) => {
    setItems((prev) =>
      prev.map((row) =>
        row.rowKey === rowKey
          ? {
              ...row,
              stock_item_id: stockItem.id,
              unit: stockItem.unit,
              unit_price: String(stockItem.last_purchase_price ?? 0),
              prefetchedLabel: { id: stockItem.id, name: stockItem.name, sku: stockItem.sku },
            }
          : row,
      ),
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validItems = items.filter((it) => it.stock_item_id && it.quantity)
    if (validItems.length === 0) return toast.error(t("purchaseOrders.minOneProduct"))
    await onSave({
      ...form,
      expected_date: form.expected_date || null,
      items: validItems.map((it) => ({
        stock_item_id: it.stock_item_id,
        quantity: Number(it.quantity),
        unit: it.unit,
        unit_price: Number(it.unit_price),
        notes: it.notes,
      })),
    })
  }

  const total = items.reduce(
    (acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    0,
  )

  const isDirty = useMemo(() => {
    if (!initialOrder) return false
    const formChanged =
      form.supplier_id !== initialOrder.supplier ||
      form.warehouse_id !== initialOrder.warehouse ||
      form.order_date !== initialOrder.order_date.slice(0, 10) ||
      form.expected_date !== (initialOrder.expected_date ? initialOrder.expected_date.slice(0, 10) : "") ||
      form.notes !== (initialOrder.notes ?? "")
    const initialItems = initialOrder.items ?? []
    const itemsChanged =
      items.length !== initialItems.length ||
      items.some((item, i) => {
        const init = initialItems[i]
        if (!init) return true
        return (
          item.stock_item_id !== init.stock_item ||
          item.quantity !== String(init.quantity) ||
          item.unit !== init.unit ||
          item.unit_price !== String(init.unit_price) ||
          (item.notes ?? "") !== (init.notes ?? "")
        )
      })
    return formChanged || itemsChanged
  }, [initialOrder, form, items])

  useDirtyFormWarning(isDirty)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent layout="scroll" size="3xl" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("purchaseOrders.titleEdit") : t("purchaseOrders.titleNew")}
          </DialogTitle>
          {isEdit && initialOrder ? (
            <DialogDescription>{initialOrder.order_number}</DialogDescription>
          ) : null}
        </DialogHeader>

        <DialogBody className="space-y-5">
          <form id="po-form" onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="po-supplier">{t("purchaseOrders.supplierLabel")}</Label>
                <select
                  id="po-supplier"
                  value={form.supplier_id}
                  onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                  required
                  className={fieldInputClass}
                >
                  <option value="">{t("purchaseOrders.selectPlaceholder")}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="po-warehouse">{t("purchaseOrders.targetWarehouseLabel")}</Label>
                <select
                  id="po-warehouse"
                  value={form.warehouse_id}
                  onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
                  required
                  className={fieldInputClass}
                >
                  <option value="">{t("purchaseOrders.selectPlaceholder")}</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="po-order-date">{t("purchaseOrders.orderDateLabel")}</Label>
                <Input
                  id="po-order-date"
                  type="date"
                  value={form.order_date}
                  onChange={(e) => setForm({ ...form, order_date: e.target.value })}
                  required
                  className="bg-background"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="po-expected-date">{t("purchaseOrders.expectedDateLabel")}</Label>
                <Input
                  id="po-expected-date"
                  type="date"
                  value={form.expected_date}
                  onChange={(e) => setForm({ ...form, expected_date: e.target.value })}
                  className="bg-background"
                />
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className="text-sm font-ui-semibold text-foreground">{t("purchaseOrders.linesTitle")}</h4>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus size={14} />
                  {t("purchaseOrders.addLine")}
                </Button>
              </div>

              {!form.warehouse_id ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  {t("inventoryModal.toast.selectTargetWarehouse")}
                </p>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.rowKey}
                      className="flex flex-wrap items-start gap-2 rounded-lg border border-border p-3"
                    >
                      <div className="min-w-[min(100%,14rem)] flex-1">
                        <StockItemSelect
                          value={item.stock_item_id}
                          warehouseId={form.warehouse_id}
                          prefetchedLabel={item.prefetchedLabel}
                          onSelect={(stockItem) => handleStockItemSelect(item.rowKey, stockItem)}
                        />
                      </div>
                      <Input
                        type="number"
                        step="0.001"
                        min={0}
                        placeholder={t("purchaseOrders.placeholderQty")}
                        value={item.quantity}
                        onChange={(e) => updateItem(item.rowKey, "quantity", e.target.value)}
                        className="h-9 w-24 bg-background text-sm"
                      />
                      <Input
                        value={item.unit}
                        onChange={(e) => updateItem(item.rowKey, "unit", e.target.value)}
                        placeholder={t("purchaseOrders.placeholderUnit")}
                        className="h-9 w-16 bg-background text-sm"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder={t("purchaseOrders.placeholderPrice")}
                        value={item.unit_price}
                        onChange={(e) => updateItem(item.rowKey, "unit_price", e.target.value)}
                        className="h-9 w-24 bg-background text-sm"
                      />
                      {items.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeItem(item.rowKey)}
                          className="text-destructive hover:text-destructive"
                          aria-label={t("confirm.delete")}
                        >
                          <Trash2 size={14} />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 text-right text-sm font-ui-semibold text-foreground">
                {t("purchaseOrders.totalLabel")}{" "}
                <span className="text-blue-600">{formatAmount(total, canViewAmounts)}</span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="po-notes">{t("purchaseOrders.notesLabel")}</Label>
              <Textarea
                id="po-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="resize-none bg-background"
              />
            </div>
          </form>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            {t("warehouseForm.cancel")}
          </Button>
          <Button type="submit" form="po-form" disabled={isLoading || !form.warehouse_id}>
            {isLoading
              ? isEdit
                ? t("purchaseOrders.saving")
                : t("purchaseOrders.creating")
              : isEdit
                ? t("purchaseOrders.saveChanges")
                : t("purchaseOrders.createOrder")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
