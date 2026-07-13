"use client"

import { Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import type { StockCategory, StockUnit } from "@/features/inventory/types"
import StockItemSelect from "@/features/inventory/components/StockItemSelect"
import { CategorySelectTree } from "@/features/inventory/components/CategorySelectTree"
import { bulkStockEntryCellClass } from "./bulkStockEntry.constants"
import type { DraftLineForm } from "./bulkStockEntry.types"

type Props = {
  line: DraftLineForm
  idx: number
  lineCount: number
  status: "DRAFT" | "POSTED" | null
  stockUnits: StockUnit[]
  categories: StockCategory[]
  onPatch: (patch: Partial<DraftLineForm>) => void
  onRemove: () => void
}

export function BulkDraftTableRow({
  line,
  idx,
  lineCount,
  status,
  stockUnits,
  categories,
  onPatch,
  onRemove,
}: Props) {
  const t = useTranslations("inventory")
  const cellIn = bulkStockEntryCellClass
  const disabled = status === "POSTED"

  return (
    <tr className="border-b border-border hover:bg-slate-50/80 border-border bg-card/40 dark:hover:bg-slate-800/50">
      <td className="px-1.5 py-1.5 align-top text-center text-xs text-muted-foreground tabular-nums">{idx + 1}</td>
      <td className="px-1.5 py-1.5 align-top">
        <select
          className={`${cellIn} max-w-[5.5rem]`}
          value={line.isNewProduct ? "new" : "existing"}
          onChange={(e) => {
            const isNew = e.target.value === "new"
            onPatch(
              isNew
                ? { isNewProduct: true, stock_item: "", stock_item_label: undefined }
                : { isNewProduct: false },
            )
          }}
          disabled={disabled}
        >
          <option value="existing">{t("bulkStockEntry.sourceExisting")}</option>
          <option value="new">{t("bulkStockEntry.sourceNew")}</option>
        </select>
      </td>
      <td className="min-w-[260px] max-w-[min(52vw,420px)] px-1.5 py-1.5 align-top">
        {!line.isNewProduct ? (
          <div className="[&_.mt-1]:mt-0">
            <StockItemSelect
              value={line.stock_item}
              prefetchedLabel={
                line.stock_item && line.stock_item_label
                  ? {
                      id: line.stock_item,
                      name: line.stock_item_label.name,
                      sku: line.stock_item_label.sku,
                    }
                  : null
              }
              onSelect={(item) =>
                onPatch({
                  stock_item: item.id,
                  temp_unit: item.unit,
                  stock_item_label: { name: item.name, sku: item.sku },
                })
              }
              disabled={disabled}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-1 gap-y-1">
            <input
              className={cellIn}
              placeholder={t("bulkStockEntry.rowProductPh")}
              value={line.temp_name}
              onChange={(e) => onPatch({ temp_name: e.target.value })}
              disabled={disabled}
            />
            <input
              className={cellIn}
              placeholder={t("bulkStockEntry.rowSkuPh")}
              value={line.temp_sku}
              onChange={(e) => onPatch({ temp_sku: e.target.value })}
              disabled={disabled}
            />
            <select
              className={cellIn}
              value={line.temp_unit}
              onChange={(e) => onPatch({ temp_unit: e.target.value })}
              disabled={disabled}
            >
              <option value="">{t("bulkStockEntry.rowUnitPh")}</option>
              {stockUnits.map((u) => (
                <option key={u.id} value={u.short_name}>
                  {u.short_name}
                </option>
              ))}
            </select>
            <div className="min-w-0 [&_button]:h-8 [&_button]:min-h-8 [&_button]:py-1 [&_button]:text-xs">
              <CategorySelectTree
                categories={categories}
                value={line.temp_category}
                onChange={(v) => onPatch({ temp_category: v })}
                placeholder={t("bulkStockEntry.rowCategoryPh")}
                className={`${cellIn} flex items-center`}
              />
            </div>
          </div>
        )}
      </td>
      <td className="w-[5.5rem] px-1.5 py-1.5 align-top">
        <input
          type="number"
          step="0.001"
          min="0"
          className={cellIn}
          placeholder="0"
          value={line.quantity}
          onChange={(e) => onPatch({ quantity: e.target.value })}
          disabled={disabled}
        />
      </td>
      <td className="w-[4.5rem] px-1.5 py-1.5 align-top">
        <select className={cellIn} value={line.unit} onChange={(e) => onPatch({ unit: e.target.value })} disabled={disabled}>
          <option value="">—</option>
          {stockUnits.map((u) => (
            <option key={u.id} value={u.short_name}>
              {u.short_name}
            </option>
          ))}
        </select>
      </td>
      <td className="w-[5rem] px-1.5 py-1.5 align-top">
        <input
          type="number"
          step="0.01"
          min="0"
          className={cellIn}
          placeholder="0"
          value={line.unit_price}
          onChange={(e) => onPatch({ unit_price: e.target.value })}
          disabled={disabled}
        />
      </td>
      <td className="w-[5rem] px-1.5 py-1.5 align-top">
        <input
          className={cellIn}
          placeholder={t("bulkStockEntry.rowLotPh")}
          value={line.lot_number}
          onChange={(e) => onPatch({ lot_number: e.target.value })}
          disabled={disabled}
        />
      </td>
      <td className="w-[8.5rem] px-1.5 py-1.5 align-top">
        <input type="date" className={cellIn} value={line.expiry_date} onChange={(e) => onPatch({ expiry_date: e.target.value })} disabled={disabled} />
      </td>
      <td className="w-9 px-0.5 py-1.5 align-top text-center">
        <button
          type="button"
          disabled={disabled || lineCount <= 1}
          onClick={onRemove}
          className="inline-flex rounded p-1 text-muted-foreground hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"
          aria-label={t("bulkStockEntry.rowRemoveAria")}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  )
}
