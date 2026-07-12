// ============================================================
// Stock Man — Warehouse Picker (modal)
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, Search, Warehouse as WarehouseIcon, X } from "lucide-react-native";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useI18n } from "@/i18n";
import type { UUID, Warehouse as WarehouseT } from "@/types";

export interface WarehousePickerProps {
  visible: boolean;
  excludeId?: UUID;
  title?: string;
  onSelect: (warehouse: WarehouseT) => void;
  onClose: () => void;
}

export function WarehousePicker({
  visible,
  excludeId,
  title,
  onSelect,
  onClose,
}: WarehousePickerProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const query = useWarehouses({ search: search || undefined });
  const allWarehouses: WarehouseT[] = useMemo(
    () => (Array.isArray(query.data) ? query.data : []),
    [query.data]
  );

  const warehouses = useMemo(
    () => allWarehouses.filter((w) => w.id !== excludeId),
    [allWarehouses, excludeId]
  );

  const onPick = useCallback(
    (w: WarehouseT) => {
      onSelect(w);
      onClose();
    },
    [onSelect, onClose]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable
          onPress={onClose}
          className="absolute inset-0 bg-black/60"
          accessibilityLabel="warehouse-picker-dismiss"
        />
        <View
          className="bg-card border-t border-border rounded-t-2xl"
          style={{ paddingBottom: Math.max(insets.bottom, 12), maxHeight: "85%" }}
        >
          <View className="flex-row items-center px-4 py-3 border-b border-border">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
              <WarehouseIcon size={20} color="#1E40AF" />
            </View>
            <View className="flex-1">
              <Text className="text-h3 text-foreground">
                {title ?? t("purchase.warehouse")}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
              hitSlop={8}
            >
              <X size={20} color="#64748B" />
            </Pressable>
          </View>

          <View className="px-4 py-3 border-b border-border">
            <View className="flex-row items-center min-h-[48px] rounded-xl border border-input bg-background px-3">
              <Search size={18} color="#64748B" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t("common.searchPlaceholder")}
                placeholderTextColor="#94A3B8"
                className="flex-1 ml-2 text-body text-foreground py-2"
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
                accessibilityLabel={t("common.search")}
              />
              {search.length > 0 ? (
                <Pressable
                  onPress={() => setSearch("")}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.clear")}
                  className="p-1 rounded-md active:bg-muted"
                  hitSlop={8}
                >
                  <X size={16} color="#64748B" />
                </Pressable>
              ) : null}
            </View>
          </View>

          {query.isPending && warehouses.length === 0 ? (
            <View className="py-10 items-center">
              <ActivityIndicator size="large" color="#1E40AF" />
              <Text className="mt-3 text-caption text-muted-foreground">
                {t("common.loading")}
              </Text>
            </View>
          ) : warehouses.length === 0 ? (
            <View className="py-12 px-6 items-center">
              <Text className="text-body text-foreground text-center">
                {t("common.noData")}
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{ maxHeight: 420 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {warehouses.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => onPick(item)}
                  accessibilityRole="button"
                  className="flex-row items-center px-4 py-3.5 border-b border-border active:opacity-80"
                >
                  <View className="h-10 w-10 items-center justify-center rounded-full mr-3 bg-primary/10">
                    <WarehouseIcon size={20} color="#1E40AF" />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text
                      className="text-body font-semibold text-foreground"
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    {item.code ? (
                      <Text
                        className="text-caption text-mono text-muted-foreground mt-0.5"
                        numberOfLines={1}
                      >
                        {item.code}
                      </Text>
                    ) : null}
                    {item.warehouse_type_display ? (
                      <Text
                        className="text-caption text-primary mt-0.5"
                        numberOfLines={1}
                      >
                        {item.warehouse_type_display}
                      </Text>
                    ) : null}
                  </View>
                  <Check size={20} color="#1E40AF" />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

