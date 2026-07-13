"use client"

import { useState, useEffect, useRef } from "react"
import { isAxiosError } from "axios"
import { Plus, Trash2, AlertCircle } from "lucide-react"
import { adminApi, type KitchenStation } from "@/features/admin/services/adminApi"
import StockItemSelect from "@/features/inventory/components/StockItemSelect"
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
import { useTranslations } from "next-intl"

type DeficiencyLineInput = { stock_item_id: string; quantity: number; unit?: string; notes?: string }

interface DeficiencyReportFormModalProps {
  open: boolean
  onSave: (data: Record<string, unknown>) => Promise<void>
  onClose: () => void
  isLoading?: boolean
  initialStationId?: string
  /** İlk açılışta (ör. dış bağlantı) tüm satırları doldurur — yalnızca mount’ta bir kez uygulanır */
  initialLineItems?: DeficiencyLineInput[]
  /**
   * Depo stoğu çekmecesinden her “Eksik listesine ekle” tıklamasında gelen yeni satırlar.
   * Mevcut form satırlarına birleştirilir (aynı stok_id için miktarlar toplanır).
   */
  appendBatch?: DeficiencyLineInput[] | null
  /** Her yeni eklemede artırın; Strict Mode’da çift birleştirmeyi önlemek için kullanılır */
  appendVersion?: number
}

interface ItemRow {
  stock_item_id: string
  quantity: string
  unit: string
  notes: string
}

const emptyRow = (): ItemRow => ({ stock_item_id: "", quantity: "", unit: "", notes: "" })

function isRowBlank(r: ItemRow): boolean {
  return !r.stock_item_id && !String(r.quantity ?? "").trim()
}

/** Drawer’dan gelen partiyi mevcut satırlarla birleştirir; aynı üründe miktar toplanır. */
export function mergeDeficiencyRows(
  prev: ItemRow[],
  incoming: DeficiencyLineInput[]
): ItemRow[] {
  if (!incoming.length) return prev

  const pristineOnlyEmpty = prev.length === 1 && isRowBlank(prev[0])
  if (pristineOnlyEmpty) {
    return incoming.map((li) => ({
      stock_item_id: li.stock_item_id,
      quantity: String(li.quantity),
      unit: li.unit ?? "",
      notes: li.notes ?? "",
    }))
  }

  const result = prev.map((r) => ({ ...r }))
  for (const inc of incoming) {
    const idx = result.findIndex((r) => r.stock_item_id === inc.stock_item_id)
    if (idx >= 0) {
      const q = (parseFloat(result[idx].quantity) || 0) + (Number(inc.quantity) || 0)
      result[idx] = { ...result[idx], quantity: String(q) }
    } else {
      result.push({
        stock_item_id: inc.stock_item_id,
        quantity: String(inc.quantity),
        unit: inc.unit ?? "",
        notes: inc.notes ?? "",
      })
    }
  }
  const meaningful = result.filter((r) => !isRowBlank(r))
  return meaningful.length ? meaningful : [emptyRow()]
}

export function DeficiencyReportFormModal({
  open,
  onSave,
  onClose,
  isLoading,
  initialStationId,
  initialLineItems,
  appendBatch,
  appendVersion = 0,
}: DeficiencyReportFormModalProps) {
  const t = useTranslations("warehouse")
  const [stations, setStations] = useState<KitchenStation[]>([])
  const [serverError, setServerError] = useState<string | null>(null)
  
  const [form, setForm] = useState({
    kitchen_station_id: initialStationId || "",
    description: "",
  })

  const [items, setItems] = useState<ItemRow[]>(() => [emptyRow()])

  const didApplyInitialLineItemsRef = useRef(false)
  const processedAppendVersionRef = useRef(-1)

  useEffect(() => {
    const fetchStations = async () => {
      try {
        const data = await adminApi.getStations()
        setStations(data)
      } catch (err) {
        console.error("İstasyonlar yüklenemedi", err)
      }
    }
    fetchStations()
  }, [])

  /** Dışarıdan tek seferlik ön doldurma (append ile karışmaz; KDS depo akışı appendBatch kullanır) */
  useEffect(() => {
    if (!initialLineItems?.length || didApplyInitialLineItemsRef.current) return
    didApplyInitialLineItemsRef.current = true
    setItems(
      initialLineItems.map((li) => ({
        stock_item_id: li.stock_item_id,
        quantity: String(li.quantity),
        unit: li.unit ?? "",
        notes: li.notes ?? "",
      }))
    )
  }, [initialLineItems])

  /** Depo stoğundan art arda ürün ekleme — mevcut düzenlemeleri korur */
  useEffect(() => {
    if (!appendBatch?.length || appendVersion <= 0) return
    if (appendVersion <= processedAppendVersionRef.current) return
    processedAppendVersionRef.current = appendVersion
    setItems((prev) => mergeDeficiencyRows(prev, appendBatch))
  }, [appendVersion, appendBatch])

  const addItem = () => setItems([...items, { stock_item_id: "", quantity: "", unit: "", notes: "" }])
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i))

  const updateItem = (i: number, field: keyof ItemRow, value: string) => {
    const updated = [...items]
    updated[i] = { ...updated[i], [field]: value }
    setItems(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!form.kitchen_station_id) return toast.error(t("deficiencyForm.toastSelectStation"))

    const validItems = items.filter((it) => it.stock_item_id && it.quantity)
    if (validItems.length === 0) return toast.error(t("deficiencyForm.toastMinLine"))
    
    try {
      await onSave({
        kitchen_station_id: form.kitchen_station_id,
        notes: form.description,
        items: validItems.map((it) => ({
          stock_item_id: it.stock_item_id,
          quantity: Number(it.quantity),
          unit: it.unit,
          notes: it.notes,
        })),
      })
    } catch (err: unknown) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { error?: string; detail?: string } | undefined)?.error
          ?? (err.response?.data as { detail?: string } | undefined)?.detail
          ?? t("deficiencyForm.submitFailed")
        : t("deficiencyForm.submitFailed")
      setServerError(msg)
      toast.error(msg)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent layout="scroll" size="2xl" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="rounded-md bg-amber-100 p-1.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              <AlertCircle size={18} />
            </span>
            {t("deficiencyForm.title")}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-5">
        <form id="deficiency-form" onSubmit={handleSubmit} className="space-y-5">
          {serverError && (
            <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-800 dark:bg-rose-950/30">
              <div className="mt-0.5 text-rose-600">
                <AlertCircle size={16} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-rose-800 dark:text-rose-200">{t("deficiencyForm.errorTitle")}</p>
                <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">{serverError}</p>
              </div>
              <button type="button" onClick={() => setServerError(null)} className="px-1 text-rose-500 hover:text-rose-700">
                ×
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{t("deficiencyForm.labelStation")}</label>
              <select
                value={form.kitchen_station_id}
                onChange={(e) => {
                  setForm({ ...form, kitchen_station_id: e.target.value })
                  setServerError(null)
                }}
                required
                disabled={!!initialStationId}
                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all disabled:opacity-100 disabled:bg-slate-50 dark:disabled:bg-slate-900/50 disabled:text-muted-foreground"
              >
                <option value="">{t("deficiencyForm.selectStation")}</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.branch_name})</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-tight">{t("deficiencyForm.sectionLines")}</h4>
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sub font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50"
              >
                <Plus size={14} /> {t("deficiencyForm.addLine")}
              </button>
            </div>
            
            <div className="space-y-2 mt-2">
              {/* Table Header (Desktop Only) */}
              <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-1 text-2xs font-bold text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">
                <div className="col-span-12 sm:col-span-5">{t("deficiencyForm.colProduct")}</div>
                <div className="col-span-6 sm:col-span-2 text-center">{t("deficiencyForm.colQty")}</div>
                <div className="col-span-6 sm:col-span-2 text-center">{t("deficiencyForm.colUnit")}</div>
                <div className="col-span-12 sm:col-span-3">{t("deficiencyForm.colNotesOptional")}</div>
              </div>

              {items.map((item, i) => (
                <div key={i} className="group relative rounded-lg border border-border bg-slate-50 p-2 border-border bg-muted/50 sm:p-1.5">
                  <div className="grid grid-cols-12 gap-2 sm:gap-3 items-center">
                    <div className="col-span-12 sm:col-span-5">
                      <label className="sm:hidden block text-2xs font-bold text-muted-foreground uppercase mb-0.5">{t("deficiencyForm.colProduct")}</label>
                      <StockItemSelect 
                        value={item.stock_item_id}
                        onSelect={(si) => {
                          const updated = [...items]
                          updated[i].stock_item_id = si.id
                          updated[i].unit = si.unit
                          setItems(updated)
                        }}
                      />
                    </div>
                    
                    <div className="col-span-6 sm:col-span-2">
                      <label className="sm:hidden block text-2xs font-bold text-muted-foreground uppercase mb-0.5">{t("deficiencyForm.colQty")}</label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder={t("deficiencyForm.qtyPlaceholder")}
                        value={item.quantity}
                        onChange={(e) => updateItem(i, "quantity", e.target.value)}
                        className="w-full rounded-md border border-border px-2 py-1.5 text-center text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-500/20 border-border bg-muted text-foreground sm:text-sm"
                      />
                    </div>
                    
                    <div className="col-span-6 sm:col-span-2">
                      <label className="sm:hidden block text-2xs font-bold text-muted-foreground uppercase mb-0.5">{t("deficiencyForm.colUnit")}</label>
                      <input
                        value={item.unit}
                        onChange={(e) => updateItem(i, "unit", e.target.value)}
                        placeholder={t("deficiencyForm.unitPlaceholder")}
                        className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-muted-foreground text-xs sm:text-sm text-center outline-none cursor-not-allowed"
                        readOnly
                      />
                    </div>
                    
                    <div className="col-span-11 sm:col-span-3">
                      <label className="sm:hidden block text-2xs font-bold text-muted-foreground uppercase mb-0.5">{t("deficiencyForm.colNotesOptional")}</label>
                      <input
                        value={item.notes}
                        onChange={(e) => updateItem(i, "notes", e.target.value)}
                        placeholder={t("deficiencyForm.rowNotePlaceholder")}
                        className="w-full rounded-md border border-border px-2 py-1.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-amber-500/20 border-border bg-muted text-foreground"
                      />
                    </div>

                    <div className="col-span-1 sm:absolute sm:-right-2 sm:top-1/2 sm:-translate-y-1/2 flex justify-center">
                      {items.length > 1 && (
                        <button 
                          type="button" 
                          onClick={() => removeItem(i)} 
                          className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 border-border bg-muted sm:opacity-0 sm:group-hover:opacity-100"
                          title={t("deficiencyForm.removeLineTitle")}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{t("deficiencyForm.generalNotes")}</label>
            <textarea
              value={form.description}
              onChange={(e) => {
                setForm({ ...form, description: e.target.value })
                setServerError(null)
              }}
              rows={2}
              placeholder={t("deficiencyForm.reportNotesPlaceholder")}
              className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 border-border bg-muted text-foreground"
            />
          </div>
        </form>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            {t("warehouseForm.cancel")}
          </Button>
          <Button type="submit" form="deficiency-form" disabled={isLoading}>
            {isLoading ? t("deficiencyForm.submitting") : t("deficiencyForm.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
