"use client"

import React from "react"
import { Search, Filter, Calendar, RotateCw } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { AsyncPdfExportButton } from "@/components/AsyncPdfExportButton"
import { CategorySelectTree } from "./CategorySelectTree"
import { useTranslations } from "next-intl"
import type { StockCategory } from "@/features/inventory/types"

interface InventoryFiltersProps {
  activeTab: string
  searchTerm: string
  setSearchTerm: (v: string) => void
  selectedWarehouseId: string | null
  setSelectedWarehouseId: (v: string | null) => void
  selectedCategoryId: string | null
  setSelectedCategoryId: (v: string | null) => void
  stockStatus: string
  setStockStatus: (v: string) => void
  warehouses: { id: string; name: string; code?: string }[]
  categories: StockCategory[]
  startDate: string
  setStartDate: (v: string) => void
  endDate: string
  setEndDate: (v: string) => void
  movementTypeFilter: string
  setMovementTypeFilter: (v: string) => void
  exportReportSlug?: string | null
  exportParams?: Record<string, unknown>
  onRefresh?: () => void
  isLoading: boolean
}

export function InventoryFilters({
  activeTab,
  searchTerm,
  setSearchTerm,
  selectedWarehouseId,
  setSelectedWarehouseId,
  selectedCategoryId,
  setSelectedCategoryId,
  stockStatus,
  setStockStatus,
  warehouses,
  categories,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  movementTypeFilter,
  setMovementTypeFilter,
  exportReportSlug,
  exportParams,
  onRefresh,
  isLoading
}: InventoryFiltersProps) {
  const t = useTranslations("inventory")
  return (
    <div className="p-3 border-b border-border flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50 dark:bg-slate-800/40 dark:border-slate-800 shrink-0">
      <div className="relative w-full md:w-80">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder={t("filters.searchPlaceholder")}
          className="pl-8 bg-white dark:bg-slate-800 dark:border-slate-700 h-[34px] text-xs"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
        {(activeTab === 'items' || activeTab === 'fefo_report') && (
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="w-48 relative">
              <select
                className="w-full bg-white border border-border rounded-md px-2.5 py-1 text-xs outline-none dark:bg-slate-800 dark:border-slate-700 h-[34px]"
                value={selectedWarehouseId || ""}
                onChange={(e) => setSelectedWarehouseId(e.target.value || null)}
              >
                <option value="">{t("filters.allWarehouses")}</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div className="w-64 relative">
              <CategorySelectTree
                categories={categories}
                value={selectedCategoryId || ""}
                onChange={(val) => setSelectedCategoryId(val || null)}
                placeholder={t("filters.allCategories")}
                className="bg-white border border-border rounded-md px-2.5 py-1 text-xs outline-none dark:bg-slate-800 dark:border-slate-700 h-[34px]"
              />
            </div>

            <div className="w-40 relative">
              <select
                className="w-full bg-white border border-border rounded-md px-2.5 py-1 text-xs outline-none dark:bg-slate-800 dark:border-slate-700 h-[34px]"
                value={stockStatus}
                onChange={(e) => setStockStatus(e.target.value)}
              >
                <option value="">{t("filters.allStatuses")}</option>
                <option value="normal">{t("filters.statusNormal")}</option>
                <option value="low">{t("filters.statusLow")}</option>
                <option value="critical">{t("filters.statusCritical")}</option>
                <option value="warning">{t("filters.statusWarning")}</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === 'movements' && (
          <div className="flex flex-wrap items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="date"
              className="w-32 h-[34px] bg-white dark:bg-slate-800 dark:border-slate-700 text-xs px-2"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <span className="text-muted-foreground text-xs">-</span>
            <Input
              type="date"
              className="w-32 h-[34px] bg-white dark:bg-slate-800 dark:border-slate-700 text-xs px-2"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <select
              className="bg-white border border-border rounded-md px-2.5 py-1 text-xs outline-none ml-1 dark:bg-slate-800 dark:border-slate-700 h-[34px]"
              value={movementTypeFilter}
              onChange={(e) => setMovementTypeFilter(e.target.value)}
            >
              <option value="ALL">{t("filters.allMovements")}</option>
              <option value="IN">{t("filters.movementsIn")}</option>
              <option value="OUT">{t("filters.movementsOut")}</option>
              <option value="ADJUSTMENT">{t("filters.movementsAdjust")}</option>
              <option value="WASTE">{t("filters.movementsWaste")}</option>
              <option value="RETURN">{t("filters.movementsReturn")}</option>
              <option value="CANCEL">{t("filters.movementsCancel")}</option>
              <option value="DISPOSAL">{t("filters.movementsDisposal")}</option>
            </select>
          </div>
        )}

        {['items', 'movements', 'suppliers', 'fefo_report'].includes(activeTab) && (
          <div className="flex items-center gap-2 ml-auto">
            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isLoading}
                className="h-[34px] px-3 gap-2 border-border hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                title={t("filters.refreshTitle")}
              >
                <RotateCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                {t("filters.refresh")}
              </Button>
            )}
            {exportReportSlug && (
              <AsyncPdfExportButton
                reportSlug={exportReportSlug}
                params={exportParams}
                filename={`${exportReportSlug}-${new Date().toISOString().split("T")[0]}.pdf`}
                size="sm"
                className="h-[34px] px-3 gap-2 text-blue-600 border-blue-200 hover:bg-blue-50 dark:border-blue-900/40 dark:hover:bg-blue-950/30"
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
