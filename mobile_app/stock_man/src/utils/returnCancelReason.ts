const KNOWN_REASON_CODES = new Set([
  "EXPIRED",
  "DAMAGED",
  "SUPPLIER_ERROR",
  "ORDER_CANCELLED",
  "QUALITY_ISSUE",
  "RECALL",
  "OTHER",
]);

export function returnCancelReasonLabelKey(
  code?: string | null
): `returnCancel.reasons.${string}` | null {
  if (!code || !KNOWN_REASON_CODES.has(code)) return null;
  return `returnCancel.reasons.${code}` as `returnCancel.reasons.${string}`;
}

export function defaultReturnCancelDateRange() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const iso = `${yyyy}-${mm}-${dd}`;
  return { startDate: iso, endDate: iso };
}

/** API Decimal alanları bazen string gelir; tablo/özet hesapları için normalize eder. */
export function parseMovementMoney(value?: number | string | null): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value).trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function movementLineTotal(row: {
  quantity?: number | string | null;
  unit_price?: number | string | null;
}): number {
  return parseMovementMoney(row.quantity) * parseMovementMoney(row.unit_price);
}

export function summarizeReturnCancelRows(
  rows: { quantity?: number | string | null; unit_price?: number | string | null }[]
) {
  const totalQty = rows.reduce((acc, row) => acc + parseMovementMoney(row.quantity), 0);
  const totalAmount = rows.reduce((acc, row) => acc + movementLineTotal(row), 0);
  return { totalQty, totalAmount };
}
