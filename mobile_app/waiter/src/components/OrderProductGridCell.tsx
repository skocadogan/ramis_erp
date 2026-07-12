import React, { memo } from "react";
import { ProductCard } from "./ProductCard";
import {
  usePosStore,
  selectCartQtyForProduct,
  selectCartFirstItemForProduct,
} from "../store/usePosStore";
import type { CartAddResult } from "../store/usePosStore";
import type { StockTrackingMode } from "../api/posStockCheck";
import type { Product } from "../types/models";

type Props = {
  product: Product;
  orderedQty: number;
  productItemWidth: number;
  stockTrackingMode: StockTrackingMode;
  catalogProducts: Product[];
  onPress: (product: Product) => void;
  onLongPress?: (product: Product) => void;
  onUpdateQuantity: (cartId: string, delta: number) => void;
  onCartLimit?: (result: CartAddResult) => void;
};

/** Ürün grid hücresi — yalnızca ilgili ürünün sepet miktarına abone olur. */
export const OrderProductGridCell = memo(function OrderProductGridCell({
  product,
  orderedQty,
  productItemWidth,
  stockTrackingMode,
  catalogProducts,
  onPress,
  onLongPress,
  onUpdateQuantity,
  onCartLimit,
}: Props) {
  const productId = String(product.id);
  const cartQty = usePosStore(selectCartQtyForProduct(productId));
  const cartItem = usePosStore(selectCartFirstItemForProduct(productId));

  return (
    <ProductCard
      product={product}
      orderedQty={orderedQty}
      cartQty={cartQty}
      cartItem={cartItem}
      productItemWidth={productItemWidth}
      stockTrackingMode={stockTrackingMode}
      onPress={onPress}
      onLongPress={onLongPress}
      onUpdateQuantity={onUpdateQuantity}
      catalogProducts={catalogProducts}
      onCartLimit={onCartLimit}
    />
  );
});
