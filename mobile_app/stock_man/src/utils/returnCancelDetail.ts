import type { StockMovement } from "@/types";
import { movementLineTotal, parseMovementMoney } from "@/utils/returnCancelReason";

export type ReturnCancelNotesMeta = {
  purchaseOrder: string | null;
  goodsReceiving: string | null;
  userNotes: string | null;
  fullNotes: string | null;
};

export function parseReturnCancelNotesMeta(notes?: string | null): ReturnCancelNotesMeta {
  const raw = (notes || "").trim();
  if (!raw) {
    return { purchaseOrder: null, goodsReceiving: null, userNotes: null, fullNotes: null };
  }

  const purchaseOrder =
    raw.match(/Satın alma:\s*([^|]+)/i)?.[1]?.trim() ??
    raw.match(/Purchase order:\s*([^|]+)/i)?.[1]?.trim() ??
    null;

  const goodsReceiving =
    raw.match(/Mal kabul red\s*#?\s*([^\s|]+)/i)?.[1]?.trim() ?? null;

  const userParts = raw
    .split("|")
    .map((part) => part.trim())
    .filter(
      (part) =>
        part &&
        !/^Satın alma:/i.test(part) &&
        !/^Purchase order:/i.test(part) &&
        !/^Mal kabul red/i.test(part)
    );

  return {
    purchaseOrder,
    goodsReceiving,
    userNotes: userParts.length > 0 ? userParts.join(" | ") : null,
    fullNotes: raw,
  };
}

export function returnCancelDisplayTotal(row: StockMovement): number {
  return movementLineTotal(row);
}

export { parseMovementMoney };
