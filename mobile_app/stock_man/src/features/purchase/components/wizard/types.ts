import type { PurchaseOrderCreateItem } from "@/types";

export type DraftItem = PurchaseOrderCreateItem & {
  stock_item_name?: string;
  stock_item_sku?: string;
};
