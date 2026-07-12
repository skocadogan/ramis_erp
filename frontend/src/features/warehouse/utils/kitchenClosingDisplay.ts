import { formatNumber } from "@/lib/formatters"

/** Gün sonu kapanış notlarındaki ham ondalık değerleri okunur biçime çevirir. */
export function formatKitchenClosingNotes(notes?: string | null): string {
  const raw = (notes || "").trim()
  if (!raw) return "—"

  return raw.replace(
    /(Teorik|Sayılan|Fire):\s*([-+]?\d+(?:[.,]\d+)?)/gi,
    (_, label: string, num: string) =>
      `${label}: ${formatNumber(num, { minimumFractionDigits: 0, maximumFractionDigits: 6 })}`,
  )
}
