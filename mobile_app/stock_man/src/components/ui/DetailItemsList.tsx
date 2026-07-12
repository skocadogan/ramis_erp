import React from "react";
import { View } from "react-native";
import type { ListRenderItem } from "@shopify/flash-list";

type DetailItemsListProps<T> = {
  data: readonly T[] | null | undefined;
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  itemHeight?: number;
};

/**
 * Renders item rows inside a parent ScrollView without virtualization.
 * Avoids FlashList height clipping in nested scroll layouts.
 */
export function DetailItemsList<T>({
  data,
  renderItem,
  keyExtractor,
}: DetailItemsListProps<T>) {
  const rows = data ?? [];

  return (
    <View>
      {rows.map((item, index) => (
        <React.Fragment key={keyExtractor(item, index)}>
          {renderItem({ item, index, target: "Cell", extraData: undefined })}
        </React.Fragment>
      ))}
    </View>
  );
}

