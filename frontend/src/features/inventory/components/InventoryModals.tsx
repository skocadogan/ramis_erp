"use client"

import React from "react"
import dynamic from "next/dynamic"
import type { Supplier, SupplierDetailTab } from "@/features/inventory/types"
import type { DraftLineForm } from "@/features/inventory/components/bulk-stock-entry/bulkStockEntry.types"

// Modals (Dynamically Loaded)
const ItemFormModal = dynamic(() => import("@/features/inventory/components/ItemFormModal").then(mod => mod.ItemFormModal), { ssr: false })
const MovementFormModal = dynamic(() => import("@/features/inventory/components/MovementFormModal").then(mod => mod.MovementFormModal), { ssr: false })
const SupplierFormModal = dynamic(() => import("@/features/inventory/components/SupplierFormModal").then(mod => mod.SupplierFormModal), { ssr: false })
const CategoryFormModal = dynamic(() => import("@/features/inventory/components/CategoryFormModal").then(mod => mod.CategoryFormModal), { ssr: false })
const UnitFormModal = dynamic(() => import("@/features/inventory/components/UnitFormModal").then(mod => mod.UnitFormModal), { ssr: false })
const CostHistoryModal = dynamic(() => import("@/features/inventory/components/CostHistoryModal").then(mod => mod.CostHistoryModal), { ssr: false })
const StockItemStockDetailModal = dynamic(() => import("@/features/inventory/components/StockItemStockDetailModal").then(mod => mod.StockItemStockDetailModal), { ssr: false })
const DeleteConfirmationModals = dynamic(() => import("@/features/inventory/components/DeleteConfirmationModals").then(mod => mod.DeleteConfirmationModals), { ssr: false })
const SupplierPerformanceModal = dynamic(() => import("@/features/inventory/components/SupplierPerformanceModal").then(mod => mod.SupplierPerformanceModal), { ssr: false })
const SupplierDetailModal = dynamic(() => import("@/features/inventory/components/SupplierDetailModal").then(mod => mod.SupplierDetailModal), { ssr: false })
const BulkMinimumImportModal = dynamic(() => import("@/features/inventory/components/BulkMinimumImportModal").then(mod => mod.BulkMinimumImportModal), { ssr: false })
const BulkStockEntryModal = dynamic(() => import("@/features/inventory/components/BulkStockEntryModal").then(mod => mod.BulkStockEntryModal), { ssr: false })
const FEFOLotDetailsModal = dynamic(() => import("@/features/inventory/components/FEFOLotDetailsModal").then(mod => mod.FEFOLotDetailsModal), { ssr: false })

interface InventoryModalsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modals: Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions: Record<string, any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inventory: Record<string, any>
  perfSupplier: Supplier | null
  setPerfSupplier: (s: Supplier | null) => void
  detailSupplier: Supplier | null
  detailTab: SupplierDetailTab
  setDetailSupplier: (s: Supplier | null, tab?: SupplierDetailTab) => void
  bulkMinOpen: boolean
  setBulkMinOpen: (v: boolean) => void
  bulkStockOpen: boolean
  setBulkStockOpen: (v: boolean) => void
  bulkCriticalOpen: boolean
  setBulkCriticalOpen: (v: boolean) => void
  criticalInitialLines: DraftLineForm[]
}

export function InventoryModals({
  modals,
  actions,
  inventory,
  perfSupplier,
  setPerfSupplier,
  detailSupplier,
  detailTab,
  setDetailSupplier,
  bulkMinOpen,
  setBulkMinOpen,
  bulkStockOpen,
  setBulkStockOpen,
  bulkCriticalOpen,
  setBulkCriticalOpen,
  criticalInitialLines
}: InventoryModalsProps) {
  return (
    <>
      <ItemFormModal
        showForm={actions.showForm}
        setShowForm={actions.setShowForm}
        editingItemId={actions.editingItemId}
        formData={actions.formData}
        setFormData={actions.setFormData}
        isSubmitting={actions.isSubmitting}
        handleItemSubmit={() =>
          actions.handleItemSubmit()
        }
        categories={inventory.categories}
        stockUnits={inventory.stockUnits}
      />

      <MovementFormModal
        showMovementForm={modals.showMovementForm}
        setShowMovementForm={modals.setShowMovementForm}
        movementData={modals.movementData}
        setMovementData={modals.setMovementData}
        isSubmitting={actions.isSubmitting}
        handleMovementSubmit={() =>
          actions.handleMovementSubmit(modals.movementData, modals.setMovementData, modals.setShowMovementForm)
        }
        warehouses={inventory.warehouses}
        suppliers={inventory.suppliers}
        stockUnits={inventory.stockUnits}
      />

      <SupplierFormModal
        showSupplierForm={modals.showSupplierForm}
        setShowSupplierForm={modals.setShowSupplierForm}
        editingSupplierId={modals.editingSupplierId}
        supplierFormData={modals.supplierFormData}
        setSupplierFormData={modals.setSupplierFormData}
        isSubmitting={actions.isSubmitting}
        handleSupplierSubmit={() =>
          actions.handleSupplierSubmit(modals.editingSupplierId, modals.supplierFormData, modals.setSupplierFormData, modals.setShowSupplierForm)
        }
        stockItems={inventory.stockItems}
      />

      <CategoryFormModal
        showCategoryForm={modals.showCategoryForm}
        setShowCategoryForm={modals.setShowCategoryForm}
        editingCategoryId={modals.editingCategoryId}
        categoryFormData={modals.categoryFormData}
        setCategoryFormData={modals.setCategoryFormData}
        isSubmitting={actions.isSubmitting}
        handleCategorySubmit={() =>
          actions.handleCategorySubmit(modals.editingCategoryId, modals.categoryFormData, modals.setCategoryFormData, modals.setShowCategoryForm)
        }
        categories={inventory.categories}
      />

      <UnitFormModal
        showUnitForm={modals.showUnitForm}
        setShowUnitForm={modals.setShowUnitForm}
        editingUnitId={modals.editingUnitId}
        unitFormData={modals.unitFormData}
        setUnitFormData={modals.setUnitFormData}
        isSubmitting={actions.isSubmitting}
        handleUnitSubmit={() =>
          actions.handleUnitSubmit(modals.editingUnitId, modals.unitFormData, modals.setUnitFormData, modals.setShowUnitForm)
        }
      />

      <CostHistoryModal
        item={modals.selectedItemForHistory}
        open={modals.showCostHistory}
        onOpenChange={(open) => !open && modals.closeCostHistory()}
      />

      <StockItemStockDetailModal
        item={modals.stockItemDetailItem}
        open={modals.showStockItemDetail}
        onOpenChange={(o) => !o && modals.closeStockItemDetail()}
      />

      <DeleteConfirmationModals
        isDeleteDialogOpen={modals.isDeleteDialogOpen}
        setIsDeleteDialogOpen={modals.setIsDeleteDialogOpen}
        handleDeleteSupplier={() =>
          modals.supplierToDelete && actions.handleDeleteSupplier(modals.supplierToDelete).then(() => modals.closeSupplierDelete())
        }
        isMovementDeleteDialogOpen={modals.isMovementDeleteDialogOpen}
        setIsMovementDeleteDialogOpen={modals.setIsMovementDeleteDialogOpen}
        handleDeleteMovement={() =>
          modals.movementToDelete && actions.handleDeleteMovement(modals.movementToDelete).then(() => modals.closeMovementDelete())
        }
        isUnitDeleteDialogOpen={modals.isUnitDeleteDialogOpen}
        setIsUnitDeleteDialogOpen={modals.setIsUnitDeleteDialogOpen}
        handleDeleteUnit={() =>
          modals.unitToDelete && actions.handleDeleteUnit(modals.unitToDelete).then(() => modals.closeUnitDelete())
        }
        isCategoryDeleteDialogOpen={modals.isCategoryDeleteDialogOpen}
        setIsCategoryDeleteDialogOpen={modals.setIsCategoryDeleteDialogOpen}
        handleDeleteCategory={() =>
          modals.categoryToDelete && actions.handleDeleteCategory(modals.categoryToDelete).then(() => modals.closeCategoryDelete())
        }
        categoryToDelete={modals.categoryToDelete}
        categories={inventory.categories}
        isStockItemDeleteDialogOpen={modals.isStockItemDeleteDialogOpen}
        setIsStockItemDeleteDialogOpen={modals.setIsStockItemDeleteDialogOpen}
        handleDeleteStockItem={() =>
          modals.stockItemToDelete && actions.handleDeleteStockItem(modals.stockItemToDelete.id).then(() => modals.closeStockItemDelete())
        }
        stockItemToDelete={modals.stockItemToDelete}
      />

      {perfSupplier && (
        <SupplierPerformanceModal
          supplier={perfSupplier}
          onClose={() => setPerfSupplier(null)}
          onShowDetail={(tab) => {
            setDetailSupplier(perfSupplier, tab)
            setPerfSupplier(null)
          }}
        />
      )}

      <SupplierDetailModal
        supplier={detailSupplier}
        open={!!detailSupplier}
        onOpenChange={(o) => !o && setDetailSupplier(null)}
        defaultTab={detailTab}
      />

      <BulkMinimumImportModal
        open={bulkMinOpen}
        onClose={() => setBulkMinOpen(false)}
        onDone={() => inventory.refreshAll()}
      />

      <BulkStockEntryModal
        open={bulkStockOpen}
        onClose={() => setBulkStockOpen(false)}
        onDone={() => inventory.refreshAll()}
        warehouses={inventory.warehouses}
        suppliers={inventory.suppliers}
        stockUnits={inventory.stockUnits}
        categories={inventory.categories}
      />

      <BulkStockEntryModal
        open={bulkCriticalOpen}
        onClose={() => setBulkCriticalOpen(false)}
        onDone={() => { inventory.refreshAll(); setBulkCriticalOpen(false) }}
        warehouses={inventory.warehouses}
        suppliers={inventory.suppliers}
        stockUnits={inventory.stockUnits}
        categories={inventory.categories}
        initialLines={criticalInitialLines}
      />

      <FEFOLotDetailsModal
        item={modals.fefoLotDetailItem}
        open={modals.showFEFOLotDetail}
        onOpenChange={(o) => !o && modals.closeFEFOLotDetail()}
        warehouseId={inventory.selectedWarehouseId}
      />
    </>
  )
}
