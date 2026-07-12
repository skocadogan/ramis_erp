import type { StockReceiptDraftLine } from "@/features/inventory/types"
import { newClientId } from "@/lib/clientId"
import { parseApiError } from "@/lib/parseApiError"
import type { DraftLineForm } from "./bulkStockEntry.types"

export { parseApiError }

export function newLocalKey(): string {
  return newClientId("row")
}

export function emptyLine(): DraftLineForm {
  return {
    localKey: newLocalKey(),
    isNewProduct: false,
    stock_item: "",
    stock_item_label: undefined,
    temp_name: "",
    temp_sku: "",
    temp_unit: "",
    temp_category: "",
    quantity: "",
    unit: "",
    unit_price: "0",
    lot_number: "",
    expiry_date: "",
  }
}

export function buildPayloadLines(lines: DraftLineForm[]) {
  return lines.map((l, i) => ({
    sort_order: i,
    stock_item: l.isNewProduct ? null : l.stock_item || null,
    temp_name: l.isNewProduct ? l.temp_name.trim() : "",
    temp_sku: l.isNewProduct ? l.temp_sku.trim() : "",
    temp_unit: l.isNewProduct ? l.temp_unit.trim() : "",
    temp_category: l.temp_category || null,
    quantity: l.quantity,
    unit: l.unit.trim(),
    unit_price: l.unit_price || "0",
    lot_number: l.lot_number.trim(),
    expiry_date: l.expiry_date.trim() || null,
  }))
}

export function lineIsValid(l: DraftLineForm): boolean {
  const q = Number(l.quantity)
  if (!Number.isFinite(q) || q <= 0) return false
  if (l.isNewProduct) {
    return !!(l.temp_name.trim() && l.temp_sku.trim() && l.temp_unit.trim())
  }
  return !!l.stock_item
}

export function draftLineFromApi(line: StockReceiptDraftLine): DraftLineForm {
  const isNew = !line.stock_item
  const exp = line.expiry_date
  const sid = line.stock_item || ""
  const label =
    sid && line.stock_item_name
      ? { name: line.stock_item_name, sku: (line.stock_item_sku ?? "").trim() }
      : undefined
  return {
    localKey: newLocalKey(),
    isNewProduct: isNew,
    stock_item: sid,
    stock_item_label: label,
    temp_name: line.temp_name || "",
    temp_sku: line.temp_sku || "",
    temp_unit: line.temp_unit || "",
    temp_category: line.temp_category || "",
    quantity: line.quantity != null ? String(line.quantity) : "",
    unit: line.unit || "",
    unit_price: line.unit_price != null ? String(line.unit_price) : "0",
    lot_number: line.lot_number || "",
    expiry_date: exp ? String(exp).slice(0, 10) : "",
  }
}
