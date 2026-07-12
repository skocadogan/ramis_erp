import type { OrderItem } from "../types";

export type KdsDisplayRow =
  | { type: "single"; item: OrderItem }
  | {
      type: "combined";
      parentItemId: string;
      parentName: string;
      parentQty: number;
      components: OrderItem[];
    };

/** Birleşik ürün alt kalemlerini ana satır altında gruplar; sıralama korunur. */
export function buildKdsDisplayRows(sortedItems: OrderItem[]): KdsDisplayRow[] {
  const rows: KdsDisplayRow[] = [];
  const seenParents = new Set<string>();

  for (const item of sortedItems) {
    if (item.parent_item && item.combined_parent_name) {
      if (seenParents.has(item.parent_item)) continue;
      seenParents.add(item.parent_item);
      const components = sortedItems.filter((i) => i.parent_item === item.parent_item);
      rows.push({
        type: "combined",
        parentItemId: item.parent_item,
        parentName: item.combined_parent_name,
        parentQty: Number(item.combined_parent_quantity) || 1,
        components,
      });
      continue;
    }
    if (!item.parent_item) {
      rows.push({ type: "single", item });
    }
  }

  return rows;
}
