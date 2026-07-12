"use client"

import { Search, Truck, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import type { WarehouseInventoryToolbarProps } from "./inventoryModalProps"

export function WarehouseInventoryToolbar({
  filter,
  setFilter,
  targetWarehouseId,
  setTargetWarehouseId,
  transferDate,
  setTransferDate,
  targetOptions,
  handleTransferSelected,
  handleOpenTransferAllDialog,
  clearSelection,
  createMutIsPending,
  selectedRowsLength,
  prefetchTransferAll,
  transferAllCountLabel,
}: WarehouseInventoryToolbarProps) {
  const t = useTranslations("warehouse.inventoryModal")

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none ring-blue-500/20 focus:border-blue-500 focus:ring-2"
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/90 bg-muted/50 p-3">
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs font-ui-medium text-muted-foreground">{t("targetWarehouse")}</label>
          <select
            value={targetWarehouseId}
            onChange={(e) => setTargetWarehouseId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          >
            <option value="">{t("selectPlaceholder")}</option>
            {targetOptions.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>
        </div>
        <div className="w-[150px]">
          <label className="mb-1 block text-xs font-ui-medium text-muted-foreground">{t("transferDate")}</label>
          <input
            type="date"
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleTransferSelected}
            disabled={createMutIsPending || selectedRowsLength === 0 || !targetWarehouseId}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-ui-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            <Truck className="size-4" />
            {t("transferSelected", { count: selectedRowsLength })}
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-muted/80"
          >
            {t("clearSelection")}
          </button>
          <button
            type="button"
            onClick={handleOpenTransferAllDialog}
            disabled={createMutIsPending || prefetchTransferAll || !targetWarehouseId}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-ui-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200 dark:hover:bg-indigo-900/50"
          >
            {prefetchTransferAll ? (
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Truck className="size-4" />
            )}
            {t("transferAllStock", { count: transferAllCountLabel })}
          </button>
        </div>
      </div>
    </>
  )
}
