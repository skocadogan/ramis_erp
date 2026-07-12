"use client"

import { useState } from "react"
import { Plus, Trash2, Package, ChevronDown } from "lucide-react"
import { useWarehouses, useSuppliers, useStockItems, usePurchaseOrders } from "@/features/warehouse/hooks/useWarehouse"
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
import { toast } from "sonner"
import { useTranslations } from "next-intl"

interface GoodsReceivingFormModalProps {
  open: boolean
  onSave: (data: Record<string, unknown>) => Promise<void>
  onClose: () => void
  isLoading?: boolean
}

interface ItemRow {
  stock_item_id: string
  expected_quantity: string
  received_quantity: string
  rejected_quantity: string
  unit: string
  unit_price: string
  expiry_date: string
  batch_number: string
  notes: string
}

const EMPTY_ITEM: ItemRow = {
  stock_item_id: "",
  expected_quantity: "0",
  received_quantity: "",
  rejected_quantity: "0",
  unit: "",
  unit_price: "0",
  expiry_date: "",
  batch_number: "",
  notes: "",
}

const inp =
  "w-full px-2 py-1 bg-background border border-border rounded-md text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"

const lbl = "block text-xs font-ui-medium text-muted-foreground mb-1"

const TH = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <th className={`px-2 py-1.5 text-left text-sub font-ui-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap bg-muted/80 ${className}`}>
    {children}
  </th>
)

export function GoodsReceivingFormModal({ open, onSave, onClose, isLoading }: GoodsReceivingFormModalProps) {
  const t = useTranslations("warehouse")
  const { data: warehouses = [] } = useWarehouses()
  const { data: suppliers = [] } = useSuppliers()
  const { data: stockItems = [] } = useStockItems()
  const { data: purchaseOrders = [] } = usePurchaseOrders({ status: "ORDERED" })

  const [form, setForm] = useState({
    purchase_order_id: "",
    supplier_id: "",
    warehouse_id: "",
    received_date: new Date().toISOString().split("T")[0],
    invoice_number: "",
    waybill_number: "",
    notes: "",
  })

  const [items, setItems] = useState<ItemRow[]>([EMPTY_ITEM])

  const addItem = () => setItems([{ ...EMPTY_ITEM }, ...items])
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i))
  const updateItem = (i: number, field: keyof ItemRow, value: string) => {
    const updated = [...items]
    let row: ItemRow = { ...updated[i], [field]: value }
    if (field === "stock_item_id") {
      const si = stockItems.find((s) => s.id === value)
      if (si) row = { ...row, unit: si.unit, unit_price: String(si.last_purchase_price ?? "0") }
    }
    updated[i] = row
    setItems(updated)
  }

  const handlePOSelect = (poId: string) => {
    setForm((prev) => ({ ...prev, purchase_order_id: poId }))
    const po = purchaseOrders.find((p) => p.id === poId)
    if (po) {
      setForm((prev) => ({ ...prev, supplier_id: po.supplier, warehouse_id: po.warehouse }))
      if (po.items?.length) {
        setItems(
          po.items.map((it) => {
            const ordered = Number(it.quantity ?? 0)
            const alreadyReceived = Number(it.received_quantity ?? 0)
            const remaining = Math.max(0, ordered - alreadyReceived)
            return {
              stock_item_id: it.stock_item,
              expected_quantity: String(remaining || ordered),
              received_quantity: String(remaining || ordered),
              rejected_quantity: "0",
              unit: it.unit,
              unit_price: String(it.unit_price),
              expiry_date: "",
              batch_number: "",
              notes: "",
            }
          })
        )
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validItems = items.filter((it) => it.stock_item_id && it.received_quantity)
    if (validItems.length === 0) return toast.error(t("goodsReceivingForm.minOneLine"))
    await onSave({
      ...form,
      purchase_order_id: form.purchase_order_id || null,
      items: validItems.map((it) => ({
        stock_item_id: it.stock_item_id,
        expected_quantity: Number(it.expected_quantity) || 0,
        received_quantity: Number(it.received_quantity),
        rejected_quantity: Number(it.rejected_quantity) || 0,
        unit: it.unit,
        unit_price: Number(it.unit_price) || 0,
        expiry_date: it.expiry_date || null,
        batch_number: it.batch_number,
        notes: it.notes,
      })),
    })
  }

  const validCount = items.filter((it) => it.stock_item_id && it.received_quantity).length

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent layout="scroll" size="7xl" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{t("goodsReceivingForm.title")}</DialogTitle>
          <DialogDescription>{t("goodsReceivingForm.subtitle")}</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <form
          id="goods-receiving-form"
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col divide-y divide-border overflow-hidden md:flex-row md:divide-x md:divide-y-0"
        >
        {/* ── Sol: Form alanları ── */}
        <div className="md:w-72 shrink-0 overflow-y-auto p-5 space-y-4">
          <p className="text-xs font-ui-semibold text-muted-foreground uppercase tracking-wide">{t("goodsReceivingForm.generalInfo")}</p>

          {/* PO seçimi */}
          <div>
            <label className={lbl}>{t("goodsReceivingForm.labelPO")}</label>
            <div className="relative">
              <select
                value={form.purchase_order_id}
                onChange={(e) => handlePOSelect(e.target.value)}
                className={`${inp} py-2 pr-7 appearance-none`}
              >
                <option value="">{t("goodsReceivingForm.poSkipOption")}</option>
                {purchaseOrders.map((po) => (
                  <option key={po.id} value={po.id}>{po.order_number} — {po.supplier_name}</option>
                ))}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </div>
            {form.purchase_order_id && (
              <p className="mt-1 text-sub text-emerald-600 dark:text-emerald-400">{t("goodsReceivingForm.poSelectedHint")}</p>
            )}
          </div>

          {/* Tedarikçi */}
          <div>
            <label className={lbl}>{t("goodsReceivingForm.labelSupplier")} <span className="text-rose-500">*</span></label>
            <div className="relative">
              <select
                value={form.supplier_id}
                onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                required
                className={`${inp} py-2 pr-7 appearance-none`}
              >
                <option value="">{t("purchaseOrders.selectPlaceholder")}</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          {/* Hedef Depo */}
          <div>
            <label className={lbl}>{t("goodsReceivingForm.labelTargetWarehouse")} <span className="text-rose-500">*</span></label>
            <div className="relative">
              <select
                value={form.warehouse_id}
                onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
                required
                className={`${inp} py-2 pr-7 appearance-none`}
              >
                <option value="">{t("purchaseOrders.selectPlaceholder")}</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          {/* Teslim Tarihi */}
          <div>
            <label className={lbl}>{t("goodsReceivingForm.labelReceivedDate")} <span className="text-rose-500">*</span></label>
            <input
              type="date"
              value={form.received_date}
              onChange={(e) => setForm({ ...form, received_date: e.target.value })}
              required
              className={`${inp} py-2`}
            />
          </div>

          {/* Fatura No */}
          <div>
            <label className={lbl}>{t("goodsReceivingForm.labelInvoice")}</label>
            <input
              value={form.invoice_number}
              onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
              className={`${inp} py-2`}
              placeholder={t("goodsReceivingForm.invoicePlaceholder")}
            />
          </div>

          {/* İrsaliye No */}
          <div>
            <label className={lbl}>{t("goodsReceivingForm.labelWaybill")}</label>
            <input
              value={form.waybill_number}
              onChange={(e) => setForm({ ...form, waybill_number: e.target.value })}
              className={`${inp} py-2`}
              placeholder={t("goodsReceivingForm.waybillPlaceholder")}
            />
          </div>

          {/* Notlar */}
          <div>
            <label className={lbl}>{t("goodsReceivingForm.labelNotes")}</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className={`${inp} py-2 resize-none`}
              placeholder={t("goodsReceivingForm.notesPlaceholder")}
            />
          </div>
        </div>

        {/* ── Sağ: Kalem tablosu ── */}
        <div className="flex-1 flex flex-col overflow-hidden p-5 gap-3 min-h-0">
          {/* Tablo başlık */}
          <div className="shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package size={15} className="text-muted-foreground" />
              <p className="text-xs font-ui-semibold text-foreground">{t("goodsReceivingForm.linesTitle")}</p>
              <span className="text-xs font-ui-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {t("goodsReceivingForm.rowCount", { count: items.length })}
              </span>
              {validCount > 0 && (
                <span className="text-xs font-ui-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  {t("goodsReceivingForm.validCount", { count: validCount })}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-ui-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
            >
              <Plus size={13} /> {t("goodsReceivingForm.addLine")}
            </button>
          </div>

          {/* Kompakt tablo */}
          <div className="flex-1 overflow-auto rounded-lg border border-border min-h-0">
            <table className="w-full text-xs min-w-[760px] border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border">
                  <TH className="w-8 text-center">#</TH>
                  <TH className="min-w-[180px]">{t("goodsReceiving.colProduct")}</TH>
                  <TH className="w-24 text-right">
                    {t("goodsReceivingForm.colReceived")} <span className="text-rose-500 font-ui-bold">*</span>
                  </TH>
                  <TH className="w-24 text-right">{t("goodsReceivingForm.colExpected")}</TH>
                  <TH className="w-20 text-right">{t("goodsReceivingForm.colRejected")}</TH>
                  <TH className="w-16">{t("goodsReceivingForm.colUnit")}</TH>
                  <TH className="w-24 text-right">{t("goodsReceivingForm.colUnitPrice")}</TH>
                  <TH className="w-28">{t("goodsReceivingForm.colExpiry")}</TH>
                  <TH className="w-24">{t("goodsReceivingForm.colLot")}</TH>
                  <TH className="w-8">{null}</TH>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item, i) => {
                  const hasProduct = !!item.stock_item_id
                  const hasQty = !!item.received_quantity
                  const isValid = hasProduct && hasQty
                  return (
                    <tr
                      key={i}
                      className={`transition-colors ${
                        isValid
                          ? "bg-emerald-50/40 dark:bg-emerald-900/10"
                          : i % 2 === 0
                          ? "bg-background"
                          : "bg-background"
                      }`}
                    >
                      {/* # */}
                      <td className="px-2 py-1.5 text-center text-muted-foreground tabular-nums font-mono">{i + 1}</td>

                      {/* Ürün */}
                      <td className="px-2 py-1.5">
                        <div className="relative">
                          <select
                            value={item.stock_item_id}
                            onChange={(e) => updateItem(i, "stock_item_id", e.target.value)}
                            className="w-full px-2 py-1 bg-background border border-border rounded-md text-xs outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none pr-6"
                          >
                            <option value="">{t("goodsReceivingForm.selectProduct")}</option>
                            {stockItems.map((s) => (
                              <option key={s.id} value={s.id}>{s.name} ({s.sku})</option>
                            ))}
                          </select>
                          <ChevronDown size={11} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        </div>
                      </td>

                      {/* Alınan */}
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          placeholder="0"
                          value={item.received_quantity}
                          onChange={(e) => updateItem(i, "received_quantity", e.target.value)}
                          className={`${inp} text-right tabular-nums ${!hasQty && hasProduct ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20" : ""}`}
                        />
                      </td>

                      {/* Beklenen */}
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          placeholder="0"
                          value={item.expected_quantity}
                          onChange={(e) => updateItem(i, "expected_quantity", e.target.value)}
                          className={`${inp} text-right tabular-nums`}
                        />
                      </td>

                      {/* Red */}
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          placeholder="0"
                          value={item.rejected_quantity}
                          onChange={(e) => updateItem(i, "rejected_quantity", e.target.value)}
                          className={`${inp} text-right tabular-nums`}
                        />
                      </td>

                      {/* Birim */}
                      <td className="px-2 py-1.5">
                        <input
                          value={item.unit}
                          onChange={(e) => updateItem(i, "unit", e.target.value)}
                          placeholder={t("goodsReceivingForm.unitPlaceholder")}
                          className={`${inp} text-center`}
                        />
                      </td>

                      {/* Birim Fiyat */}
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={item.unit_price}
                          onChange={(e) => updateItem(i, "unit_price", e.target.value)}
                          className={`${inp} text-right tabular-nums`}
                        />
                      </td>

                      {/* SKT */}
                      <td className="px-2 py-1.5">
                        <input
                          type="date"
                          value={item.expiry_date}
                          onChange={(e) => updateItem(i, "expiry_date", e.target.value)}
                          className={inp}
                        />
                      </td>

                      {/* Lot No */}
                      <td className="px-2 py-1.5">
                        <input
                          value={item.batch_number}
                          onChange={(e) => updateItem(i, "batch_number", e.target.value)}
                          placeholder={t("goodsReceivingForm.lotPlaceholder")}
                          className={`${inp} font-mono`}
                        />
                      </td>

                      {/* Sil */}
                      <td className="px-2 py-1.5 text-center">
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(i)}
                            className="p-1 rounded text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Tablo alt çubuğu */}
          <div className="shrink-0 text-xs text-muted-foreground dark:text-muted-foreground">
            {t("goodsReceivingForm.footerSummary", {
              rows: items.length,
              valid: validCount,
              incomplete: items.length - validCount,
            })}
          </div>
        </div>
        </form>
        </DialogBody>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
          {t("warehouseForm.cancel")}
        </Button>
        <Button type="submit" form="goods-receiving-form" disabled={isLoading}>
          {isLoading ? t("goodsReceivingForm.saving") : t("goodsReceivingForm.submit")}
        </Button>
      </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
