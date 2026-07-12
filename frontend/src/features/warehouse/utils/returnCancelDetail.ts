import type { StockMovement } from "@/features/inventory/types"

export type ReturnCancelNotesMeta = {
  purchaseOrder: string | null
  goodsReceiving: string | null
  userNotes: string | null
  fullNotes: string | null
}

export function parseReturnCancelNotesMeta(notes?: string | null): ReturnCancelNotesMeta {
  const raw = (notes || "").trim()
  if (!raw) {
    return { purchaseOrder: null, goodsReceiving: null, userNotes: null, fullNotes: null }
  }

  const purchaseOrder =
    raw.match(/Satın alma:\s*([^|]+)/i)?.[1]?.trim() ??
    raw.match(/Purchase order:\s*([^|]+)/i)?.[1]?.trim() ??
    null

  const goodsReceiving =
    raw.match(/Mal kabul red\s*#?\s*([^\s|]+)/i)?.[1]?.trim() ?? null

  const userParts = raw
    .split("|")
    .map((part) => part.trim())
    .filter(
      (part) =>
        part &&
        !/^Satın alma:/i.test(part) &&
        !/^Purchase order:/i.test(part) &&
        !/^Mal kabul red/i.test(part),
    )

  return {
    purchaseOrder,
    goodsReceiving,
    userNotes: userParts.length > 0 ? userParts.join(" | ") : null,
    fullNotes: raw,
  }
}

export function returnCancelLineTotal(row: Pick<StockMovement, "quantity" | "unit_price">): number {
  const qty = Number(row.quantity) || 0
  const price = Number(row.unit_price) || 0
  return qty * price
}

export function isKnownReturnCancelReason(code?: string | null): boolean {
  if (!code) return false
  return code in {
    EXPIRED: 1,
    DAMAGED: 1,
    SUPPLIER_ERROR: 1,
    ORDER_CANCELLED: 1,
    QUALITY_ISSUE: 1,
    RECALL: 1,
    OTHER: 1,
  }
}
