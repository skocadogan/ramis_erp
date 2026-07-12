import type { TransferLineItem, WarehouseInventoryStockLevel } from "./types"

export function stockQtyPositive(row: WarehouseInventoryStockLevel) {
  return row.quantity > 0
}

export function rowsToTransferItems(rows: WarehouseInventoryStockLevel[]): TransferLineItem[] {
  return rows
    .filter(stockQtyPositive)
    .map((r) => ({
      stock_item_id: r.stock_item,
      quantity: r.quantity,
      unit: r.stock_item_unit,
      notes: "",
    }))
}

export function parseTransferQtyInput(raw: string): number {
  const n = parseFloat(String(raw).replace(",", ".").trim())
  return Number.isFinite(n) ? n : 0
}

export function clampTransferQty(row: WarehouseInventoryStockLevel, qty: number): number {
  if (!stockQtyPositive(row)) return 0
  const max = Number(row.quantity)
  if (!Number.isFinite(max)) return 0
  return Math.min(Math.max(0, qty), max)
}

/** Seçilen satırlar için transfer miktarı > 0 olan kalemleri üretir */
export function rowsToTransferItemsFromInputs(
  rows: WarehouseInventoryStockLevel[],
  qtyByItem: Record<string, string>,
): TransferLineItem[] {
  const items: TransferLineItem[] = []
  for (const r of rows) {
    const raw = qtyByItem[r.stock_item] ?? "0"
    const q = clampTransferQty(r, parseTransferQtyInput(raw))
    if (q > 0) {
      items.push({
        stock_item_id: r.stock_item,
        quantity: q,
        unit: r.stock_item_unit,
        notes: "",
      })
    }
  }
  return items
}
