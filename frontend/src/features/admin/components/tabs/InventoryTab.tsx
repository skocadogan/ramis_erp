"use client"

import { Package, Search, AlertTriangle, Warehouse as WarehouseIcon, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import type { StockItem as InventoryStockItem } from "@/features/inventory/types"
import type { Warehouse } from "@/features/warehouse/types"
import { formatMinimumQuantityDisplay } from "@/lib/stockMinimum"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table"
import { useAuthStore } from "@/store/useAuthStore"
import { hasPermission } from "@/lib/constants"

export type StockItem = Pick<InventoryStockItem, "id" | "name" | "sku" | "current_quantity" | "minimum_quantity" | "is_low_stock" | "unit">

interface InventoryTabProps {
  stockItems: StockItem[]
  searchTerm: string
  setSearchTerm: (s: string) => void
  warehouses: Warehouse[]
  selectedWarehouseId: string
  onWarehouseChange: (id: string) => void
  fetchNextPage: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isLoading: boolean
}

const INVENTORY_ROW_ESTIMATE_PX = 48

export function InventoryTab({
  stockItems,
  searchTerm,
  setSearchTerm,
  warehouses,
  selectedWarehouseId,
  onWarehouseChange,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
}: InventoryTabProps) {
  const t = useTranslations("admin")
  const user = useAuthStore((s) => s.user)
  const canManage = hasPermission(user?.permissions, user?.is_superuser, "inventory.manage_stock_item")

  // Loading skeleton
  if (isLoading && stockItems.length === 0) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground uppercase tracking-tight">{t('inventory.title')}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{t('inventory.description')}</p>
          </div>
        </div>
        {/* Table skeleton */}
        <div className="rounded-2xl border border-border shadow-sm overflow-hidden bg-card border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted border-border">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t('inventory.table.item')}</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t('inventory.table.sku')}</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">{t('inventory.table.current')}</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">{t('inventory.table.min')}</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">{t('inventory.table.status')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="text-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-foreground uppercase tracking-tight">{t('inventory.title')}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('inventory.description')}
          </p>
        </div>
        {canManage && (
          <Link href="/inventory" className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition-colors dark:bg-blue-900/40 dark:text-blue-400 dark:hover:bg-blue-900/60">
            <Package size={16} />{t('inventory.goToPage')}
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 shrink-0">
        <div className="relative flex-1 max-w-md w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('inventory.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 bg-card border-border text-foreground dark:placeholder:"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <WarehouseIcon size={16} className="text-muted-foreground shrink-0" />
          <Select value={selectedWarehouseId || "all"} onValueChange={(val) => onWarehouseChange(val === "all" || !val ? "" : val)}>
            <SelectTrigger className="w-full sm:w-[240px] border-border text-sm h-10 bg-card border-border text-foreground">
              <span className="truncate">
                {selectedWarehouseId
                  ? warehouses.find(w => w.id === selectedWarehouseId)?.name
                  : t('inventory.allWarehouses')}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-sm font-semibold text-muted-foreground italic">
                {t('inventory.allWarehouses')}
              </SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id} className="text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium">{w.name}</span>
                    <span className="text-2xs text-muted-foreground truncate">{w.code}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <VirtualTable
        rows={stockItems}
        estimateSize={() => INVENTORY_ROW_ESTIMATE_PX}
        overscan={10}
        fetchMore={fetchNextPage}
        hasMore={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        className="flex flex-col flex-1 min-h-0 min-w-0 rounded-2xl border border-border shadow-sm bg-card border-border"
        tableClassName="text-sm"
        header={
          <thead className={virtualTableStickyHeadClass}>
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t('inventory.table.item')}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t('inventory.table.sku')}</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">{t('inventory.table.current')}</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">{t('inventory.table.min')}</th>
              <th className="text-center px-4 py-3 font-semibold text-muted-foreground">{t('inventory.table.status')}</th>
            </tr>
          </thead>
        }
        renderRow={(item) => (
          <>
            <td className="px-4 py-3 font-medium text-foreground">{item.name}</td>
            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.sku}</td>
            <td className="px-4 py-3 text-right font-semibold text-foreground">
              {item.current_quantity.toFixed(2)}
              <span className="text-xs font-normal text-foreground ml-0.5">{item.unit}</span>
            </td>
            <td className="px-4 py-3 text-right text-foreground">
              {formatMinimumQuantityDisplay(item.minimum_quantity)}
              <span className="text-xs font-normal text-foreground ml-0.5">{item.unit}</span>
            </td>
            <td className="px-4 py-3 text-center">
              {item.is_low_stock ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                  <AlertTriangle size={12} />{t('inventory.status.low')}
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                  {t('inventory.status.normal')}
                </span>
              )}
            </td>
          </>
        )}
        emptyState={
          <div className="flex flex-col flex-1 min-h-0 min-w-0 rounded-2xl border border-border border-border bg-card">
            <table className="w-full text-sm">
              <thead className={virtualTableStickyHeadClass}>
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t('inventory.table.item')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t('inventory.table.sku')}</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">{t('inventory.table.current')}</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">{t('inventory.table.min')}</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">{t('inventory.table.status')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted-foreground">
                    {t('inventory.empty')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        }
        loadingMore={
          <tr>
            <td colSpan={5} className="py-4 text-center">
              <Loader2 className="h-5 w-5 animate-spin mx-auto text-blue-600" />
            </td>
          </tr>
        }
      />
    </div>
  )
}
