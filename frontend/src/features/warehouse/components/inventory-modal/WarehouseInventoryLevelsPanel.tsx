"use client"

import {
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  MoreVertical,
  Pencil,
  SlidersHorizontal,
  Trash2,
} from "lucide-react"
import { useTranslations } from "next-intl"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatQuantityWithUnit } from "@/lib/formatters"
import { formatMinimumQuantityDisplay } from "@/lib/stockMinimum"
import { parseApiError } from "@/lib/parseApiError"
import { clampTransferQty, parseTransferQtyInput, stockQtyPositive } from "./transferHelpers"
import { StockItemMovementsPanel } from "./StockItemMovementsPanel"
import type { WarehouseInventoryLevelsPanelProps } from "./inventoryModalProps"

export function WarehouseInventoryLevelsPanel({
  warehouseId,
  productGridClass,
  showTransferQtyColumn,
  headerSelectRef,
  allFilteredSelected,
  stockFiltered,
  setSelected,
  levels,
  inventoryLevelsData,
  isLoading,
  warehouseHasNoStockLines,
  isError,
  error,
  expandedStockItemId,
  selected,
  transferQtyByItem,
  setTransferQtyByItem,
  toggleSelected,
  toggleHistory,
  setEditQtyRow,
  setEditQtyInput,
  setEditQtyNotes,
  setEditMinRow,
  setEditMinInput,
  setRemoveRow,
  scrollRef,
  loadMoreSentinelRef,
  rowVirtualizer,
  virtualRows,
  hasNextPage,
  isFetchingNextPage,
  totalWarehouseCount,
  targetWarehouseId,
}: WarehouseInventoryLevelsPanelProps) {
  const t = useTranslations("warehouse.inventoryModal")

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/80 bg-background">
      <div
        className={`${productGridClass} shrink-0 border-b border-border bg-muted/80 text-xs font-semibold text-muted-foreground`}
      >
        <span className="flex justify-center">
          <input
            ref={headerSelectRef}
            type="checkbox"
            className="size-4 rounded accent-indigo-600"
            checked={allFilteredSelected}
            onChange={() => {
              if (allFilteredSelected) setSelected(new Set())
              else setSelected(new Set(stockFiltered.map((r) => r.stock_item)))
            }}
            title={t("headerCheckboxTitle")}
            aria-label={t("headerCheckboxAria")}
          />
        </span>
        <span>{t("colProduct")}</span>
        <span>{t("colSku")}</span>
        <span className="text-right">{t("colQuantity")}</span>
        {showTransferQtyColumn ? <span className="text-center">{t("colTransferQty")}</span> : null}
        <span className="text-right">{t("colMinimum")}</span>
        <span className="text-center">{t("colMovement")}</span>
        <span className="text-center text-xs font-normal text-muted-foreground">{t("colActions")}</span>
      </div>

      {isLoading && !inventoryLevelsData?.pages?.length ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
          <span>{t("loading")}</span>
        </div>
      ) : warehouseHasNoStockLines ? (
        <div className="flex flex-1 items-center justify-center px-4 py-16 text-center text-sm text-muted-foreground">
          {t("emptyNoStock")}
        </div>
      ) : levels.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 py-16 text-center text-sm text-muted-foreground">
          {isError ? parseApiError(error) : t("emptyNoFilterMatch")}
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
            <div
              className="relative w-full"
              style={{ height: rowVirtualizer.getTotalSize() }}
              role="presentation"
            >
              {virtualRows.map((vi) => {
                const r = levels[vi.index]
                if (!r) return null
                const expanded = expandedStockItemId === r.stock_item
                return (
                  <div
                    key={vi.key}
                    data-index={vi.index}
                    ref={rowVirtualizer.measureElement}
                    className="absolute left-0 top-0 w-full border-b border-border bg-background hover:bg-muted/40"
                    style={{ transform: `translateY(${vi.start}px)` }}
                  >
                    <div className={productGridClass}>
                      <div className="flex justify-center">
                        <input
                          type="checkbox"
                          className="size-4 rounded accent-indigo-600"
                          checked={selected.has(r.stock_item)}
                          disabled={!stockQtyPositive(r)}
                          onChange={() => toggleSelected(r.stock_item)}
                          aria-label={t("rowSelectAria", { name: r.stock_item_name })}
                        />
                      </div>
                      <div className="min-w-0 font-medium text-foreground">{r.stock_item_name}</div>
                      <div className="min-w-0 truncate font-mono text-xs text-muted-foreground">{r.stock_item_sku}</div>
                      <div className="text-right text-foreground">
                        {formatQuantityWithUnit(r.quantity, r.stock_item_unit)}
                      </div>
                      {showTransferQtyColumn ? (
                        <div className="flex min-w-0 items-center justify-end gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            className="w-full min-w-[3.25rem] max-w-[5.5rem] rounded border border-border bg-background px-1.5 py-1 text-right text-xs tabular-nums outline-none ring-blue-500/20 focus:border-blue-500 focus:ring-1"
                            value={transferQtyByItem[r.stock_item] ?? "0"}
                            onChange={(e) =>
                              setTransferQtyByItem((prev) => ({
                                ...prev,
                                [r.stock_item]: e.target.value,
                              }))
                            }
                            onBlur={() => {
                              if (!stockQtyPositive(r)) return
                              const q = clampTransferQty(
                                r,
                                parseTransferQtyInput(transferQtyByItem[r.stock_item] ?? "0"),
                              )
                              setTransferQtyByItem((prev) => ({
                                ...prev,
                                [r.stock_item]: q === 0 ? "0" : String(q),
                              }))
                            }}
                            aria-label={t("transferQtyAria", { name: r.stock_item_name })}
                            disabled={!stockQtyPositive(r)}
                          />
                          <button
                            type="button"
                            title={t("transferQtyFillRowTitle")}
                            className="shrink-0 rounded border border-border px-1 py-0.5 text-2xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
                            disabled={!stockQtyPositive(r)}
                            onClick={() =>
                              setTransferQtyByItem((prev) => ({
                                ...prev,
                                [r.stock_item]: String(r.quantity),
                              }))
                            }
                          >
                            {t("transferQtyFillRow")}
                          </button>
                        </div>
                      ) : null}
                      <div className="text-right text-muted-foreground">
                        {formatMinimumQuantityDisplay(r.minimum_quantity, r.stock_item_unit)}
                      </div>
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => toggleHistory(r.stock_item)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/80"
                        >
                          <History className="size-3.5" />
                          {t("history")}
                          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                        </button>
                      </div>
                      <div className="flex justify-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            type="button"
                            className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted/80"
                            aria-label={t("rowActionsAria", { name: r.stock_item_name })}
                          >
                            <MoreVertical className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditQtyRow(r)
                                setEditQtyInput(String(r.quantity))
                                setEditQtyNotes("")
                              }}
                            >
                              <Pencil className="mr-2 size-4" />
                              {t("menuUpdateQty")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditMinRow(r)
                                setEditMinInput(String(r.minimum_quantity))
                              }}
                            >
                              <SlidersHorizontal className="mr-2 size-4" />
                              {t("menuMinThreshold")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-rose-600 focus:text-rose-600 dark:text-rose-400"
                              onClick={() => setRemoveRow(r)}
                            >
                              <Trash2 className="mr-2 size-4" />
                              {t("menuRemoveWarehouse")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    {expanded ? (
                      <div className="border-t border-border bg-muted/40 px-4 pb-4 pt-2">
                        <StockItemMovementsPanel stockItemId={r.stock_item} warehouseId={warehouseId} />
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
            {hasNextPage ? (
              <div
                ref={loadMoreSentinelRef}
                className="flex min-h-12 shrink-0 items-center justify-center py-3"
                aria-hidden={!isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label={t("loadingMoreAria")} />
                ) : null}
              </div>
            ) : null}
          </div>
          <p className="shrink-0 border-t border-border bg-muted/50 px-4 py-2 text-center text-xs text-muted-foreground">
            {t(targetWarehouseId ? "footerHintWithTransfer" : "footerHint", {
              filtered: levels.length,
              loaded: levels.length,
              total: totalWarehouseCount,
            })}
            {hasNextPage ? (
              <>
                {" "}
                <span className="text-muted-foreground/90">{t("loadingMoreHint")}</span>
              </>
            ) : null}
          </p>
        </>
      )}
    </div>
  )
}
