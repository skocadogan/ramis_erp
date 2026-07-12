import React from "react";
import { FlatList, type FlatListProps } from "react-native";

export type TableListProps<T> = FlatListProps<T>;

/**
 * Virtualized list for data tables. Uses FlatList instead of FlashList
 * because table layouts are often nested inside horizontal ScrollViews,
 * where FlashList cannot measure height reliably.
 */
export function TableList<T>(props: TableListProps<T>) {
  return <FlatList {...props} style={[{ flex: 1 }, props.style]} />;
}

