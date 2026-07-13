"use client";

import React, { useCallback, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Card, CardContent } from "@/components/ui/card"
import { AppShell } from "@/components/shell/AppShell"
import { BranchSelect } from "@/features/branches/components/BranchSelect"

// Inventory tablo bileşenleri — sadece sekmeye tıklandığında yüklenir.
// Sayfa açıldığında aktif olmayan tablonun (ItemsTable ~352 satır, FEFOReportTable ~321 satır,
// CategoryTreeView ~295 satır, vb.) tüm modülü ilk chunk'a girmesin.
const ItemsTable = dynamic(
  () => import("@/features/inventory/components/ItemsTable").then(m => m.ItemsTable),
  { ssr: false, loading: () => <div className="flex-1 min-h-0 bg-card animate-pulse" /> }
)
const MovementsTable = dynamic(
  () => import("@/features/inventory/components/MovementsTable").then(m => m.MovementsTable),
  { ssr: false, loading: () => <div className="flex-1 min-h-0 bg-card animate-pulse" /> }
)
const SuppliersTable = dynamic(
  () => import("@/features/inventory/components/SuppliersTable").then(m => m.SuppliersTable),
  { ssr: false, loading: () => <div className="flex-1 min-h-0 bg-card animate-pulse" /> }
)
const CategoryTreeView = dynamic(
  () => import("@/features/inventory/components/CategoryTreeView").then(m => m.CategoryTreeView),
  { ssr: false, loading: () => <div className="flex-1 min-h-0 bg-card animate-pulse" /> }
)
const UnitsTable = dynamic(
  () => import("@/features/inventory/components/UnitsTable").then(m => m.UnitsTable),
  { ssr: false, loading: () => <div className="flex-1 min-h-0 bg-card animate-pulse" /> }
)
const FEFOReportTable = dynamic(
  () => import("@/features/inventory/components/FEFOReportTable").then(m => m.FEFOReportTable),
  { ssr: false, loading: () => <div className="flex-1 min-h-0 bg-card animate-pulse" /> }
)
const InventoryHeader = dynamic(
  () => import("@/features/inventory/components/InventoryHeader").then(m => m.InventoryHeader),
  { ssr: false, loading: () => <div className="h-9 w-24 bg-muted animate-pulse rounded" /> }
)
const InventoryFilters = dynamic(
  () => import("@/features/inventory/components/InventoryFilters").then(m => m.InventoryFilters),
  { ssr: false, loading: () => <div className="h-12 bg-card animate-pulse rounded" /> }
)
// InventoryModuleNav her render'da kullanılıyor (üst+yan nav) — sadece nav, bu yüzden eager.
import {
  InventoryModuleNavHorizontal,
  InventoryModuleNavVertical,
} from "@/features/inventory/components/InventoryModuleNav"

// Modals: CostHistoryModal (PDF), StockItemStockDetailModal (infinite scroll hareketler) vb.
// ağır modal'lar içeriyor. InventoryModals zaten "open" state'ine göre render ediyor
// — biz de lazy yükleyerek ilk boyutu azaltıyoruz.
const InventoryModals = dynamic(
  () => import("@/features/inventory/components/InventoryModals").then(m => m.InventoryModals),
  { ssr: false }
)

// Custom Hooks
import { useInventory } from "@/features/inventory/hooks/useInventory"
import { useInventoryActions } from "@/features/inventory/hooks/useInventoryActions"
import { useInventoryModalManager } from "@/features/inventory/hooks/useInventoryModalManager"
import { useFEFOReport } from "@/features/inventory/hooks/useFEFOReport"

// Types
import { StockItem } from "@/features/inventory/types"
import type { Supplier, SupplierDetailTab } from "@/features/inventory/types"
import type { DraftLineForm } from "@/features/inventory/components/bulk-stock-entry/bulkStockEntry.types"
import { newLocalKey } from "@/features/inventory/components/bulk-stock-entry/bulkStockEntry.utils"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { useTranslations } from "next-intl"
import { isQuantityBelowMinimum } from "@/lib/stockMinimum"
import { InventoryStats } from "@/features/inventory/components/InventoryStats"
import { ExpiryRiskWidget } from "@/features/warehouse/components/ExpiryRiskWidget"

export default function InventoryPage() {
  return (
    <AuthGuard module="inventory" mode="manage">
      <InventoryPageContent />
    </AuthGuard>
  )
}

function InventoryPageContent() {
  const t = useTranslations("inventory")
  const [branchId, setBranchId] = useState<string>("ALL")
  const scopedBranchId = branchId !== "ALL" ? branchId : undefined
  const inventory = useInventory(scopedBranchId)
  const actions = useInventoryActions({
    showToast: inventory.showToast,
    fetchData: inventory.refreshAll
  })
  const modals = useInventoryModalManager()
  const [perfSupplier, setPerfSupplier] = React.useState<Supplier | null>(null)
  const [detailSupplier, setDetailSupplier] = React.useState<Supplier | null>(null)
  const [detailTab, setDetailTab] = React.useState<SupplierDetailTab>("rejected")
  const [bulkMinOpen, setBulkMinOpen] = React.useState(false)
  const [bulkStockOpen, setBulkStockOpen] = React.useState(false)
  const [bulkCriticalOpen, setBulkCriticalOpen] = React.useState(false)

  const fefo = useFEFOReport({
    warehouseId: inventory.selectedWarehouseId,
    categoryId: inventory.selectedCategoryId,
    searchTerm: inventory.searchTerm,
    enabled: inventory.activeTab === 'fefo_report'
  })

  const criticalItems = useMemo(() => {
    return inventory.stockItems.filter((item) => {
      const cur = item.current_quantity
      const min = item.effective_minimum ?? item.minimum_quantity
      return isQuantityBelowMinimum(cur, min)
    })
  }, [inventory.stockItems])

  const criticalInitialLines = useMemo((): DraftLineForm[] => {
    return criticalItems.map((item) => {
      const cur = item.current_quantity
      const min = item.effective_minimum ?? item.minimum_quantity
      const minNum = typeof min === "number" ? min : Number(String(min).replace(",", "."))
      const suggested = cur < minNum ? Math.max(0, minNum - cur) : 0
      const quantity = suggested > 0
        ? suggested.toFixed(3)
        : ""
      return {
        localKey: newLocalKey(),
        isNewProduct: false,
        stock_item: item.id,
        stock_item_label: { name: item.name, sku: item.sku },
        temp_name: "",
        temp_sku: "",
        temp_unit: "",
        temp_category: "",
        quantity,
        unit: item.unit,
        unit_price: (item.last_purchase_price || 0).toString(),
        lot_number: "",
        expiry_date: "",
      }
    })
  }, [criticalItems])

  const openEditItem = useCallback((item: StockItem) => {
    actions.setEditingItemId(item.id)
    actions.setFormData({
      name: item.name,
      sku: item.sku,
      barcode: item.barcode || "",
      unit: item.unit,
      minimum_quantity:
        item.minimum_quantity === -1
          ? "-1"
          : String(item.minimum_quantity ?? 0),
      last_purchase_price: (item.last_purchase_price || 0).toString(),
      category: item.category || "",
      allergen_ids: (item.allergens ?? []).map((a) => a.id),
    })
    actions.setShowForm(true)
  }, [actions])

  const exportSlug = (() => {
    switch (inventory.activeTab) {
      case 'items': return 'stock-item-list'
      case 'movements': return 'stock-movement-list'
      case 'suppliers': return 'supplier-list'
      case 'fefo_report': return 'fefo-inventory'
      default: return null
    }
  })()

  const exportParams = (() => {
    switch (inventory.activeTab) {
      case 'items':
        return {
          warehouse_id: inventory.selectedWarehouseId,
          category_id: inventory.selectedCategoryId,
          stock_status: inventory.stockStatus,
          search: inventory.searchTerm
        }
      case 'movements':
        return {
          warehouse_id: inventory.selectedWarehouseId,
          movement_type: inventory.movementTypeFilter,
          start_date: inventory.startDate,
          end_date: inventory.endDate,
          search: inventory.searchTerm
        }
      case 'fefo_report':
        return {
          warehouse_id: inventory.selectedWarehouseId,
          category_id: inventory.selectedCategoryId,
          stock_status: inventory.stockStatus,
          search: inventory.searchTerm
        }
      default: return undefined
    }
  })()

  const navProps = {
    activeTab: inventory.activeTab,
    onSelect: inventory.setActiveTab,
  }

  const statsBar = (
    <>
      <InventoryStats
        compact
        totalItems={inventory.summaryData?.total_items || 0}
        totalValue={Number(inventory.summaryData?.total_value ?? 0)}
        approximateStockValue={Number(inventory.summaryData?.approximate_stock_value ?? 0)}
        lowStockCount={inventory.summaryData?.low_stock_count || 0}
        totalReservedQty={inventory.summaryData?.total_reserved_qty || 0}
        onLowStockClick={() => inventory.setShowLowStockOnly(!inventory.showLowStockOnly)}
        isLowStockActive={inventory.showLowStockOnly}
      />
      <ExpiryRiskWidget compact linkHref="/warehouse?tab=expiring_lots" />
    </>
  )

  const resolvedWarehouseId =
    inventory.selectedWarehouseId
    ?? (inventory.warehouses.length === 1 ? inventory.warehouses[0].id : null)

  const actionBar = (
    <InventoryHeader
      compact
      criticalItemsCount={criticalItems.length}
      onNewItem={() => actions.openNewStockItemForm()}
      onNewMovement={() => {
        modals.openMovementForm({
          warehouse_id: resolvedWarehouseId ?? "",
        })
      }}
      onBulkStockEntry={() => setBulkStockOpen(true)}
      onBulkMinimumUpdate={() => setBulkMinOpen(true)}
      onBulkCriticalEntry={() => setBulkCriticalOpen(true)}
    />
  )

  const renderTab = () => {
    switch (inventory.activeTab) {
      case "items":
        return (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <ItemsTable
              stockItems={inventory.stockItems}
              isLoading={inventory.isLoadingItems}
              openEditItem={openEditItem}
              openMovementModal={(item, type) => {
                const resolvedWarehouseId =
                  inventory.selectedWarehouseId
                  ?? (inventory.warehouses.length === 1 ? inventory.warehouses[0].id : null)
                modals.openMovementFormFor(item.id, type, item.unit, {
                  warehouseId: resolvedWarehouseId,
                  quantity:
                    type === "ADJUSTMENT" && resolvedWarehouseId
                      ? String(item.physical_quantity ?? 0)
                      : undefined,
                })
              }}
              openCostHistory={modals.openCostHistory}
              openStockItemDetail={modals.openStockItemDetail}
              openDeleteStockItem={modals.openStockItemDelete}
              fetchNextPage={inventory.fetchNextPage}
              hasNextPage={inventory.hasNextPage}
              isFetchingNextPage={inventory.isFetchingNextPage}
            />
          </div>
        )
      case "movements":
        return (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <MovementsTable
              movements={inventory.stockMovements}
              openDeleteDialog={modals.openMovementDelete}
              fetchNextPage={inventory.fetchNextMovements}
              hasNextPage={inventory.hasNextMovements}
              isFetchingNextPage={inventory.isFetchingNextMovements}
              isLoading={inventory.isLoadingMovements}
            />
          </div>
        )
      case "suppliers":
        return (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <SuppliersTable
              suppliers={inventory.suppliers}
              openEditSupplier={modals.openEditSupplier}
              openDeleteDialog={modals.openSupplierDelete}
              openPerformance={setPerfSupplier}
              isLoading={inventory.isLoadingSuppliers}
              onNew={() => modals.openAddSupplier()}
            />
          </div>
        )
      case "categories":
        return (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <CategoryTreeView
              categories={inventory.categories}
              searchTerm={inventory.searchTerm}
              setSelectedCategoryId={inventory.setSelectedCategoryId}
              setActiveTab={inventory.setActiveTab}
              openEditCategory={modals.openEditCategory}
              openAddSubcategory={(cat) => modals.openAddSubcategory(cat.id)}
              openDeleteCategory={modals.openCategoryDelete}
              isLoading={inventory.isLoadingCategories}
              onNew={() => modals.setShowCategoryForm(true)}
            />
          </div>
        )
      case "unit_definitions":
        return (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <UnitsTable
              units={inventory.stockUnits}
              onEdit={modals.openEditUnit}
              onDelete={modals.openUnitDelete}
              onNew={() => modals.setShowUnitForm(true)}
              isLoading={inventory.isLoadingUnits}
            />
          </div>
        )
      case "fefo_report":
        return (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <FEFOReportTable
              reportData={fefo.reportData}
              fetchNextPage={fefo.fetchNextPage}
              hasNextPage={fefo.hasNextPage}
              isFetchingNextPage={fefo.isFetchingNextPage}
              isLoading={fefo.isLoading}
              onOpenLotDetails={modals.openFEFOLotDetail}
            />
          </div>
        )
      default:
        return null
    }
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col bg-background overflow-hidden">
        {/* Üst bar: istatistik kartları + mobil nav + şube filtresi */}
        <div className="flex shrink-0 flex-col border-b border-border bg-background border-border">
          <div className="flex items-center gap-2 px-2 py-2 sm:px-4">
            <div className="hidden lg:flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
              {statsBar}
            </div>
            <div className="min-w-0 flex-1 lg:hidden">
              <InventoryModuleNavHorizontal {...navProps} />
            </div>
            <div className="ms-auto flex shrink-0 items-center gap-2 sm:gap-3">
              {actionBar}
              <div className="hidden sm:block text-2xs font-bold text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">
                {t("page.filterLabel")}
              </div>
              <BranchSelect
                value={branchId}
                onChange={setBranchId}
                includeAll={true}
                className="w-48 h-9"
              />
            </div>
          </div>
          <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto px-2 pb-2 sm:px-4">
            {statsBar}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row bg-background">
          <InventoryModuleNavVertical {...navProps} />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
            <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-none border-0 py-0 shadow-none bg-card">
              <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
                <InventoryFilters
                  activeTab={inventory.activeTab}
                  searchTerm={inventory.searchTerm}
                  setSearchTerm={inventory.setSearchTerm}
                  selectedWarehouseId={inventory.selectedWarehouseId}
                  setSelectedWarehouseId={inventory.setSelectedWarehouseId}
                  selectedCategoryId={inventory.selectedCategoryId}
                  setSelectedCategoryId={inventory.setSelectedCategoryId}
                  stockStatus={inventory.stockStatus}
                  setStockStatus={inventory.setStockStatus}
                  warehouses={inventory.warehouses}
                  categories={inventory.categories}
                  startDate={inventory.startDate}
                  setStartDate={inventory.setStartDate}
                  endDate={inventory.endDate}
                  setEndDate={inventory.setEndDate}
                  movementTypeFilter={inventory.movementTypeFilter}
                  setMovementTypeFilter={inventory.setMovementTypeFilter}
                  exportReportSlug={exportSlug}
                  exportParams={exportParams}
                  onRefresh={inventory.refreshAll}
                  isLoading={inventory.isLoading}
                />

                <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-card relative">
                  {renderTab()}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <InventoryModals
        modals={modals}
        actions={actions}
        inventory={inventory}
        perfSupplier={perfSupplier}
        setPerfSupplier={setPerfSupplier}
        detailSupplier={detailSupplier}
        detailTab={detailTab}
        setDetailSupplier={(s, tab) => {
          setDetailSupplier(s)
          if (tab) setDetailTab(tab)
        }}
        bulkMinOpen={bulkMinOpen}
        setBulkMinOpen={setBulkMinOpen}
        bulkStockOpen={bulkStockOpen}
        setBulkStockOpen={setBulkStockOpen}
        bulkCriticalOpen={bulkCriticalOpen}
        setBulkCriticalOpen={setBulkCriticalOpen}
        criticalInitialLines={criticalInitialLines}
      />
    </AppShell>
  )
}
