"use client"

import { useRef, useState, useEffect, useMemo } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Search, Trash2, Loader2 } from "lucide-react"
import { useWarehouses } from "@/features/warehouse/hooks/useWarehouse"
import { warehouseApi } from "@/features/warehouse/services/warehouseApi"
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
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { WarehouseTransfer } from "@/features/warehouse/types"
import { Input } from "@/components/ui/input"
import { newClientId } from "@/lib/clientId"
import { formatNumber } from "@/lib/formatters"
import { useTranslations } from "next-intl"

interface TransferFormModalProps {
  open: boolean
  onSave: (data: Record<string, unknown>) => Promise<void>
  onClose: () => void
  isLoading?: boolean
  /** Doluysa düzenleme modu; parent `key={transfer.id}` ile remount önerilir */
  initialTransfer?: WarehouseTransfer | null
}

interface ItemRow {
  rowKey: string
  stock_item_id: string
  stock_item_name: string
  stock_item_sku: string
  quantity: string
  on_hand: string
  /** Hedef depoda güncel miktar (bilgilendirme; doğrulama kaynağa göre) */
  on_hand_target: string
  unit: string
  notes: string
  prefetchedLabel?: { id: string; name: string; sku: string } | null
}

/** Sanal satır tahmini (px) */
const ROW_ESTIMATE_PX = 48

/** Başlık ve satırlar aynı sütun hizası — kaynak mevcut | hedef mevcut | transfer miktarı */
const transferRowGridClass =
  "grid w-full grid-cols-[2rem_minmax(0,1fr)_5.5rem_5.5rem_6rem_5.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 px-2 py-1.5 text-xs"

export function TransferFormModal({ open, onSave, onClose, isLoading, initialTransfer }: TransferFormModalProps) {
  const t = useTranslations("warehouse")
  const { data: warehouses = [] } = useWarehouses()
  const scrollRef = useRef<HTMLDivElement>(null)
  const isEdit = Boolean(initialTransfer)

  const [form, setForm] = useState(() => ({
    source_warehouse_id: initialTransfer?.source_warehouse ?? "",
    target_warehouse_id: initialTransfer?.target_warehouse ?? "",
    transfer_date: initialTransfer?.transfer_date
      ? initialTransfer.transfer_date.slice(0, 10)
      : new Date().toISOString().split("T")[0],
    notes: initialTransfer?.notes ?? "",
  }))

  const [items, setItems] = useState<ItemRow[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [isLoadingItems, setIsLoadingItems] = useState(false)

  /** Yeni transfer: modal her açıldığında formu sıfırla (key sabit kaldığı için remount olmaz). */
  useEffect(() => {
    if (!open || isEdit) return
    setForm({
      source_warehouse_id: "",
      target_warehouse_id: "",
      transfer_date: new Date().toISOString().split("T")[0],
      notes: "",
    })
    setItems([])
    setSearchTerm("")
    setIsLoadingItems(false)
  }, [open, isEdit])

  // Düzenleme modunda kalemleri yükle ve kaynak depodaki güncel «mevcut» miktarları çek
  useEffect(() => {
    if (!isEdit || !initialTransfer) return

    let cancelled = false

    setItems(
      initialTransfer.items.map((it) => ({
        rowKey: it.id || newClientId("row"),
        stock_item_id: it.stock_item,
        stock_item_name: it.stock_item_name ?? "",
        stock_item_sku: it.stock_item_sku ?? "",
        quantity: String(it.quantity),
        on_hand: "0",
        on_hand_target: "0",
        unit: it.unit,
        notes: it.notes ?? "",
      })),
    )

    setIsLoadingItems(true)
    warehouseApi
      .fetchAllWarehouseStockLevels(initialTransfer.source_warehouse)
      .then((sourceLevels) => {
        if (cancelled) return
        const srcMap = new Map(
          (sourceLevels as Array<{ stock_item: string; quantity: number }>).map((sl) => [
            sl.stock_item,
            String(sl.quantity),
          ]),
        )
        setItems((prev) =>
          prev.map((row) => ({
            ...row,
            on_hand: srcMap.get(row.stock_item_id) ?? "0",
          })),
        )
      })
      .catch(() => {
        if (!cancelled) toast.error(t("transferForm.stockLoadError"))
      })
      .finally(() => {
        if (!cancelled) setIsLoadingItems(false)
      })

    return () => {
      cancelled = true
    }
  }, [isEdit, initialTransfer, t])

  useEffect(() => {
    if (form.source_warehouse_id && !isEdit) {
      setIsLoadingItems(true)
      // Depodaki tüm stok seviyelerini çek
      warehouseApi.getWarehouseStockLevels(form.source_warehouse_id, { page_size: 1000 })
        .then((res) => {
          const data = res.data.results ?? res.data
          const rows: ItemRow[] = (data || []).map((sl: { stock_item: string; stock_item_name: string; stock_item_sku?: string; quantity: number; stock_item_unit?: string }) => ({
            rowKey: newClientId("row"),
            stock_item_id: sl.stock_item,
            stock_item_name: sl.stock_item_name,
            stock_item_sku: sl.stock_item_sku || "",
            quantity: "",
            on_hand: String(sl.quantity),
            on_hand_target: "0",
            unit: sl.stock_item_unit || "",
            notes: "",
          }))
          setItems(rows)
        })
        .catch(() => toast.error(t("transferForm.stockLoadError")))
        .finally(() => setIsLoadingItems(false))
    }
  }, [form.source_warehouse_id, isEdit, t])

  /** Hedef depoda mevcut miktarlar — yeni transfer ve düzenleme (hedef değişince güncellenir) */
  useEffect(() => {
    if (!form.target_warehouse_id || items.length === 0) return
    if (!isEdit && !form.source_warehouse_id) return

    let cancelled = false
    warehouseApi
      .fetchAllWarehouseStockLevels(form.target_warehouse_id)
      .then((levels) => {
        if (cancelled) return
        const qtyByStockItem = new Map(
          (levels as Array<{ stock_item: string; quantity: number }>).map((sl) => [
            sl.stock_item,
            String(sl.quantity),
          ]),
        )
        setItems((prev) =>
          prev.map((row) => ({
            ...row,
            on_hand_target: qtyByStockItem.get(row.stock_item_id) ?? "0",
          })),
        )
      })
      .catch(() => {
        if (!cancelled) toast.error(t("transferForm.stockLoadError"))
      })

    return () => {
      cancelled = true
    }
  }, [form.target_warehouse_id, form.source_warehouse_id, isEdit, items.length, t])

  const filteredItems = useMemo(() => {
    if (!searchTerm) return items
    const lower = searchTerm.toLowerCase()
    return items.filter(it => 
      it.stock_item_name.toLowerCase().includes(lower) || 
      it.stock_item_sku.toLowerCase().includes(lower) ||
      (parseFloat(it.quantity) > 0) // Eğer miktar girilmişse aramada kalsın
    )
  }, [items, searchTerm])

  const rowVirtualizer = useVirtualizer({
    count: filteredItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 10,
    getItemKey: (index) => filteredItems[index]?.rowKey ?? index,
  })

  const virtualRows = rowVirtualizer.getVirtualItems()

  const updateItem = (rowKey: string, field: keyof ItemRow, value: string) => {
    setItems((prev) => {
      const idx = prev.findIndex(it => it.rowKey === rowKey)
      if (idx === -1) return prev
      const updated = [...prev]
      updated[idx] = { ...updated[idx], [field]: value }
      return updated
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.source_warehouse_id === form.target_warehouse_id) return toast.error(t("transferForm.sameWarehouse"))

    const validItems = items.filter((it) => it.stock_item_id && parseFloat(it.quantity) > 0)

    if (validItems.length === 0) return toast.error(t("transferForm.minOneQty"))

    // Stok yetersizliği kontrolü
    const insufficientStock = validItems.find(it => parseFloat(it.quantity) > parseFloat(it.on_hand))
    if (insufficientStock) {
      return toast.error(
        t("transferForm.qtyExceeds", {
          name: insufficientStock.stock_item_name,
          qty: formatNumber(insufficientStock.on_hand, 2),
          unit: insufficientStock.unit,
        }),
      )
    }
    
    await onSave({
      ...form,
      items: validItems.map((it) => ({
        stock_item_id: it.stock_item_id,
        quantity: Number(it.quantity),
        unit: it.unit,
        notes: it.notes,
      })),
    })
  }

  const inputCls =
    "h-8 w-full min-w-0 rounded-md border border-border bg-background px-2.5 py-1 text-xs outline-none"

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent layout="scroll" size="7xl" className="max-h-[95vh]">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t("transferForm.titleEdit", { number: initialTransfer?.transfer_number ?? "" })
              : t("transferForm.titleNew")}
          </DialogTitle>
          <DialogDescription>{t("transferForm.itemsTitle")}</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <form
          id="transfer-form"
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
        <div className="grid shrink-0 grid-cols-3 gap-4 border-b border-border px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("transferForm.labelSource")}</label>
            <select
              value={form.source_warehouse_id}
              onChange={(e) => setForm({ ...form, source_warehouse_id: e.target.value })}
              required
              disabled={isEdit}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none disabled:bg-background"
            >
              <option value="">{t("transferForm.selectPlaceholder")}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("transferForm.labelTarget")}</label>
            <select
              value={form.target_warehouse_id}
              onChange={(e) => setForm({ ...form, target_warehouse_id: e.target.value })}
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
            >
              <option value="">{t("transferForm.selectPlaceholder")}</option>
              {warehouses
                .filter((w) => w.id !== form.source_warehouse_id)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("transferForm.labelTransferDate")}</label>
            <input
              type="date"
              value={form.transfer_date}
              onChange={(e) => setForm({ ...form, transfer_date: e.target.value })}
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-6 py-4">
          <div className="flex shrink-0 items-center justify-between gap-4">
            <h4 className="text-sm font-semibold text-foreground">{t("transferForm.itemsTitle")}</h4>
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <Input
                placeholder={t("transferForm.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 pl-9 text-xs"
              />
            </div>
          </div>

          <div className="flex min-h-[15rem] flex-1 flex-col overflow-hidden rounded-lg border border-border">
            <div
              className={cn(
                transferRowGridClass,
                "shrink-0 border-b border-border bg-muted/80 font-semibold text-muted-foreground",
              )}
            >
              <span className="text-center">{t("transferForm.colIdx")}</span>
              <span>{t("transferForm.colStockItem")}</span>
              <span className="text-right" title={t("transferForm.colOnHandHint")}>
                {t("transferForm.colOnHand")}
              </span>
              <span className="text-right" title={t("transferForm.colOnHandTargetHint")}>
                {t("transferForm.colOnHandTarget")}
              </span>
              <span className="text-right">{t("transferForm.colTransferQty")}</span>
              <span className="text-center">{t("transferForm.colUnit")}</span>
              <span>{t("transferForm.colNoteRow")}</span>
              <span className="text-center" aria-hidden> </span>
            </div>

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-auto overscroll-contain isolate bg-muted/20"
            >
              {isLoadingItems ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin mb-2" />
                  <p className="text-sm">{t("transferForm.loadingStock")}</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <p className="text-sm">
                    {form.source_warehouse_id ? t("transferForm.noResults") : t("transferForm.selectSourceFirst")}
                  </p>
                </div>
              ) : (
                <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }} role="presentation">
                  {virtualRows.map((vi) => {
                    const item = filteredItems[vi.index]
                    if (!item) return null
                    return (
                      <div
                        key={item.rowKey}
                        className="absolute left-0 top-0 w-full border-b border-border bg-background"
                        style={{ transform: `translateY(${vi.start}px)`, height: vi.size }}
                      >
                        <div className={transferRowGridClass}>
                          <span className="text-center text-muted-foreground font-mono text-2xs">{vi.index + 1}</span>
                          <div className="min-w-0">
                            <div className="font-medium text-foreground truncate" title={item.stock_item_name}>
                              {item.stock_item_name}
                            </div>
                            <div className="text-2xs text-muted-foreground font-mono">{item.stock_item_sku}</div>
                          </div>
                          <div className="text-right font-semibold text-muted-foreground pr-1 flex flex-col items-end">
                            <span>{formatNumber(item.on_hand, 2)}</span>
                            <span className="text-2xs text-muted-foreground font-normal">{item.unit}</span>
                          </div>
                          <div className="text-right font-semibold text-muted-foreground pr-1 flex flex-col items-end">
                            <span>{formatNumber(item.on_hand_target, 2)}</span>
                            <span className="text-2xs text-muted-foreground font-normal">{item.unit}</span>
                          </div>
                          <Input
                            type="number"
                            step="0.001"
                            min={0}
                            placeholder="0"
                            autoComplete="off"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.rowKey, "quantity", e.target.value)}
                            className={cn(
                              inputCls, 
                              "text-right tabular-nums font-bold focus:border-indigo-500 dark:border-indigo-900",
                              parseFloat(item.quantity) > parseFloat(item.on_hand)
                                ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30"
                                : "border-border"
                            )}
                          />
                          <div className="truncate px-1 text-center text-muted-foreground">
                            {item.unit}
                          </div>
                          <Input
                            value={item.notes}
                            onChange={(e) => updateItem(item.rowKey, "notes", e.target.value)}
                            placeholder={t("transferForm.noteRowPlaceholder")}
                            autoComplete="off"
                            className={cn(inputCls, "placeholder:text-muted-foreground")}
                          />
                          <div className="flex justify-center">
                            {parseFloat(item.quantity) > 0 && (
                              <button
                                type="button"
                                onClick={() => updateItem(item.rowKey, "quantity", "")}
                                className="rounded p-1 text-red-400 hover:bg-red-500/10 hover:text-red-600"
                                title={t("transferForm.resetQtyTitle")}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="shrink-0 flex items-center justify-between border-t border-border bg-background px-3 py-1.5 text-sub text-muted-foreground">
              <div>{t("transferForm.footerListed", { count: filteredItems.length })}</div>
              <div className="font-bold text-indigo-600 dark:text-indigo-400">
                {t("transferForm.footerSelected", { count: items.filter((it) => parseFloat(it.quantity) > 0).length })}
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-6 py-4">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("transferForm.generalNotesLabel")}</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
            placeholder={t("transferForm.notesPlaceholder")}
          />
        </div>

        </form>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading || isLoadingItems}>
            {t("warehouseForm.cancel")}
          </Button>
          <Button type="submit" form="transfer-form" disabled={isLoading || isLoadingItems}>
            {isLoading ? t("transferForm.saving") : isEdit ? t("transferForm.saveEdit") : t("transferForm.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
