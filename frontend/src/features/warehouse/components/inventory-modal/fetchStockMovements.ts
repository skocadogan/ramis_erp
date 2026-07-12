import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import type { StockMovement } from "@/features/inventory/types"

export async function fetchAllStockMovementsForItem(stockItemId: string): Promise<StockMovement[]> {
  const out: StockMovement[] = []
  let page = 1
  for (;;) {
    const data = await inventoryApi.getStockMovements({
      stock_item_id: stockItemId,
      page_size: 500,
      page,
    })
    const results = data.results ?? []
    out.push(...results)
    if (!data.next || results.length === 0) break
    page += 1
  }
  return out
}
