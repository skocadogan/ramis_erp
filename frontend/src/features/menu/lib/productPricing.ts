/**
 * Menü ürünü satış fiyatı (API: base_price) — yalnızca frontend hesabı.
 * Ondalık gösterim 2 hanedir (UI).
 * Net satış = Brüt × (1 + Vergi% / 100)
 * Brüt = Net ÷ (1 + Vergi% / 100)
 */
export function computeSalePriceFromGrossAndTax(grossStr: string, taxPercentStr: string): string {
  const raw = String(grossStr ?? "").trim()
  if (!raw) return ""
  const brut = parseFloat(raw.replace(",", "."))
  if (!Number.isFinite(brut) || brut <= 0) return ""
  const taxPct = parseFloat(String(taxPercentStr ?? "0").replace(",", ".")) || 0
  const net = brut * (1 + taxPct / 100)
  return net.toFixed(2)
}

/** Net + vergi oranından brüt (KDV hariç) tutar — boş veya geçersiz nette "" */
export function computeGrossFromNetAndTax(netStr: string, taxPercentStr: string): string {
  const raw = String(netStr ?? "").trim()
  if (!raw) return ""
  const net = parseFloat(raw.replace(",", "."))
  if (!Number.isFinite(net) || net <= 0) return ""
  const taxPct = parseFloat(String(taxPercentStr ?? "0").replace(",", ".")) || 0
  const denom = 1 + taxPct / 100
  if (!Number.isFinite(denom) || denom <= 0) return ""
  const gross = net / denom
  return gross.toFixed(2)
}
