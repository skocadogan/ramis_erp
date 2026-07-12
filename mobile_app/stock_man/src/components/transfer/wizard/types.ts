import type { WarehouseTransferCreateItem } from "@/types";

export type DraftItem = WarehouseTransferCreateItem & {
  stock_item_name?: string;
  stock_item_sku?: string;
};
