import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { isAxiosError } from "axios"
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query"
import { useVirtualizer } from "@tanstack/react-virtual"
import { toast } from "sonner"
import { warehouseApi, type WarehouseStockLevelsPagePayload } from "@/features/warehouse/services/warehouseApi"
import { useWarehouses } from "@/features/warehouse/hooks/useWarehouse"
import {
  useAdjustWarehouseStock,
  useCreateTransfer,
  useSetWarehouseStockMinimum,
} from "@/features/warehouse/hooks/useWarehouseActions"
import { parseApiError } from "@/lib/parseApiError"
import { queryKeys } from "@/lib/queryKeys"
import { useDebounce } from "@/hooks/useDebounce"
import type { TransferInsufficientLine } from "../TransferStockInsufficientDialog"
import { cn } from "@/lib/utils"
import { ROW_COLLAPSED_EST, ROW_EXPANDED_EST } from "./constants"
import { patchWarehouseInventoryInfiniteCache } from "./inventoryLevelsCache"
import {
  rowsToTransferItems,
  rowsToTransferItemsFromInputs,
  stockQtyPositive,
} from "./transferHelpers"
import type {
  WarehouseInventoryLevelsPanelProps,
  WarehouseInventoryModalDialogsProps,
  WarehouseInventoryToolbarProps,
} from "./inventoryModalProps"
import type { TransferLineItem, WarehouseInventoryStockLevel } from "./types"

export function useWarehouseInventoryModal({
  warehouseId,
  warehouseName,
}: {
  warehouseId: string
  warehouseName: string
}): {
  toolbar: WarehouseInventoryToolbarProps
  levels: WarehouseInventoryLevelsPanelProps
  dialogs: WarehouseInventoryModalDialogsProps
} {
  const t = useTranslations("warehouse.inventoryModal")
  const qc = useQueryClient()
  const [filter, setFilter] = useState("")
  const debouncedSearch = useDebounce(filter.trim(), 350)
  const [expandedStockItemId, setExpandedStockItemId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [targetWarehouseId, setTargetWarehouseId] = useState("")
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().split("T")[0])
  const [partialStock, setPartialStock] = useState<{
    payload: Record<string, unknown>
    insufficient: TransferInsufficientLine[]
    feasibleCount: number
  } | null>(null)
  const [confirmTransferAll, setConfirmTransferAll] = useState(false)
  const [prefetchTransferAll, setPrefetchTransferAll] = useState(false)
  const [pendingTransferAllRows, setPendingTransferAllRows] = useState<WarehouseInventoryStockLevel[] | null>(null)
  const [editQtyRow, setEditQtyRow] = useState<WarehouseInventoryStockLevel | null>(null)
  const [editQtyInput, setEditQtyInput] = useState("")
  const [editQtyNotes, setEditQtyNotes] = useState("")
  const [editMinRow, setEditMinRow] = useState<WarehouseInventoryStockLevel | null>(null)
  const [editMinInput, setEditMinInput] = useState("")
  const [removeRow, setRemoveRow] = useState<WarehouseInventoryStockLevel | null>(null)
  const [stockMovementApiError, setStockMovementApiError] = useState<string | null>(null)
  const headerSelectRef = useRef<HTMLInputElement>(null)
  const [transferQtyByItem, setTransferQtyByItem] = useState<Record<string, string>>({})

  const mountedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const inventoryLevelsQueryKey = useMemo(
    () => ["warehouse-inventory-levels", warehouseId, debouncedSearch] as const,
    [warehouseId, debouncedSearch],
  )

  const { data: warehouses = [] } = useWarehouses()
  const targetOptions = useMemo(() => warehouses.filter((w) => w.id !== warehouseId), [warehouses, warehouseId])

  const createMut = useCreateTransfer()
  const adjustMut = useAdjustWarehouseStock()
  const setMinMut = useSetWarehouseStockMinimum()

  const inventoryLevelsInfiniteQuery = useInfiniteQuery({
    queryKey: [...inventoryLevelsQueryKey],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      warehouseApi.fetchWarehouseStockLevelsPage(warehouseId, pageParam as number, {
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      }),
    getNextPageParam: (lastPage) => {
      const loadedThroughPage =
        (lastPage.page - 1) * lastPage.pageSize + lastPage.results.length
      if (lastPage.results.length === 0 || loadedThroughPage >= lastPage.count) return undefined
      return lastPage.page + 1
    },
    enabled: !!warehouseId,
  })

  const inventoryLevelsData = inventoryLevelsInfiniteQuery.data as
    | InfiniteData<WarehouseStockLevelsPagePayload>
    | undefined

  const {
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = inventoryLevelsInfiniteQuery

  const levels = useMemo(
    () => (inventoryLevelsData?.pages.flatMap((p) => p.results) ?? []) as WarehouseInventoryStockLevel[],
    [inventoryLevelsData],
  )

  const totalWarehouseCount = inventoryLevelsData?.pages[0]?.count ?? 0

  const warehouseHasNoStockLines =
    !isLoading && Boolean(inventoryLevelsData?.pages?.length) && totalWarehouseCount === 0

  const stockFiltered = useMemo(() => levels.filter(stockQtyPositive), [levels])
  const stockLevelsAll = useMemo(() => levels.filter(stockQtyPositive), [levels])

  const allFilteredSelected =
    stockFiltered.length > 0 && stockFiltered.every((r) => selected.has(r.stock_item))
  const someFilteredSelected =
    stockFiltered.some((r) => selected.has(r.stock_item)) && !allFilteredSelected

  useEffect(() => {
    const el = headerSelectRef.current
    if (el) el.indeterminate = someFilteredSelected
  }, [someFilteredSelected])

  const selectedRows = useMemo(
    () => levels.filter((r) => selected.has(r.stock_item) && stockQtyPositive(r)),
    [levels, selected],
  )

  const showTransferQtyColumn = Boolean(targetWarehouseId)

  useEffect(() => {
    if (!targetWarehouseId) {
      setTransferQtyByItem({})
      return
    }
    setTransferQtyByItem((prev) => {
      const next = { ...prev }
      for (const row of levels) {
        if (next[row.stock_item] === undefined) next[row.stock_item] = "0"
      }
      return next
    })
  }, [targetWarehouseId, levels])

  const productGridClass = useMemo(
    () =>
      cn(
        "grid w-full items-center gap-2 px-4 py-2.5 text-sm",
        showTransferQtyColumn
          ? "grid-cols-[2.25rem_minmax(0,2fr)_minmax(0,7rem)_5rem_minmax(6rem,1fr)_5rem_6rem_2.75rem]"
          : "grid-cols-[2.25rem_minmax(0,2fr)_minmax(0,7rem)_5.5rem_5.5rem_6rem_2.75rem]",
      ),
    [showTransferQtyColumn],
  )

  const runCreateTransfer = async (payload: Record<string, unknown>) => {
    try {
      await createMut.mutateAsync(payload)
      if (!mountedRef.current) return
      setPartialStock(null)
      setSelected(new Set())
      setTransferQtyByItem({})
      qc.invalidateQueries({ queryKey: ["warehouse-inventory-levels", warehouseId] })
      qc.invalidateQueries({ queryKey: queryKeys.stockItemsSimpleBase })
      toast.success(t("toast.transferDraftCreated"))
    } catch (e) {
      if (isAxiosError(e) && e.response?.data && typeof e.response.data === "object") {
        const d = e.response.data as Record<string, unknown>
        if (d.code === "INSUFFICIENT_STOCK") {
          const feasible = d.feasible_items
          if (Array.isArray(feasible) && feasible.length > 0 && Array.isArray(d.insufficient_items)) {
            if (!mountedRef.current) return
            setPartialStock({
              payload: { ...payload, items: feasible, accept_partial: true },
              insufficient: d.insufficient_items as TransferInsufficientLine[],
              feasibleCount: feasible.length,
            })
            return
          }
        }
      }
      if (mountedRef.current) toast.error(parseApiError(e))
    }
  }

  const submitTransfer = (items: TransferLineItem[]) => {
    if (!targetWarehouseId) {
      toast.error(t("toast.selectTargetWarehouse"))
      return
    }
    if (targetWarehouseId === warehouseId) {
      toast.error(t("toast.sameSourceTarget"))
      return
    }
    if (items.length === 0) {
      toast.error(t("toast.noQtyToTransfer"))
      return
    }
    void runCreateTransfer({
      source_warehouse_id: warehouseId,
      target_warehouse_id: targetWarehouseId,
      transfer_date: transferDate,
      notes: t("transferNotesPrefix", { warehouseName }),
      items,
    })
  }

  const handleTransferSelected = () => {
    const items = rowsToTransferItemsFromInputs(selectedRows, transferQtyByItem)
    if (items.length === 0) {
      toast.error(t("toast.noTransferQtyForSelection"))
      return
    }
    submitTransfer(items)
  }

  const handleTransferAllConfirm = () => {
    if (!pendingTransferAllRows?.length) return
    submitTransfer(rowsToTransferItems(pendingTransferAllRows))
  }

  const handleOpenTransferAllDialog = async () => {
    if (!targetWarehouseId) {
      toast.error(t("toast.selectTargetWarehouse"))
      return
    }
    setPrefetchTransferAll(true)
    try {
      const all = await warehouseApi.fetchAllWarehouseStockLevels(warehouseId)
      if (!mountedRef.current) return
      const rows = (all as WarehouseInventoryStockLevel[]).filter(stockQtyPositive)
      if (rows.length === 0) {
        toast.error(t("toast.noQtyToTransfer"))
        return
      }
      setPendingTransferAllRows(rows)
      setConfirmTransferAll(true)
    } catch (e) {
      if (mountedRef.current) toast.error(parseApiError(e))
    } finally {
      if (mountedRef.current) setPrefetchTransferAll(false)
    }
  }

  const submitEditQty = async () => {
    if (!editQtyRow) return
    const q = parseFloat(editQtyInput.replace(",", "."))
    if (Number.isNaN(q) || q < 0) {
      toast.error(t("toast.enterValidQty"))
      return
    }
    try {
      await adjustMut.mutateAsync({
        warehouse_id: warehouseId,
        stock_item_id: editQtyRow.stock_item,
        quantity: q,
        unit: editQtyRow.stock_item_unit,
        notes: editQtyNotes.trim() || undefined,
      })
      if (!mountedRef.current) return
      toast.success(t("toast.qtyUpdated"))
      const sid = editQtyRow.stock_item
      setEditQtyRow(null)
      qc.invalidateQueries({ queryKey: ["warehouse-inventory-levels", warehouseId] })
      setSelected((prev) => {
        const n = new Set(prev)
        n.delete(sid)
        return n
      })
    } catch (e) {
      if (mountedRef.current) toast.error(parseApiError(e))
    }
  }

  const submitRemoveFromWarehouse = async () => {
    if (!removeRow) return
    try {
      await adjustMut.mutateAsync({
        warehouse_id: warehouseId,
        stock_item_id: removeRow.stock_item,
        quantity: 0,
        unit: removeRow.stock_item_unit,
        notes: t("removeAdjustmentNote"),
      })
      if (!mountedRef.current) return
      toast.success(t("toast.stockZeroed"))
      const sid = removeRow.stock_item
      setRemoveRow(null)
      qc.invalidateQueries({ queryKey: ["warehouse-inventory-levels", warehouseId] })
      setSelected((prev) => {
        const n = new Set(prev)
        n.delete(sid)
        return n
      })
    } catch (e) {
      if (mountedRef.current) setStockMovementApiError(parseApiError(e))
    }
  }

  const submitEditMin = async () => {
    if (!editMinRow) return
    try {
      await setMinMut.mutateAsync({
        warehouseId,
        stock_item_id: editMinRow.stock_item,
        minimum_quantity: editMinInput,
      })
      if (!mountedRef.current) return
      qc.setQueryData<InfiniteData<WarehouseStockLevelsPagePayload>>(
        [...inventoryLevelsQueryKey],
        (old) =>
          patchWarehouseInventoryInfiniteCache(old, (row) =>
            row.stock_item === editMinRow.stock_item
              ? { ...row, minimum_quantity: Number(editMinInput) }
              : row,
          ),
      )
      toast.success(t("toast.minUpdated"))
      setEditMinRow(null)
    } catch (e) {
      if (mountedRef.current) toast.error(parseApiError(e))
    }
  }

  const toggleSelected = (stockItemId: string) => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(stockItemId)) n.delete(stockItemId)
      else n.add(stockItemId)
      return n
    })
  }

  const toggleHistory = (stockItemId: string) => {
    setExpandedStockItemId((prev) => (prev === stockItemId ? null : stockItemId))
  }

  const scrollRef = useRef<HTMLDivElement>(null)
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: levels.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const r = levels[index]
      if (!r) return ROW_COLLAPSED_EST
      return expandedStockItemId === r.stock_item ? ROW_EXPANDED_EST : ROW_COLLAPSED_EST
    },
    overscan: 10,
    getItemKey: (index) => levels[index]?.stock_item ?? String(index),
  })

  useEffect(() => {
    rowVirtualizer.measure()
  }, [expandedStockItemId, rowVirtualizer])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [debouncedSearch])

  useEffect(() => {
    const root = scrollRef.current
    const target = loadMoreSentinelRef.current
    if (!root || !target || !hasNextPage) return

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting)
        if (hit && hasNextPage && !isFetchingNextPage) {
          queueMicrotask(() => {
            void fetchNextPage()
          })
        }
      },
      { root, rootMargin: "120px", threshold: 0 },
    )
    io.observe(target)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, levels.length])

  const virtualRows = rowVirtualizer.getVirtualItems()

  const toolbar: WarehouseInventoryToolbarProps = {
    filter,
    setFilter,
    targetWarehouseId,
    setTargetWarehouseId,
    transferDate,
    setTransferDate,
    targetOptions,
    handleTransferSelected,
    handleOpenTransferAllDialog,
    clearSelection: () => setSelected(new Set()),
    createMutIsPending: createMut.isPending,
    selectedRowsLength: selectedRows.length,
    prefetchTransferAll,
    transferAllCountLabel: stockLevelsAll.length,
  }

  const levelsVm: WarehouseInventoryLevelsPanelProps = {
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
  }

  const dialogs: WarehouseInventoryModalDialogsProps = {
    warehouseName,
    partialStock,
    setPartialStock,
    confirmTransferAll,
    setConfirmTransferAll,
    pendingTransferAllRows,
    setPendingTransferAllRows,
    editQtyRow,
    setEditQtyRow,
    editQtyInput,
    setEditQtyInput,
    editQtyNotes,
    setEditQtyNotes,
    editMinRow,
    setEditMinRow,
    editMinInput,
    setEditMinInput,
    removeRow,
    setRemoveRow,
    stockMovementApiError,
    setStockMovementApiError,
    createMutIsPending: createMut.isPending,
    adjustMutIsPending: adjustMut.isPending,
    setMinMutIsPending: setMinMut.isPending,
    runCreateTransfer,
    handleTransferAllConfirm,
    submitEditQty,
    submitEditMin,
    submitRemoveFromWarehouse,
  }

  return { toolbar, levels: levelsVm, dialogs }
}
