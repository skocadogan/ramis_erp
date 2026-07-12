/** Depo envanter modalında kullanılan satır şekli (API `unknown[]` sonuçları için dar tip) */
export type WarehouseInventoryStockLevel = {
  id: string
  stock_item: string
  stock_item_name: string
  stock_item_sku: string
  stock_item_unit: string
  quantity: number
  minimum_quantity: number
  is_low_stock: boolean
}

export type TransferLineItem = {
  stock_item_id: string
  quantity: number
  unit: string
  notes: string
}
