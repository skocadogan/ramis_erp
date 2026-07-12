"use client"

import { memo } from "react"
import { VirtualTable } from "@/components/ui/virtual-table"
import {
  RotateCcw, Trash2, Edit, Loader2, MoreHorizontal, History,
  ExternalLink, ArrowDownToLine, ArrowUpFromLine, Plus, Minus, AlertTriangle
} from "lucide-react"
import { StockItem, type StockMovement } from "@/features/inventory/types"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatAmount } from "@/lib/formatters"
import { formatMinimumQuantityDisplay } from "@/lib/stockMinimum"
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts"
import { useMatchMedia } from "@/hooks/useMatchMedia"
import {
  getInventoryVirtualOverscan,
  INVENTORY_ITEM_ROW_ESTIMATE_PX,
  INVENTORY_VIRTUAL_LG_QUERY,
} from "@/features/inventory/components/inventoryTableVirtual"
import { useTranslations } from "next-intl"

const ITEM_COL_SPAN = 11

const inventoryTableHeadClass =
  "sticky top-0 z-10 border-b border-border bg-muted text-muted-foreground"

const inventoryTableContainerClass =
  "flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-border"

const inventoryTableRowClass =
  "[&_tbody_tr]:border-b [&_tbody_tr]:border-border [&_tbody_tr]:transition-colors [&_tbody_tr]:hover:bg-muted/20"

type MovementType = StockMovement["movement_type"]

interface ItemsTableProps {
  stockItems: StockItem[]
  openMovementModal: (item: StockItem, type: MovementType) => void
  openEditItem: (item: StockItem) => void
  openCostHistory: (item: StockItem) => void
  openStockItemDetail: (item: StockItem) => void
  openDeleteStockItem: (item: StockItem) => void
  fetchNextPage: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isLoading: boolean
}

function StockStatusBadge({
  currentQuantity,
  minimumQuantity,
  physicalQuantity = 0,
}: {
  currentQuantity: number
  minimumQuantity: number
  physicalQuantity?: number
}) {
  const t = useTranslations("inventory")
  const isUnlimited = minimumQuantity === -1 // Sınırsız ürünlerin min miktarı -1 olarak tanımlanmıştır.

  if (isUnlimited) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-2xs font-ui-medium text-slate-600 dark:bg-slate-800 dark:text-muted-foreground">
        {t("itemsTable.notTracked")}
      </span>
    )
  }

  // Özel durum: Fiziksel stok var ama rezerve edildiği için kullanılamıyor (Available <= 0)
  if (physicalQuantity > 0 && currentQuantity <= 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-2xs font-ui-bold text-white">
        <RotateCcw size={10} className="animate-spin-slow" /> {t("itemsTable.reservedDepleted")}
      </span>
    )
  }

  if (currentQuantity < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 py-0.5 text-2xs font-ui-bold text-white">
        <AlertTriangle size={10} /> {t("itemsTable.negative")}
      </span>
    )
  }
  if (currentQuantity === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-2xs font-ui-bold text-white">
        <AlertTriangle size={10} /> {t("itemsTable.depleted")}
      </span>
    )
  }
  if (currentQuantity < minimumQuantity) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-2xs font-ui-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
        <AlertTriangle size={10} /> {t("itemsTable.lowStock")}
      </span>
    )
  }
  if (currentQuantity === minimumQuantity) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 text-2xs font-ui-semibold text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800">
        <AlertTriangle size={10} /> {t("itemsTable.atThreshold")}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-2xs font-ui-medium text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900">
      {t("itemsTable.adequate")}
    </span>
  )
}

const ItemRowCells = ({
  item,
  openMovementModal,
  openEditItem,
  openCostHistory,
  openStockItemDetail,
  openDeleteStockItem,
}: {
  item: StockItem
  openMovementModal: (item: StockItem, type: MovementType) => void
  openEditItem: (item: StockItem) => void
  openCostHistory: (item: StockItem) => void
  openStockItemDetail: (item: StockItem) => void
  openDeleteStockItem: (item: StockItem) => void
}) => {
  const t = useTranslations("inventory")
  const canViewAmounts = useCanViewAmounts()
  const minQty = item.effective_minimum ?? item.minimum_quantity
  const isUnlimited = minQty === -1

  return (
    <>
      <td className="px-4 py-2">
        <button
          type="button"
          onClick={() => openStockItemDetail(item)}
          className="text-left font-ui-medium text-foreground underline-offset-2 hover:text-emerald-600 hover:underline"
        >
          {item.name}
        </button>
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-col">
          <span className="text-foreground">{item.category_name}</span>
          <span className="text-2xs text-muted-foreground font-mono uppercase dark:text-muted-foreground">{item.category_code}</span>
        </div>
      </td>
      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{item.sku}</td>
      <td className="px-4 py-2 text-muted-foreground">{item.unit}</td>
      <td className="px-4 py-2 text-right">
        <span className="text-muted-foreground font-ui-medium">
          {isUnlimited ? "—" : (item.physical_quantity || 0).toFixed(2)}
        </span>
      </td>
      <td className="px-4 py-2 text-right">
        <span className="text-amber-600 dark:text-amber-500 font-ui-semibold">
          {isUnlimited ? "—" : ((item.reserved_quantity || 0) > 0 ? `-${(item.reserved_quantity || 0).toFixed(2)}` : "0.00")}
        </span>
      </td>
      <td className="px-4 py-2 text-right">
        {isUnlimited ? (
          <span className="text-muted-foreground italic text-xs">{t("itemsTable.unlimited")}</span>
        ) : (
          <button
            type="button"
            onClick={() => openStockItemDetail(item)}
            className="group flex items-center justify-end gap-1.5 ml-auto"
          >
            <span className={`font-ui-bold ${item.current_quantity <= 0 ? "text-rose-600" : "text-blue-600"} transition-colors`}>
              {item.current_quantity.toFixed(2)}
            </span>
            <span className="text-2xs text-muted-foreground font-ui-medium">{item.unit}</span>
            <ExternalLink size={10} className="text-slate-300 group-hover:text-blue-400 transition-colors" />
          </button>
        )}
      </td>
      <td className="px-4 py-2 text-right text-muted-foreground tabular-nums text-xs">
        {formatMinimumQuantityDisplay(item.effective_minimum ?? item.minimum_quantity, item.unit)}
      </td>
      <td className="px-4 py-2 text-right text-muted-foreground text-xs">
        {formatAmount((item.last_purchase_price || 0), canViewAmounts)}
      </td>
      <td className="px-4 py-2 text-center">
        <StockStatusBadge
          currentQuantity={item.current_quantity}
          physicalQuantity={item.physical_quantity || 0}
          minimumQuantity={item.effective_minimum ?? item.minimum_quantity}
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center justify-end gap-1">
          {/* Quick Actions */}
          <button
            onClick={() => openMovementModal(item, "IN")}
            className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
            title={t("itemsTable.quickInTitle")}
          >
            <Plus size={16} />
          </button>
          <button
            onClick={() => openMovementModal(item, "OUT")}
            className="p-1.5 rounded-md text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            title={t("itemsTable.quickOutTitle")}
          >
            <Minus size={16} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="p-1.5 rounded-md text-muted-foreground hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center ml-auto">
              <MoreHorizontal size={18} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t("itemsTable.menuLabel")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => openMovementModal(item, "IN")} className="text-emerald-600 dark:text-emerald-400">
                  <ArrowDownToLine className="mr-2 h-4 w-4" /> {t("itemsTable.stockIn")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openMovementModal(item, "OUT")} className="text-blue-600 dark:text-blue-400">
                  <ArrowUpFromLine className="mr-2 h-4 w-4" /> {t("itemsTable.stockOut")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openMovementModal(item, "ADJUSTMENT")} className="text-amber-600 dark:text-amber-400">
                  <RotateCcw className="mr-2 h-4 w-4" /> {t("itemsTable.stockAdjust")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openMovementModal(item, "WASTE")} className="text-rose-600 dark:text-rose-400">
                  <Trash2 className="mr-2 h-4 w-4" /> {t("itemsTable.menuWaste")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => openCostHistory(item)}>
                  <History className="mr-2 h-4 w-4" /> {t("itemsTable.costHistory")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openEditItem(item)}>
                  <Edit className="mr-2 h-4 w-4" /> {t("itemsTable.edit")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => openDeleteStockItem(item)}
                  className="text-rose-600 dark:text-rose-400 focus:text-rose-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> {t("itemsTable.delete")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </>
  )
}

export const ItemsTable = memo(({
  stockItems,
  openMovementModal,
  openEditItem,
  openCostHistory,
  openStockItemDetail,
  openDeleteStockItem,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isLoading
}: ItemsTableProps) => {
  const t = useTranslations("inventory")
  const isLg = useMatchMedia(INVENTORY_VIRTUAL_LG_QUERY, false)
  const overscan = getInventoryVirtualOverscan(isLg, "items")

  if (isLoading && stockItems.length === 0) {
    return (
      <div className={inventoryTableContainerClass}>
        <table className={`w-full text-sm ${inventoryTableRowClass}`}>
          <thead className={inventoryTableHeadClass}>
            <tr>
              <th className="text-left px-4 py-2 font-ui-medium">{t("itemsTable.colProduct")}</th>
              <th className="text-left px-4 py-2 font-ui-medium">{t("itemsTable.colCategory")}</th>
              <th className="text-left px-4 py-2 font-ui-medium">{t("itemsTable.colSku")}</th>
              <th className="text-left px-4 py-2 font-ui-medium">{t("itemsTable.colUnit")}</th>
              <th className="text-right px-4 py-2 font-ui-medium">{t("itemsTable.colPhysical")}</th>
              <th className="text-right px-4 py-2 font-ui-medium">{t("itemsTable.colReserved")}</th>
              <th className="text-right px-4 py-2 font-ui-medium">{t("itemsTable.colAvailable")}</th>
              <th className="text-right px-4 py-2 font-ui-medium">{t("itemsTable.colMinShort")}</th>
              <th className="text-right px-4 py-2 font-ui-medium">{t("itemsTable.colLastIn")}</th>
              <th className="text-center px-4 py-2 font-ui-medium">{t("itemsTable.colStatus")}</th>
              <th className="text-right px-4 py-2 font-ui-medium">{t("itemsTable.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={ITEM_COL_SPAN} className="text-center py-12"><Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" /></td></tr>
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <VirtualTable
      rows={stockItems}
      estimateSize={() => INVENTORY_ITEM_ROW_ESTIMATE_PX}
      overscan={overscan}
      fetchMore={fetchNextPage}
      hasMore={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      className={inventoryTableContainerClass}
      tableClassName={`text-sm ${inventoryTableRowClass} [&_thead]:bg-muted [&_thead]:text-muted-foreground [&_thead_tr]:bg-muted [&_thead_th]:bg-muted`}
      header={
        <thead className={inventoryTableHeadClass}>
          <tr>
            <th className="text-left px-4 py-2 font-ui-medium">{t("itemsTable.colProduct")}</th>
            <th className="text-left px-4 py-2 font-ui-medium">{t("itemsTable.colCategory")}</th>
            <th className="text-left px-4 py-2 font-ui-medium">{t("itemsTable.colSku")}</th>
            <th className="text-left px-4 py-2 font-ui-medium">{t("itemsTable.colUnit")}</th>
            <th className="text-right px-4 py-2 font-ui-medium">{t("itemsTable.colPhysical")}</th>
            <th className="text-right px-4 py-2 font-ui-medium">{t("itemsTable.colReserved")}</th>
            <th className="text-right px-4 py-2 font-ui-medium">{t("itemsTable.colAvailable")}</th>
            <th className="text-right px-4 py-2 font-ui-medium">{t("itemsTable.colMinShort")}</th>
            <th className="text-right px-4 py-2 font-ui-medium">{t("itemsTable.colLastIn")}</th>
            <th className="text-center px-4 py-2 font-ui-medium">{t("itemsTable.colStatus")}</th>
            <th className="text-right px-4 py-2 font-ui-medium">{t("itemsTable.colActions")}</th>
          </tr>
        </thead>
      }
      renderRow={(item) => (
        <ItemRowCells
          item={item}
          openMovementModal={openMovementModal}
          openEditItem={openEditItem}
          openCostHistory={openCostHistory}
          openStockItemDetail={openStockItemDetail}
          openDeleteStockItem={openDeleteStockItem}
        />
      )}
      emptyState={
        <div className={inventoryTableContainerClass}>
          <table className={`w-full text-sm ${inventoryTableRowClass}`}>
            <thead className={inventoryTableHeadClass}>
              <tr>
                <th className="text-left px-4 py-2 font-ui-medium">{t("itemsTable.colProduct")}</th>
                <th className="text-left px-4 py-2 font-ui-medium">{t("itemsTable.colCategory")}</th>
                <th className="text-left px-4 py-2 font-ui-medium">{t("itemsTable.colSku")}</th>
                <th className="text-left px-4 py-2 font-ui-medium">{t("itemsTable.colUnit")}</th>
                <th className="text-right px-4 py-2 font-ui-medium">{t("itemsTable.colPhysical")}</th>
                <th className="text-right px-4 py-2 font-ui-medium">{t("itemsTable.colReserved")}</th>
                <th className="text-right px-4 py-2 font-ui-medium">{t("itemsTable.colAvailable")}</th>
                <th className="text-right px-4 py-2 font-ui-medium">{t("itemsTable.colMinShort")}</th>
                <th className="text-right px-4 py-2 font-ui-medium">{t("itemsTable.colLastIn")}</th>
                <th className="text-center px-4 py-2 font-ui-medium">{t("itemsTable.colStatus")}</th>
                <th className="text-right px-4 py-2 font-ui-medium">{t("itemsTable.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={ITEM_COL_SPAN} className="text-center py-12 text-muted-foreground dark:text-muted-foreground">{t("itemsTable.empty")}</td></tr>
            </tbody>
          </table>
        </div>
      }
      loadingMore={
        <tr>
          <td colSpan={ITEM_COL_SPAN} className="py-4 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-emerald-600" />
          </td>
        </tr>
      }
    />
  )
})
ItemsTable.displayName = "ItemsTable"
