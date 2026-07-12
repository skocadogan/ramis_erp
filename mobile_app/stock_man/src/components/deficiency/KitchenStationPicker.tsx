// ============================================================
// Stock Man — Kitchen Station Picker (modal)
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
import { Check, ChefHat, Search, Warehouse, X } from "lucide-react-native";
import { useKitchenStations } from "@/hooks/useKitchenStations";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import type { KitchenStation, UUID } from "@/types";

export interface KitchenStationPickerProps {
  visible: boolean;
  value: UUID | null;
  onSelect: (station: KitchenStation) => void;
  onClose: () => void;
  /** Liste filtresi modunda seçimi temizlemek için */
  allowClear?: boolean;
  onClear?: () => void;
}

export function KitchenStationPicker({
  visible,
  value,
  onSelect,
  onClose,
  allowClear = false,
  onClear,
}: KitchenStationPickerProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const query = useKitchenStations();
  const allStations: KitchenStation[] = useMemo(
    () => (Array.isArray(query.data) ? query.data : []),
    [query.data]
  );

  const stations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allStations;
    return allStations.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.warehouse_name ?? "").toLowerCase().includes(q)
    );
  }, [allStations, search]);

  const onPick = useCallback(
    (station: KitchenStation) => {
      onSelect(station);
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
          accessibilityLabel="kitchen-station-picker-dismiss"
        />
        <View
          className="bg-card border-t border-border rounded-t-2xl"
          style={{ paddingBottom: Math.max(insets.bottom, 12), maxHeight: "85%" }}
        >
          <View className="flex-row items-center px-4 py-3 border-b border-border">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-warning/10 mr-3">
              <ChefHat size={20} color="#F59E0B" />
            </View>
            <View className="flex-1">
              <Text className="text-h3 text-foreground">
                {t("deficiency.selectKitchenStation")}
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

          {query.isPending && stations.length === 0 ? (
            <View className="py-10 items-center">
              <ActivityIndicator size="large" color="#1E40AF" />
              <Text className="mt-3 text-caption text-muted-foreground">
                {t("common.loading")}
              </Text>
            </View>
          ) : stations.length === 0 ? (
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
              {allowClear && value ? (
                <Pressable
                  onPress={() => {
                    onClear?.();
                    onClose();
                  }}
                  accessibilityRole="button"
                  className="flex-row items-center px-4 py-3.5 border-b border-border active:opacity-80 bg-muted/30"
                >
                  <Text className="text-body font-medium text-muted-foreground">
                    {t("deficiency.allKitchenStations")}
                  </Text>
                </Pressable>
              ) : null}
              {stations.map((item) => {
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
                        selected ? "bg-warning" : "bg-muted"
                      )}
                    >
                      <ChefHat
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
                      {item.warehouse_name ? (
                        <View className="flex-row items-center mt-0.5">
                          <Warehouse size={12} color="#64748B" />
                          <Text
                            className="ml-1 text-caption text-muted-foreground"
                            numberOfLines={1}
                          >
                            {item.warehouse_name}
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

