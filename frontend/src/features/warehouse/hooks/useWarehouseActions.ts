"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { warehouseApi } from "@/features/warehouse/services/warehouseApi"
import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import { queryKeys } from "@/lib/queryKeys"

// ──────────────────────────────────────────────────
// Warehouse CRUD
// ──────────────────────────────────────────────────
export function useCreateWarehouse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => warehouseApi.createWarehouse(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.warehousesBase }); qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase }) },
  })
}

export function useUpdateWarehouse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => warehouseApi.updateWarehouse(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.warehousesBase }); qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase }) },
  })
}

export function useDeleteWarehouse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => warehouseApi.deleteWarehouse(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.warehousesBase }); qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase }) },
  })
}

// ──────────────────────────────────────────────────
// Purchase Order CRUD + actions
// ──────────────────────────────────────────────────
export function useCreatePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => warehouseApi.createPurchaseOrder(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.purchaseOrdersBase }); qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase }) },
  })
}

export function useUpdatePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      warehouseApi.updatePurchaseOrder(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.purchaseOrdersBase })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase })
    },
  })
}

export function usePreviewSuggestPurchaseOrders() {
  return useMutation({
    mutationFn: ({ warehouse_id }: { warehouse_id: string }) =>
      warehouseApi.previewSuggestPurchaseOrders(warehouse_id),
  })
}

export function useSuggestPurchaseOrders() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ warehouse_id, preferred_suppliers }: { warehouse_id: string; preferred_suppliers?: Record<string, string> }) =>
      warehouseApi.suggestPurchaseOrders(warehouse_id, preferred_suppliers),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.purchaseOrdersBase })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase })
    },
  })
}

export function useCommitPurchaseRecommendations() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      warehouse_id: string
      items: Array<{
        stock_item_id: string
        quantity: string | number
        recommended_quantity?: string | number
      }>
      preferred_suppliers?: Record<string, string>
    }) => warehouseApi.commitPurchaseRecommendations(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.purchaseOrdersBase })
      qc.invalidateQueries({ queryKey: queryKeys.purchaseRecommendationsBase })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase })
    },
  })
}

function invalidateExpiryQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.expiryWarningsBase })
  qc.invalidateQueries({ queryKey: queryKeys.expirySummaryBase })
  qc.invalidateQueries({ queryKey: queryKeys.expiryActionsHistoryBase })
  qc.invalidateQueries({ queryKey: queryKeys.expiringLotsBase })
}

export function useCommitExpiryAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof inventoryApi.commitExpiryAction>[0]) =>
      inventoryApi.commitExpiryAction(payload),
    onSuccess: () => invalidateExpiryQueries(qc),
  })
}

export function usePreviewExpiryAction() {
  return useMutation({
    mutationFn: (payload: Parameters<typeof inventoryApi.previewExpiryAction>[0]) =>
      inventoryApi.previewExpiryAction(payload),
  })
}

export function useExecuteExpiryAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof inventoryApi.executeExpiryAction>[0]) =>
      inventoryApi.executeExpiryAction(payload),
    onSuccess: () => {
      invalidateExpiryQueries(qc)
      qc.invalidateQueries({ queryKey: queryKeys.transfersBase })
    },
  })
}

export function useAutoReturnCancelExpiredLot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof inventoryApi.autoReturnCancelExpiredLot>[0]) =>
      inventoryApi.autoReturnCancelExpiredLot(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.expiryWarningsBase })
      qc.invalidateQueries({ queryKey: queryKeys.expirySummaryBase })
      qc.invalidateQueries({ queryKey: queryKeys.expiringLotsBase })
      qc.invalidateQueries({ queryKey: queryKeys.stockMovementsBase })
      qc.invalidateQueries({ queryKey: ["returnCancelMovements"] })
    },
  })
}

export function useSubmitPurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => warehouseApi.submitPurchaseOrder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.purchaseOrdersBase }),
  })
}

export function useApprovePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => warehouseApi.approvePurchaseOrder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.purchaseOrdersBase }),
  })
}

export function useDeletePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => warehouseApi.deletePurchaseOrder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.purchaseOrdersBase }),
  })
}

export function useMarkOrderedPurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => warehouseApi.markOrderedPurchaseOrder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.purchaseOrdersBase }),
  })
}

export function useCancelPurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => warehouseApi.cancelPurchaseOrder(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.purchaseOrdersBase }); qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase }) },
  })
}

export function useRecalculatePurchaseOrderStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => warehouseApi.recalculatePurchaseOrderStatus(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.purchaseOrdersBase }) },
  })
}

// ──────────────────────────────────────────────────
// Goods Receiving
// ──────────────────────────────────────────────────
export function useCreateGoodsReceiving() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => warehouseApi.createGoodsReceiving(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.goodsReceivingsBase }); qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase }) },
  })
}

export function useCompleteGoodsReceiving() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => warehouseApi.completeGoodsReceiving(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.goodsReceivingsBase })
      qc.invalidateQueries({ queryKey: queryKeys.purchaseOrdersBase })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase })
      qc.invalidateQueries({ queryKey: queryKeys.stockItemsSimpleBase })
      qc.invalidateQueries({ queryKey: queryKeys.stockItemsBase })
      qc.invalidateQueries({ queryKey: queryKeys.stockMovementsBase })
      qc.invalidateQueries({ queryKey: queryKeys.stockSummaryBase })
    },
  })
}

export function useDeleteGoodsReceiving() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => warehouseApi.deleteGoodsReceiving(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.goodsReceivingsBase })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase })
    },
  })
}

// ──────────────────────────────────────────────────
// Transfers
// ──────────────────────────────────────────────────
export function useCreateTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => warehouseApi.createTransfer(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.transfersBase }); qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase }) },
  })
}

export function useUpdateTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      warehouseApi.updateTransfer(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.transfersBase })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase })
    },
  })
}

export function useApproveTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => warehouseApi.approveTransfer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.transfersBase }),
  })
}

export function useCompleteTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => warehouseApi.completeTransfer(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.transfersBase })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase })
      qc.invalidateQueries({ queryKey: queryKeys.stockItemsSimpleBase })
    },
  })
}

export function useCancelTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => warehouseApi.cancelTransfer(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.transfersBase }); qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase }) },
  })
}

// ──────────────────────────────────────────────────
// Stock Counting
// ──────────────────────────────────────────────────
export function useCreateStockCounting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => warehouseApi.createStockCounting(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.stockCountingsBase }); qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase }) },
  })
}

export function useStartStockCounting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => warehouseApi.startStockCounting(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.stockCountingsBase }),
  })
}

export function useFinishStockCounting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => warehouseApi.finishStockCounting(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.stockCountingsBase }),
  })
}

export function useApproveStockCounting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => warehouseApi.approveStockCounting(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.stockCountingsBase })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase })
      qc.invalidateQueries({ queryKey: queryKeys.stockItemsSimpleBase })
    },
  })
}

export function useUpdateCountingItems() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: Record<string, unknown>[] }) =>
      warehouseApi.updateCountingItems(id, items),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.stockCountingsBase }),
  })
}

export function useDeleteStockCounting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => warehouseApi.deleteStockCounting(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.stockCountingsBase })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase })
    },
  })
}

// ──────────────────────────────────────────────────
// Deficiency Reports
// ──────────────────────────────────────────────────
export function useCreateDeficiencyReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => warehouseApi.createDeficiencyReport(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.deficiencyReportsBase })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase })
    },
  })
}

export function useApproveDeficiencyReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => warehouseApi.approveDeficiencyReport(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.deficiencyReportsBase }),
  })
}

export function useCancelDeficiencyReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => warehouseApi.cancelDeficiencyReport(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.deficiencyReportsBase }),
  })
}

export function useDeleteDeficiencyReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => warehouseApi.deleteDeficiencyReport(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.deficiencyReportsBase })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase })
    },
  })
}

export function useCreatePOFromDeficiency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, supplier_id, warehouse_id }: { id: string; supplier_id: string; warehouse_id: string }) =>
      warehouseApi.createPOFromDeficiency(id, supplier_id, warehouse_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.deficiencyReportsBase })
      qc.invalidateQueries({ queryKey: queryKeys.purchaseOrdersBase })
    },
  })
}

export function useCreateTransferFromDeficiency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, source_warehouse_id }: { id: string; source_warehouse_id: string }) =>
      warehouseApi.createTransferFromDeficiency(id, source_warehouse_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.deficiencyReportsBase })
      qc.invalidateQueries({ queryKey: queryKeys.transfersBase })
    },
  })
}

export function usePreviewDeficiencyItemActions() {
  return useMutation({
    mutationFn: ({
      id,
      items,
    }: {
      id: string
      items: Array<{ item_id: string; action: string }>
    }) => warehouseApi.previewDeficiencyItemActions(id, items),
  })
}

export function useExecuteDeficiencyItemActions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      items,
      supplier_id,
      warehouse_id,
    }: {
      id: string
      items: Array<{ item_id: string; action: string }>
      supplier_id?: string
      warehouse_id?: string
    }) =>
      warehouseApi.executeDeficiencyItemActions(id, {
        items,
        ...(supplier_id ? { supplier_id } : {}),
        ...(warehouse_id ? { warehouse_id } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.deficiencyReportsBase })
      qc.invalidateQueries({ queryKey: queryKeys.transfersBase })
      qc.invalidateQueries({ queryKey: queryKeys.purchaseOrdersBase })
    },
  })
}

// ──────────────────────────────────────────────────
// Warehouse Stock Level (minimum threshold)
// ──────────────────────────────────────────────────
export function useSetWarehouseStockMinimum() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ warehouseId, stock_item_id, minimum_quantity }: { warehouseId: string; stock_item_id: string; minimum_quantity: string | number }) =>
      warehouseApi.setWarehouseStockMinimum(warehouseId, { stock_item_id, minimum_quantity }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["warehouse-inventory-levels", variables.warehouseId] })
      qc.invalidateQueries({ queryKey: queryKeys.warehousesBase })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase })
    },
  })
}

/** Depo satırında miktar düzeltmesi / sıfırlama — `POST /inventory/stock-movements/` ADJUSTMENT */
export function useAdjustWarehouseStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      warehouse_id: string
      stock_item_id: string
      quantity: number
      unit: string
      notes?: string
    }) =>
      inventoryApi.createStockMovement({
        warehouse_id: data.warehouse_id,
        stock_item_id: data.stock_item_id,
        movement_type: "ADJUSTMENT",
        quantity: data.quantity,
        unit: data.unit,
        notes: data.notes ?? "",
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["warehouse-inventory-levels", variables.warehouse_id] })
      qc.invalidateQueries({ queryKey: queryKeys.warehousesBase })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseSummaryBase })
      qc.invalidateQueries({ queryKey: queryKeys.stockItemsSimpleBase })
      qc.invalidateQueries({ queryKey: queryKeys.stockMovementsBase })
    },
  })
}

