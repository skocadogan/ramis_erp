// ============================================================
// Smart Table — Cart List Component
// FlatList wrapper for cart items.
// ============================================================

import React, { useCallback } from "react";
import { FlatList } from "react-native";
import { CartItemRow } from "./CartItemRow";
import type { CartItem } from "@/types";

interface CartListProps {
  items: CartItem[];
  language: "tr" | "en";
  onUpdateQuantity: (item: CartItem, qty: number) => void;
  onRemove: (item: CartItem) => void;
  useSplitLayout?: boolean;
}

export const CartList = React.memo(function CartList({
  items,
  language,
  onUpdateQuantity,
  onRemove,
  useSplitLayout,
}: CartListProps) {
  const renderCartItem = useCallback(
    ({ item }: { item: CartItem }) => (
      <CartItemRow
        item={item}
        language={language}
        onUpdateQuantity={onUpdateQuantity}
        onRemove={onRemove}
      />
    ),
    [language, onUpdateQuantity, onRemove],
  );

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={renderCartItem}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: useSplitLayout ? 20 : 8,
      }}
      showsVerticalScrollIndicator={false}
      className="flex-1"
      keyboardShouldPersistTaps="handled"
    />
  );
});
