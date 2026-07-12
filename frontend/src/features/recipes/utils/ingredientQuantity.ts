/** Reçete malzemesi miktarı: en fazla 2 ondalık; gereksiz sondaki sıfırları kırpar */
export function formatIngredientQuantityDisplay(v: string | number): string {
  if (v === "" || v === null || v === undefined) return ""
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", ".").trim())
  if (Number.isNaN(n)) return ""
  return String(parseFloat(n.toFixed(2)))
}
