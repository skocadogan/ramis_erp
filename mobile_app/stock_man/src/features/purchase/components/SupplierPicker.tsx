// ============================================================
// Stock Man — Supplier Picker (modal)
// ============================================================

import React, { useCallback, useState } from "react";
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
import { Check, Phone, Search, Truck, User, X } from "lucide-react-native";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useI18n } from "@/i18n";
import { extractResults } from "@/types/api";
import { cn } from "@/utils/cn";
import type { Supplier, UUID } from "@/types";

export interface SupplierPickerProps {
  visible: boolean;
  value: UUID | null;
  onSelect: (id: UUID) => void;
  onClose: () => void;
}

export function SupplierPicker({
  visible,
  value,
  onSelect,
  onClose,
}: SupplierPickerProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const query = useSuppliers({ search: search || undefined, page: 1 });
  const suppliers: Supplier[] = extractResults(query.data) ?? [];

  const onPick = useCallback(
    (s: Supplier) => {
      onSelect(s.id);
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
          accessibilityLabel="supplier-picker-dismiss"
        />
        <View
          className="bg-card border-t border-border rounded-t-2xl"
          style={{ paddingBottom: Math.max(insets.bottom, 12), maxHeight: "85%" }}
        >
          <View className="flex-row items-center px-4 py-3 border-b border-border">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
              <Truck size={20} color="#1E40AF" />
            </View>
            <View className="flex-1">
              <Text className="text-h3 text-foreground">
                {t("purchase.selectSupplier")}
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

          {query.isPending && suppliers.length === 0 ? (
            <View className="py-10 items-center">
              <ActivityIndicator size="large" color="#1E40AF" />
              <Text className="mt-3 text-caption text-muted-foreground">
                {t("common.loading")}
              </Text>
            </View>
          ) : suppliers.length === 0 ? (
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
              {suppliers.map((item) => {
                const selected = item.id === value;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => onPick(item)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className={cn(
                      "flex-row items-center px-4 py-3.5 border-b border-border active:opacity-80",
                      selected && "bg-primary/10"
                    )}
                  >
                    <View
                      className={cn(
                        "h-10 w-10 items-center justify-center rounded-full mr-3",
                        selected ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <Truck
                        size={20}
                        color={selected ? "#FFFFFF" : "#64748B"}
                      />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text
                        className={cn(
                          "text-body font-semibold",
                          selected ? "text-primary" : "text-foreground"
                        )}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      {item.contact_person ? (
                        <View className="flex-row items-center mt-0.5">
                          <User size={12} color="#64748B" />
                          <Text
                            className="ml-1 text-caption text-muted-foreground"
                            numberOfLines={1}
                          >
                            {item.contact_person}
                          </Text>
                        </View>
                      ) : null}
                      {item.phone ? (
                        <View className="flex-row items-center mt-0.5">
                          <Phone size={12} color="#64748B" />
                          <Text
                            className="ml-1 text-caption text-muted-foreground"
                            numberOfLines={1}
                          >
                            {item.phone}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {selected ? <Check size={20} color="#1E40AF" /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

