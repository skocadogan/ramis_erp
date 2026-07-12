/** Sipariş kalemi eşleştirmesi (mutfak delta satırları için). */
export function orderItemMatchKey(item: {
  product?: string | null;
  variant?: string | null;
  unit_name?: string | null;
  notes?: string | null;
}): string {
  return [
    item.product ?? "",
    item.variant ?? "",
    item.unit_name ?? "",
    (item.notes ?? "").trim(),
  ].join("|");
}

const KITCHEN_PENDING_STATUSES = new Set(["PENDING", "PREPARING"]);

/** Teslim edilmiş ana kalem için açılmış bekleyen mutfak delta adedi. */
export function getPendingKitchenResendQuantity(
  item: {
    id: string;
    status: string;
    quantity: number;
    parent_item?: string | null;
    product?: string | null;
    variant?: string | null;
    unit_name?: string | null;
    notes?: string | null;
  },
  allItems: {
    id: string;
    status: string;
    quantity: number;
    parent_item?: string | null;
    product?: string | null;
    variant?: string | null;
    unit_name?: string | null;
    notes?: string | null;
  }[]
): number {
  if (item.parent_item) return 0;
  const key = orderItemMatchKey(item);
  return allItems
    .filter(
      (other) =>
        other.id !== item.id &&
        !other.parent_item &&
        KITCHEN_PENDING_STATUSES.has(other.status) &&
        orderItemMatchKey(other) === key
    )
    .reduce((sum, other) => sum + other.quantity, 0);
}

/** Modal’da gösterilecek toplam adet (teslim + bekleyen delta). */
export function getEffectiveOrderItemQuantity(
  item: {
    id: string;
    status: string;
    quantity: number;
    parent_item?: string | null;
    product?: string | null;
    variant?: string | null;
    unit_name?: string | null;
    notes?: string | null;
  },
  allItems: {
    id: string;
    status: string;
    quantity: number;
    parent_item?: string | null;
    product?: string | null;
    variant?: string | null;
    unit_name?: string | null;
    notes?: string | null;
  }[]
): number {
  if (item.status === "DELIVERED" && !item.parent_item) {
    return item.quantity + getPendingKitchenResendQuantity(item, allItems);
  }
  return item.quantity;
}

/** Teslim edilmiş kalem için açılan mutfak delta satırı — listede gizlenir. */
export function isKitchenResendPendingSibling(
  item: {
    id: string;
    status: string;
    parent_item?: string | null;
    product?: string | null;
    variant?: string | null;
    unit_name?: string | null;
    notes?: string | null;
  },
  allItems: {
    id: string;
    status: string;
    parent_item?: string | null;
    product?: string | null;
    variant?: string | null;
    unit_name?: string | null;
    notes?: string | null;
  }[]
): boolean {
  if (item.parent_item) return false;
  if (!KITCHEN_PENDING_STATUSES.has(item.status)) return false;
  const key = orderItemMatchKey(item);
  return allItems.some(
    (other) =>
      other.id !== item.id &&
      !other.parent_item &&
      other.status === "DELIVERED" &&
      orderItemMatchKey(other) === key
  );
}
