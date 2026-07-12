/** Tutar girişi: rakam + tek ondalık nokta (virgül noktaya çevrilir). */
export function normalizeDecimalCashInput(raw: string): string {
  const t = raw.replace(",", ".").replace(/[^\d.]/g, "");
  const dot = t.indexOf(".");
  if (dot === -1) return t;
  return t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, "");
}
