const QUANTITY_UNIT_CONVERSIONS: Record<string, { smallerUnit: string; factor: number }> = {
  kg: { smallerUnit: "g", factor: 1000 },
  Lt: { smallerUnit: "ml", factor: 1000 },
};

function formatNumber(value: number, fractionDigits = 2): string {
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function parseStockQty(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function formatQuantityWithUnit(value: number | string, unit: string): string {
  const num =
    typeof value === "number"
      ? value
      : Number(String(value).trim().replace(/\s/g, "").replace(",", "."));

  if (!Number.isFinite(num)) return `${value} ${unit ?? ""}`.trim();

  const absNum = Math.abs(num);
  const conv = QUANTITY_UNIT_CONVERSIONS[unit];

  if (conv && absNum > 0 && absNum < 1) {
    const converted = absNum * conv.factor;
    const formatted = converted.toLocaleString("tr-TR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    });
    return `${formatted} ${conv.smallerUnit}`;
  }

  return `${formatNumber(absNum, 2)} ${unit ?? ""}`.trim();
}
