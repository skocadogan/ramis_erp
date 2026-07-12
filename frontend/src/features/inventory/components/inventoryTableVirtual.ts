/**
 * Envanter listelerinde @tanstack/react-virtual için tahmini satır yükseklikleri ve overscan.
 * Gerçek yükseklik `measureElement` (FEFO) veya sabit tahmin (kalemler / hareketler) ile düzeltilir.
 */

/** Tailwind `lg` — geniş ekranda daha fazla overscan (daha akıcı kaydırma, biraz daha DOM). */
export const INVENTORY_VIRTUAL_LG_QUERY = "(min-width: 1024px)"

/** Ürün satırı: py-2, kategori iki satır, durum rozeti — ~52–56px bandı */
export const INVENTORY_ITEM_ROW_ESTIMATE_PX = 54

/** Hareket satırı: tek satır metin, py-2 — ~48–52px */
export const INVENTORY_MOVEMENT_ROW_ESTIMATE_PX = 50

/** FEFO ana satır: py-3, ürün adı + SKU — ~56–60px */
export const FEFO_ROW_ESTIMATE_MAIN_PX = 58

/** FEFO lot detay satırı: py-3, ikon + metin — ~48–52px */
export const FEFO_LOT_ROW_ESTIMATE_PX = 50

export type InventoryVirtualTableKind = "items" | "movements" | "fefo" | "fefo-lot"

export function getInventoryVirtualOverscan(
  isLg: boolean,
  table: InventoryVirtualTableKind
): number {
  if (table === "fefo") return isLg ? 14 : 7
  if (table === "fefo-lot") return isLg ? 12 : 6
  if (table === "items") return isLg ? 12 : 6
  return isLg ? 11 : 5
}
