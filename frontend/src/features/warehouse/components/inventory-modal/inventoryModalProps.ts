import type { Dispatch, RefObject, SetStateAction } from "react"
import type { InfiniteData } from "@tanstack/react-query"
import type { Virtualizer } from "@tanstack/react-virtual"
import type { WarehouseStockLevelsPagePayload } from "@/features/warehouse/services/warehouseApi"
import type { Warehouse } from "@/features/warehouse/types"
import type { TransferInsufficientLine } from "../TransferStockInsufficientDialog"
import type { WarehouseInventoryStockLevel } from "./types"

export type WarehouseInventoryToolbarProps = {
  filter: string
  setFilter: Dispatch<SetStateAction<string>>
  targetWarehouseId: string
  setTargetWarehouseId: Dispatch<SetStateAction<string>>
  transferDate: string
  setTransferDate: Dispatch<SetStateAction<string>>
  targetOptions: Warehouse[]
  handleTransferSelected: () => void
  handleOpenTransferAllDialog: () => void
  clearSelection: () => void
  createMutIsPending: boolean
  selectedRowsLength: number
  prefetchTransferAll: boolean
  transferAllCountLabel: number
}

export type WarehouseInventoryLevelsPanelProps = {
  warehouseId: string
  productGridClass: string
  showTransferQtyColumn: boolean
  headerSelectRef: RefObject<HTMLInputElement | null>
  allFilteredSelected: boolean
  stockFiltered: WarehouseInventoryStockLevel[]
  setSelected: Dispatch<SetStateAction<Set<string>>>
  levels: WarehouseInventoryStockLevel[]
  inventoryLevelsData: InfiniteData<WarehouseStockLevelsPagePayload> | undefined
  isLoading: boolean
  warehouseHasNoStockLines: boolean
  isError: boolean
  error: unknown
  expandedStockItemId: string | null
  selected: Set<string>
  transferQtyByItem: Record<string, string>
  setTransferQtyByItem: Dispatch<SetStateAction<Record<string, string>>>
  toggleSelected: (stockItemId: string) => void
  toggleHistory: (stockItemId: string) => void
  setEditQtyRow: Dispatch<SetStateAction<WarehouseInventoryStockLevel | null>>
  setEditQtyInput: Dispatch<SetStateAction<string>>
  setEditQtyNotes: Dispatch<SetStateAction<string>>
  setEditMinRow: Dispatch<SetStateAction<WarehouseInventoryStockLevel | null>>
  setEditMinInput: Dispatch<SetStateAction<string>>
  setRemoveRow: Dispatch<SetStateAction<WarehouseInventoryStockLevel | null>>
  scrollRef: RefObject<HTMLDivElement | null>
  loadMoreSentinelRef: RefObject<HTMLDivElement | null>
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>
  virtualRows: ReturnType<Virtualizer<HTMLDivElement, Element>["getVirtualItems"]>
  hasNextPage: boolean
  isFetchingNextPage: boolean
  totalWarehouseCount: number
  targetWarehouseId: string
}

export type WarehouseInventoryModalDialogsProps = {
  warehouseName: string
  partialStock: {
    payload: Record<string, unknown>
    insufficient: TransferInsufficientLine[]
    feasibleCount: number
  } | null
  setPartialStock: Dispatch<
    SetStateAction<{
      payload: Record<string, unknown>
      insufficient: TransferInsufficientLine[]
      feasibleCount: number
    } | null>
  >
  confirmTransferAll: boolean
  setConfirmTransferAll: Dispatch<SetStateAction<boolean>>
  pendingTransferAllRows: WarehouseInventoryStockLevel[] | null
  setPendingTransferAllRows: Dispatch<SetStateAction<WarehouseInventoryStockLevel[] | null>>
  editQtyRow: WarehouseInventoryStockLevel | null
  setEditQtyRow: Dispatch<SetStateAction<WarehouseInventoryStockLevel | null>>
  editQtyInput: string
  setEditQtyInput: Dispatch<SetStateAction<string>>
  editQtyNotes: string
  setEditQtyNotes: Dispatch<SetStateAction<string>>
  editMinRow: WarehouseInventoryStockLevel | null
  setEditMinRow: Dispatch<SetStateAction<WarehouseInventoryStockLevel | null>>
  editMinInput: string
  setEditMinInput: Dispatch<SetStateAction<string>>
  removeRow: WarehouseInventoryStockLevel | null
  setRemoveRow: Dispatch<SetStateAction<WarehouseInventoryStockLevel | null>>
  stockMovementApiError: string | null
  setStockMovementApiError: Dispatch<SetStateAction<string | null>>
  createMutIsPending: boolean
  adjustMutIsPending: boolean
  setMinMutIsPending: boolean
  runCreateTransfer: (payload: Record<string, unknown>) => Promise<void>
  handleTransferAllConfirm: () => void
  submitEditQty: () => Promise<void>
  submitEditMin: () => Promise<void>
  submitRemoveFromWarehouse: () => Promise<void>
}
