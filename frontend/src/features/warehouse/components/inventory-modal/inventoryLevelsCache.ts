import type { InfiniteData } from "@tanstack/react-query"
import type { WarehouseStockLevelsPagePayload } from "@/features/warehouse/services/warehouseApi"
import type { WarehouseInventoryStockLevel } from "./types"

export function patchWarehouseInventoryInfiniteCache(
  old: InfiniteData<WarehouseStockLevelsPagePayload> | undefined,
  patchRow: (row: WarehouseInventoryStockLevel) => WarehouseInventoryStockLevel,
): InfiniteData<WarehouseStockLevelsPagePayload> | undefined {
  if (!old) return old
  return {
    ...old,
    pages: old.pages.map((page) => ({
      ...page,
      results: page.results.map((raw) => patchRow(raw as WarehouseInventoryStockLevel)),
    })),
  }
}
