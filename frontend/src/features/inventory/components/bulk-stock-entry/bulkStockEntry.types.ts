import type { StockCategory, StockUnit, Supplier } from "@/features/inventory/types"

export type WarehouseOpt = { id: string; name: string }

/** Form satırı (local key ile React listesi) */
export type DraftLineForm = {
  localKey: string
  isNewProduct: boolean
  stock_item: string
  /** Taslak API'den gelen ürün adı/SKU — GET getStockItem atlamak için (yalnızca istemci) */
  stock_item_label?: { name: string; sku: string }
  temp_name: string
  temp_sku: string
  temp_unit: string
  temp_category: string
  quantity: string
  unit: string
  unit_price: string
  lot_number: string
  expiry_date: string
}

export type BulkStockEntryModalProps = {
  open: boolean
  onClose: () => void
  onDone: () => void
  warehouses: WarehouseOpt[]
  suppliers: Supplier[]
  stockUnits: StockUnit[]
  categories: StockCategory[]
  /** Modal açıldığında tabloya otomatik eklenen satırlar (ör. kritik stok kalemleri) */
  initialLines?: DraftLineForm[]
}
