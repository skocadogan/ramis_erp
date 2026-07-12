import type { GoodsReceivingCreateItem } from "@/services/goodsReceivingService";

export type DraftItem = GoodsReceivingCreateItem & {
  stock_item_name?: string;
  stock_item_sku?: string;
};
