// ============================================================
// Stock Man — Stock Item Picker (modal)
//
// Bottom-sheet modal that lists stock items. Used by the PO
// wizard's step 2 ("Add items"). The list comes from
// `useStockItems` and is optionally filtered by warehouse
// (the warehouse is passed in by the parent so the picker
// shows the per-warehouse `current_quantity` from the
// stock-levels join).
//
// Search lifts to the React Query key on every keystroke;
// `onSelect(item)` fires + sheet closes on tap.
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
import { Check, Package, ScanLine, Search, X } from "lucide-react-native";
import { BarcodeScannerDialog } from "@/components/scanner/BarcodeScannerDialog";
import { useStockItems } from "@/hooks/useStockItems";
import { useStockItemLookup } from "@/hooks/useStockItemLookup";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { useToast } from "@/components/ui/Toast";
import { extractResults } from "@/types/api";
import { cn } from "@/utils/cn";
import type { StockItem, UUID } from "@/types";

export interface StockItemPickerProps {
  visible: boolean;
  onSelect: (item: StockItem) => void;
  onClose: () => void;
  warehouseId?: UUID;
  /** When true, the list query runs only after `warehouseId` is set. */
  warehouseRequired?: boolean;
  /** IDs of items already added to the wizard — these get
      highlighted so the user can spot duplicates. */
  alreadySelectedIds?: UUID[];
}

export function StockItemPicker({
  visible,
  onSelect,
  onClose,
  warehouseId,
  warehouseRequired = false,
  alreadySelectedIds,
}: StockItemPickerProps) {
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
          accessibilityLabel="stock-item-picker-dismiss"
        />
        {visible ? (
          <StockItemSheet
            key={`${visible}-${warehouseId}`}
            visible={visible}
            onSelect={onSelect}
            onClose={onClose}
            warehouseId={warehouseId}
            warehouseRequired={warehouseRequired}
            alreadySelectedIds={alreadySelectedIds}
          />
        ) : null}
      </View>
    </Modal>
  );
}

interface StockItemSheetProps {
  visible: boolean;
  onSelect: (item: StockItem) => void;
  onClose: () => void;
  warehouseId?: UUID;
  warehouseRequired?: boolean;
  alreadySelectedIds?: UUID[];
}

function StockItemSheet({
  visible,
  onSelect,
  onClose,
  warehouseId,
  warehouseRequired = false,
  alreadySelectedIds,
}: StockItemSheetProps) {
  const { t } = useI18n();
  const toast = useToast();
  const { qtyWithUnit } = useFormatters();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerActive, setScannerActive] = useState(true);
  const debouncedSearch = useDebouncedValue(search, 300);
  const lookup = useStockItemLookup();



  const queryEnabled = warehouseRequired ? Boolean(warehouseId) : true;

  const query = useStockItems(
    {
      warehouse_id: warehouseId,
      search: debouncedSearch || undefined,
      page_size: 200,
    },
    { enabled: visible && queryEnabled }
  );
  const items: StockItem[] = useMemo(
    () => extractResults(query.data) ?? [],
    [query.data]
  );

  const selectedSet = useMemo(
    () => new Set(alreadySelectedIds ?? []),
    [alreadySelectedIds]
  );

  const onPick = useCallback(
    (item: StockItem) => {
      onSelect(item);
      onClose();
    },
    [onClose, onSelect]
  );

  const resolveQuery = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed || !queryEnabled) return;

      const result = await lookup.mutateAsync(trimmed);
      if (result.kind === "exact") {
        onPick(result.item);
        return;
      }
      if (result.kind === "multiple") {
        setSearch(trimmed);
        return;
      }
      toast.error(t("scanner.notFound", { code: trimmed }));
    },
    [lookup, onPick, queryEnabled, t, toast]
  );

  const handleSearchSubmit = useCallback(() => {
    void resolveQuery(search);
  }, [resolveQuery, search]);

  const handleScan = useCallback(
    (code: string) => {
      setScannerActive(false);
      setScannerOpen(false);
      void resolveQuery(code).finally(() => {
        setScannerActive(true);
      });
    },
    [resolveQuery]
  );

  return (
    <>
    <View
      className="bg-card border-t border-border rounded-t-2xl relative"
      style={{ paddingBottom: Math.max(insets.bottom, 12), maxHeight: "85%" }}
    >
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
          <Package size={20} color="#1E40AF" />
        </View>
        <View className="flex-1">
          <Text className="text-h3 text-foreground">
            {t("purchase.addItem")}
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
        <View className="flex-row items-center gap-2">
          <View className="flex-1 flex-row items-center min-h-[48px] rounded-xl border border-input bg-background px-3">
            <Search size={18} color="#64748B" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={handleSearchSubmit}
              placeholder={t("stock.search")}
              placeholderTextColor="#94A3B8"
              className="flex-1 ml-2 text-body text-foreground py-2"
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              editable={queryEnabled}
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
          <Pressable
            onPress={() => {
              if (!queryEnabled) return;
              setScannerActive(true);
              setScannerOpen(true);
            }}
            disabled={!queryEnabled}
            accessibilityRole="button"
            accessibilityLabel={t("stock.scanBarcode")}
            className={cn(
              "h-12 w-12 items-center justify-center rounded-xl",
              queryEnabled ? "bg-primary active:bg-primary/90" : "bg-muted"
            )}
          >
            <ScanLine size={22} color={queryEnabled ? "#FFFFFF" : "#94A3B8"} />
          </Pressable>
        </View>
      </View>

      {!queryEnabled ? (
        <View className="py-12 px-6 items-center">
          <Text className="text-body text-muted-foreground text-center">
            {t("purchase.selectWarehouse")}
          </Text>
        </View>
      ) : query.isPending && items.length === 0 ? (
        <View className="py-10 items-center">
          <ActivityIndicator size="large" color="#1E40AF" />
          <Text className="mt-3 text-caption text-muted-foreground">
            {t("common.loading")}
          </Text>
        </View>
      ) : query.isError ? (
        <View className="py-12 px-6 items-center">
          <Text className="text-body text-destructive text-center">
            {t("errors.unknown")}
          </Text>
        </View>
      ) : items.length === 0 ? (
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
          {items.map((item) => {
            const selected = selectedSet.has(item.id);
            const currentQty = item.current_quantity;
            return (
              <Pressable
                key={item.id}
                onPress={() => onPick(item)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className={cn(
                  "flex-row items-center px-4 py-3 border-b border-border active:opacity-80",
                  selected && "bg-primary/10"
                )}
              >
                <View
                  className={cn(
                    "h-10 w-10 items-center justify-center rounded-lg mr-3",
                    item.is_low_stock ? "bg-warning/15" : "bg-primary/10"
                  )}
                >
                  <Package
                    size={20}
                    color={item.is_low_stock ? "#F59E0B" : "#1E40AF"}
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
                  <View className="flex-row items-center mt-0.5">
                    <Text
                      className="text-caption text-mono text-muted-foreground"
                      numberOfLines={1}
                    >
                      {item.sku}
                    </Text>
                    {currentQty != null ? (
                      <>
                        <Text className="mx-1 text-caption text-muted-foreground">
                          ·
                        </Text>
                        <Text
                          className="text-caption text-muted-foreground"
                          numberOfLines={1}
                        >
                          {qtyWithUnit(currentQty, item.unit)}
                        </Text>
                      </>
                    ) : null}
                  </View>
                </View>
                {selected ? <Check size={20} color="#1E40AF" /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {lookup.isPending ? (
        <View className="absolute inset-0 items-center justify-center bg-black/20 rounded-t-2xl">
          <ActivityIndicator size="large" color="#1E40AF" />
        </View>
      ) : null}
    </View>

    <BarcodeScannerDialog
      visible={scannerOpen}
      onRequestClose={() => setScannerOpen(false)}
      onScan={handleScan}
      active={scannerActive}
      title={t("stock.scanBarcode")}
    />
    </>
  );
}

