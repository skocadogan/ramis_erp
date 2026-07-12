/** Sipariş kalemini fiş baskı context satırına dönüştürür. */
export function receiptLineFromOrderItem(item: {
  product_name: string
  quantity: number
  unit_price: number
  unit_name?: string | null
  product_tax_rate?: number | null
  notes?: string | null
  modifiers?: Array<{ modifier_name?: string; name?: string; price?: number | string }>
}) {
  const modifierEntries = (item.modifiers ?? [])
    .map((m) => ({
      name: String(m.modifier_name ?? m.name ?? "").trim(),
      price: parseFloat(String(m.price ?? 0)) || 0,
    }))
    .filter((m) => m.name)

  return {
    name: item.product_name,
    qty: item.quantity,
    price: item.unit_price,
    unit: item.unit_name || "",
    tax_rate: Number(item.product_tax_rate ?? 0),
    ...(modifierEntries.length
      ? {
          modifier_entries: modifierEntries,
          modifier_names: modifierEntries.map((m) => m.name),
          modifiers: modifierEntries,
        }
      : {}),
    ...(item.notes?.trim() ? { notes: item.notes.trim() } : {}),
  }
}
