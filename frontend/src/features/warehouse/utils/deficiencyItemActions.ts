export type DeficiencyItemAction =
  | "PURCHASE_ALL"
  | "PURCHASE_PARTIAL"
  | "FULFILL_STOCK"
  | "REJECT"

export interface DeficiencyAvailabilityRow {
  item_id: string
  total_available: string
  can_fully_fulfill: boolean
  can_partially_fulfill: boolean
}

export interface DeficiencyActionPlanSummary {
  report_id: string
  report_number: string
  lines: Array<{
    item_id: string
    stock_item_name: string
    unit: string
    requested_quantity: string
    action: DeficiencyItemAction
    transfer_quantity: string
    purchase_quantity: string
  }>
  transfers: Array<{
    source_warehouse_name: string
    items: Array<{ stock_item_name: string; quantity: string; unit: string }>
  }>
  purchases: Array<{ stock_item_name: string; quantity: string; unit: string }>
  rejected: Array<{ stock_item_name: string }>
  requires_purchase_config: boolean
}

export function suggestDeficiencyItemAction(
  avail: DeficiencyAvailabilityRow | undefined,
): DeficiencyItemAction {
  if (avail?.can_fully_fulfill) return "FULFILL_STOCK"
  if (avail?.can_partially_fulfill) return "PURCHASE_PARTIAL"
  return "PURCHASE_ALL"
}

export function isDeficiencyActionAllowed(
  action: DeficiencyItemAction,
  avail: DeficiencyAvailabilityRow | undefined,
): boolean {
  if (action === "FULFILL_STOCK") return !!avail?.can_fully_fulfill
  if (action === "PURCHASE_PARTIAL") {
    return !!avail && parseFloat(avail.total_available) > 0
  }
  return true
}

export function buildInitialItemActions(
  itemIds: string[],
  availability: DeficiencyAvailabilityRow[],
): Record<string, DeficiencyItemAction> {
  const byId = new Map(availability.map((a) => [a.item_id, a]))
  const out: Record<string, DeficiencyItemAction> = {}
  for (const id of itemIds) {
    out[id] = suggestDeficiencyItemAction(byId.get(id))
  }
  return out
}
