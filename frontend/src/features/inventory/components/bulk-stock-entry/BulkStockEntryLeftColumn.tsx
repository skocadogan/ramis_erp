"use client"

import { useLocale, useTranslations } from "next-intl"
import type { StockReceiptDraft, Supplier } from "@/features/inventory/types"
import { AUTO_SAVE_DEBOUNCE_MS, bulkStockEntryInputClass, bulkStockEntryLabelClass } from "./bulkStockEntry.constants"
import type { WarehouseOpt } from "./bulkStockEntry.types"

type Props = {
  draftId: string | null
  status: "DRAFT" | "POSTED" | null
  draftSummaries: StockReceiptDraft[]
  draftListLoading: boolean
  loadingDraft: boolean
  warehouseName: (id: string) => string
  onDraftSelect: (value: string) => void
  autoSaveEnabled: boolean
  setAutoSaveEnabled: (v: boolean) => void
  autoSaveBusy: boolean
  lastSavedAt: Date | null
  saveError: string
  finalizeError: string
  warehouseId: string
  setWarehouseId: (v: string) => void
  supplierId: string
  setSupplierId: (v: string) => void
  reference: string
  setReference: (v: string) => void
  notes: string
  setNotes: (v: string) => void
  warehouses: WarehouseOpt[]
  suppliers: Supplier[]
}

export function BulkStockEntryLeftColumn({
  draftId,
  status,
  draftSummaries,
  draftListLoading,
  loadingDraft,
  warehouseName,
  onDraftSelect,
  autoSaveEnabled,
  setAutoSaveEnabled,
  autoSaveBusy,
  lastSavedAt,
  saveError,
  finalizeError,
  warehouseId,
  setWarehouseId,
  supplierId,
  setSupplierId,
  reference,
  setReference,
  notes,
  setNotes,
  warehouses,
  suppliers,
}: Props) {
  const t = useTranslations("inventory")
  const locale = useLocale()
  const dateLocale = locale === "en" ? "en-US" : "tr-TR"
  const input = bulkStockEntryInputClass
  const label = bulkStockEntryLabelClass

  return (
    <div className="flex min-h-0 min-w-0 shrink-0 flex-col gap-3 overflow-y-auto border-border pr-0 lg:w-[30%] lg:max-h-full lg:border-r lg:pr-4 border-border">
      <div className="flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2.5 border-border bg-card/50">
        <label className="text-xs font-medium text-muted-foreground">{t("bulkStockEntry.draftsPickerLabel")}</label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="min-w-0 flex-1 rounded-md border border-border px-2.5 py-1.5 text-sm bg-muted border-input text-foreground"
            disabled={draftListLoading || loadingDraft}
            value={draftId ?? ""}
            onChange={(e) => onDraftSelect(e.target.value)}
          >
            <option value="">{draftListLoading ? t("bulkStockEntry.draftLoading") : t("bulkStockEntry.newDraft")}</option>
            {draftSummaries.map((d) => (
              <option key={d.id} value={d.id}>
                {d.status === "POSTED" ? t("bulkStockEntry.postedPrefix") : t("bulkStockEntry.draftPrefix")}
                {(d.reference || t("bulkStockEntry.defaultRecordName")).slice(0, 36)}
                {(d.reference || "").length > 36 ? "…" : ""} · {warehouseName(d.warehouse)} · {d.lines?.length ?? 0}{" "}
                {t("bulkStockEntry.rowUnit")} ·{" "}
                {new Date(d.updated_at).toLocaleString(dateLocale, {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </option>
            ))}
          </select>
          {loadingDraft && (
            <span className="shrink-0 text-xs text-blue-600 dark:text-blue-400">{t("bulkStockEntry.loadingDraft")}</span>
          )}
        </div>
        {!draftListLoading && draftSummaries.length === 0 && (
          <p className="text-sub text-muted-foreground">{t("bulkStockEntry.hintNoRecords")}</p>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-slate-50/80 px-3 py-2 border-border bg-muted/30">
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={autoSaveEnabled}
            onChange={(e) => setAutoSaveEnabled(e.target.checked)}
            disabled={status === "POSTED"}
          />
          {t("bulkStockEntry.autoSaveLabel", { seconds: AUTO_SAVE_DEBOUNCE_MS / 1000 })}
        </label>
        <div className="text-xs text-muted-foreground">
          {autoSaveBusy && <span className="text-blue-600 dark:text-blue-400">{t("bulkStockEntry.autoSaving")}</span>}
          {lastSavedAt && !autoSaveBusy && (
            <span>
              {t("bulkStockEntry.lastSaved")}{" "}
              {lastSavedAt.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      {saveError && (
        <div className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          <span className="font-medium">{t("bulkStockEntry.draftRecordLabel")}</span> {saveError}
        </div>
      )}

      {finalizeError && (
        <div className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
          <span className="font-medium">{t("bulkStockEntry.finalizeLabel")}</span> {finalizeError}
        </div>
      )}

      <div className="flex shrink-0 flex-col gap-3">
        <div>
          <label className={label}>{t("bulkStockEntry.warehouseLabel")}</label>
          <select className={input} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={status === "POSTED"}>
            <option value="">{t("bulkStockEntry.selectWarehouse")}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>{t("bulkStockEntry.supplier")}</label>
          <select className={input} value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={status === "POSTED"}>
            <option value="">{t("bulkStockEntry.supplierNone")}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>{t("bulkStockEntry.reference")}</label>
          <input
            className={input}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            disabled={status === "POSTED"}
            placeholder={t("bulkStockEntry.referencePh")}
          />
        </div>
        <div>
          <label className={label}>{t("bulkStockEntry.notes")}</label>
          <textarea className={input} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={status === "POSTED"} />
        </div>
      </div>
    </div>
  )
}
