"use client"

import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import type { StockCategory, StockUnit } from "@/features/inventory/types"
import { bulkStockEntryThClass } from "./bulkStockEntry.constants"
import { BulkDraftTableRow } from "./BulkDraftTableRow"
import type { DraftLineForm } from "./bulkStockEntry.types"

type Props = {
  lines: DraftLineForm[]
  status: "DRAFT" | "POSTED" | null
  stockUnits: StockUnit[]
  categories: StockCategory[]
  onAddLine: () => void
  onPatchLine: (localKey: string, patch: Partial<DraftLineForm>) => void
  onRemoveLine: (localKey: string) => void
}

export function BulkStockEntryLinesTable({
  lines,
  status,
  stockUnits,
  categories,
  onAddLine,
  onPatchLine,
  onRemoveLine,
}: Props) {
  const t = useTranslations("inventory")
  const thBase = bulkStockEntryThClass

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden lg:min-h-0">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-ui-medium text-muted-foreground">{t("bulkStockEntry.linesTitle")}</span>
        <button
          type="button"
          disabled={status === "POSTED"}
          onClick={onAddLine}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2.5 py-1.5 text-xs font-ui-medium hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("bulkStockEntry.addRow")}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-lg border border-border [scrollbar-gutter:stable]">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-left">
          <thead className="sticky top-0 z-10 border-b border-border bg-slate-100 shadow-sm dark:border-slate-700 dark:bg-slate-800/95">
            <tr>
              <th className={`${thBase} w-8 text-center`}>{t("bulkStockEntry.tableColNum")}</th>
              <th className={`${thBase} w-[5.75rem]`}>{t("bulkStockEntry.tableColSource")}</th>
              <th className={thBase}>{t("bulkStockEntry.colProduct")}</th>
              <th className={`${thBase} w-[5.5rem]`}>{t("bulkStockEntry.tableColQty")}</th>
              <th className={`${thBase} w-[6.5rem]`}>{t("bulkStockEntry.tableColInvoiceUnit")}</th>
              <th className={`${thBase} w-[10rem]`}>{t("bulkStockEntry.tableColUnitPrice")}</th>
              <th className={`${thBase} w-[5rem]`}>{t("bulkStockEntry.tableColLot")}</th>
              <th className={`${thBase} w-[8.5rem]`}>{t("bulkStockEntry.tableColExp")}</th>
              <th className={`${thBase} w-9 text-center`} aria-label={t("bulkStockEntry.tableRemoveColAria")} />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <BulkDraftTableRow
                key={line.localKey}
                line={line}
                idx={idx}
                lineCount={lines.length}
                status={status}
                stockUnits={stockUnits}
                categories={categories}
                onPatch={(patch) => onPatchLine(line.localKey, patch)}
                onRemove={() => onRemoveLine(line.localKey)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
