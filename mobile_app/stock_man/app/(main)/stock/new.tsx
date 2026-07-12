// ============================================================
// Stock Man — New Stock Item
//
// Simple form for creating a stock item. Only `name` and `sku`
// are required by the backend; all other fields are optional
// with sensible defaults.
//
// UNITS / CATEGORIES are loaded from the cache via the
// existing `useStockUnits` / `useStockCategories` queries.
// The barcode field has a scan button. If the scanned barcode
// is already registered, a dialog shows the existing product;
// otherwise the value is written into the barcode input.
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Check, ChevronLeft, FolderTree, Package, ScanLine, X } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { BarcodeScannerDialog } from "@/components/scanner/BarcodeScannerDialog";
import { StockCategoryTree } from "@/components/stock/StockCategoryTree";
import { useI18n } from "@/i18n";
import { useToast } from "@/components/ui/Toast";
import {
  useCreateStockItem,
  useStockCategories,
  useStockUnits,
} from "@/hooks/useStockItems";
import { scannerService } from "@/services/scannerService";
import { cn } from "@/utils/cn";
import { extractApiError } from "@/utils/apiError";
import type { StockCategory, StockItem, UUID } from "@/types";

export default function NewStockItemScreen() {
  const { t } = useI18n();
  const toast = useToast();
  const createItem = useCreateStockItem();
  const params = useLocalSearchParams<{ barcode?: string }>();

  // ── Form state ──────────────────────────────────────────────
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState(params.barcode ?? "");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerActive, setScannerActive] = useState(true);
  const [barcodeLookupPending, setBarcodeLookupPending] = useState(false);
  const [registeredItem, setRegisteredItem] = useState<StockItem | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [unit, setUnit] = useState("adet");
  const [category, setCategory] = useState<UUID | null>(null);
  const [minQty, setMinQty] = useState("0");
  const [purchasePrice, setPurchasePrice] = useState("0");

  // ── Reference data (pulled from cache) ─────────────────────
  const unitsQuery = useStockUnits();
  const categoriesQuery = useStockCategories();

  const units = useMemo(() => unitsQuery.data ?? [], [unitsQuery.data]);
  const categories = useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data]
  );

  // ── Unit / category selection toggles ──────────────────────
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  useEffect(() => {
    if (params.barcode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBarcode(params.barcode);
    }
  }, [params.barcode]);

  const handleBarcodeScan = useCallback(
    async (code: string) => {
      setScannerActive(false);
      setScannerOpen(false);
      setBarcodeLookupPending(true);

      try {
        const result = await scannerService.lookupByBarcode(code);
        if (result.kind === "registered") {
          setScannedBarcode(result.barcode);
          setRegisteredItem(result.item);
        } else {
          setBarcode(result.barcode);
        }
      } catch {
        setBarcode(code.trim());
      } finally {
        setBarcodeLookupPending(false);
        setScannerActive(true);
      }
    },
    []
  );

  const closeRegisteredDialog = useCallback(() => {
    setRegisteredItem(null);
    setScannedBarcode("");
  }, []);

  const openRegisteredProduct = useCallback(() => {
    if (!registeredItem) return;
    const id = registeredItem.id;
    closeRegisteredDialog();
    router.push(`/(main)/stock/${id}` as any);
  }, [closeRegisteredDialog, registeredItem]);

  const canSubmit = name.trim().length > 0 && sku.trim().length > 0 && !createItem.isPending;

  const onSubmit = useCallback(() => {
    if (!canSubmit) return;
    const mq = parseFloat(minQty) || 0;
    const pp = parseFloat(purchasePrice) || 0;
    if ((minQty && mq < 0) || (purchasePrice && pp < 0)) {
      toast.error(t("stock.negativeValue"));
      return;
    }
    const payload: {
      name: string;
      sku: string;
      barcode?: string;
      unit?: string;
      category?: UUID;
      minimum_quantity?: number;
      last_purchase_price?: number;
    } = {
      name: name.trim(),
      sku: sku.trim(),
    };
    if (barcode.trim()) payload.barcode = barcode.trim();
    if (unit && unit !== "adet") payload.unit = unit;
    if (category) payload.category = category;
    if (mq !== 0) payload.minimum_quantity = mq;
    if (pp !== 0) payload.last_purchase_price = pp;

    createItem.mutate(payload, {
      onSuccess: (item) => {
        toast.success(t("stock.createSuccess"));
        router.replace(`/(main)/stock/${item.id}` as any);
      },
      onError: (err: unknown) => {
        toast.error(extractApiError(err, t("stock.createError")));
      },
    });
  }, [canSubmit, name, sku, barcode, unit, category, minQty, purchasePrice, createItem, t, toast]);

  const selectedUnitLabel =
    units.find((u) => u.short_name === unit)?.name ?? unit;
  const selectedCategoryLabel =
    categories.find((c) => c.id === category)?.name ?? "";

  const handleCategorySelect = useCallback((id: UUID | null) => {
    setCategory(id);
    if (id) setCategoryDialogOpen(false);
  }, []);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen padded={false} bottomSafe>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          {/* Header with back */}
          <View className="px-4 pt-2">
            <Header
              title={t("stock.add")}
              subtitle={t("stock.formHint")}
              back
              onBackPress={() => router.back()}
            />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Required fields section */}
            <Card>
              <Text className="text-caption text-muted-foreground font-semibold uppercase mb-3">
                {t("common.required")}
              </Text>

              <View className="gap-4">
                <Input
                  label={t("stock.name")}
                  placeholder={t("stock.name")}
                  value={name}
                  onChangeText={setName}
                  required
                  autoCapitalize="words"
                />
                <Input
                  label={t("stock.sku")}
                  placeholder={t("stock.sku")}
                  value={sku}
                  onChangeText={setSku}
                  required
                  autoCapitalize="characters"
                  hint={t("stock.sku")}
                />
              </View>
            </Card>

            {/* Optional fields section */}
            <View className="mt-4">
              <Card>
                <Text className="text-caption text-muted-foreground font-semibold uppercase mb-3">
                  {t("common.details")} · {t("common.optional")}
                </Text>

                <View className="gap-4">
                  {/* Barcode with scanner shortcut */}
                  <Input
                    label={t("stock.barcode")}
                    placeholder={t("stock.barcode")}
                    value={barcode}
                    onChangeText={setBarcode}
                    rightIcon={ScanLine}
                    onRightIconPress={() => {
                      setScannerActive(true);
                      setScannerOpen(true);
                    }}
                  />

                  {/* Unit picker */}
                  <View>
                    <Text className="text-sm font-medium text-foreground mb-1.5">
                      {t("stock.unit")}
                    </Text>
                    <Pressable
                      onPress={() => setShowUnitPicker((v) => !v)}
                      accessibilityRole="button"
                      accessibilityLabel={t("stock.unit")}
                      className="min-h-[48px] flex-row items-center rounded-xl border border-input bg-background px-3 active:opacity-80"
                    >
                      <View className="flex-1 min-w-0">
                        <Text className="text-body text-foreground">
                          {selectedUnitLabel}
                        </Text>
                      </View>
                      <ChevronLeft
                        size={16}
                        color="#64748B"
                        style={{
                          transform: [{ rotate: showUnitPicker ? "90deg" : "-90deg" }],
                        }}
                      />
                    </Pressable>

                    {showUnitPicker ? (
                      <View className="mt-1 rounded-xl border border-border bg-card overflow-hidden">
                        {units.map((u) => (
                          <Pressable
                            key={u.id}
                            onPress={() => {
                              setUnit(u.short_name);
                              setShowUnitPicker(false);
                            }}
                            className={cn(
                              "flex-row items-center px-3 py-3 active:bg-muted",
                              u.short_name === unit && "bg-primary/10",
                              u.id !== units[units.length - 1]?.id &&
                                "border-b border-border"
                            )}
                          >
                            <View className="flex-1 min-w-0">
                              <Text
                                className={cn(
                                  "text-body",
                                  u.short_name === unit
                                    ? "text-primary font-semibold"
                                    : "text-foreground"
                                )}
                              >
                                {u.name}
                              </Text>
                              <Text className="text-caption text-muted-foreground">
                                {u.short_name}
                              </Text>
                            </View>
                            {u.short_name === unit ? (
                              <Check size={18} color="#1E40AF" />
                            ) : null}
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>

                  {/* Category picker */}
                  <View>
                    <Text className="text-sm font-medium text-foreground mb-1.5">
                      {t("stock.category")}
                    </Text>
                    <View className="flex-row items-center gap-2">
                      <Pressable
                        onPress={() => setCategoryDialogOpen(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t("stock.selectCategory")}
                        className="flex-1 min-h-[48px] flex-row items-center rounded-xl border border-input bg-background px-3 active:opacity-80"
                      >
                        <Text
                          className={cn(
                            "flex-1 text-body",
                            category
                              ? "text-foreground"
                              : "text-muted-foreground"
                          )}
                          numberOfLines={1}
                        >
                          {category
                            ? selectedCategoryLabel
                            : t("stock.selectCategory")}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setCategoryDialogOpen(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t("stock.selectCategory")}
                        className="h-12 w-12 items-center justify-center rounded-xl bg-primary active:bg-primary/90"
                      >
                        <FolderTree size={22} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  </View>

                  {/* Minimum quantity */}
                  <Input
                    label={t("stock.minimumQuantity")}
                    placeholder="0"
                    value={minQty}
                    onChangeText={setMinQty}
                    keyboardType="numeric"
                    hint="-1 = sınırsız"
                  />

                  {/* Last purchase price */}
                  <Input
                    label={t("stock.lastPurchasePrice")}
                    placeholder="0.00"
                    value={purchasePrice}
                    onChangeText={setPurchasePrice}
                    keyboardType="decimal-pad"
                  />
                </View>
              </Card>
            </View>

            {/* Submit */}
            <View className="mt-6">
              <Button
                variant="primary"
                fullWidth
                loading={createItem.isPending}
                disabled={!canSubmit}
                leftIcon={Package}
                onPress={onSubmit}
              >
                {t("common.save")}
              </Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {barcodeLookupPending ? (
          <View className="absolute inset-0 items-center justify-center bg-black/20">
            <Card className="px-6 py-4">
              <ActivityIndicator size="large" color="#1E40AF" />
            </Card>
          </View>
        ) : null}
      </Screen>

      <BarcodeScannerDialog
        visible={scannerOpen}
        onRequestClose={() => setScannerOpen(false)}
        onScan={handleBarcodeScan}
        active={scannerActive}
        title={t("stock.scanBarcode")}
      />

      <RegisteredBarcodeDialog
        visible={!!registeredItem}
        item={registeredItem}
        barcode={scannedBarcode}
        onClose={closeRegisteredDialog}
        onViewProduct={openRegisteredProduct}
        t={t}
      />

      <CategoryPickerDialog
        visible={categoryDialogOpen}
        categories={categories}
        selectedId={category}
        onSelect={handleCategorySelect}
        onClose={() => setCategoryDialogOpen(false)}
        t={t}
      />
    </>
  );
}

function CategoryPickerDialog({
  visible,
  categories,
  selectedId,
  onSelect,
  onClose,
  t,
}: {
  visible: boolean;
  categories: StockCategory[];
  selectedId: UUID | null;
  onSelect: (id: UUID | null) => void;
  onClose: () => void;
  t: (key: string) => string;
}) {
  const { height: screenHeight } = useWindowDimensions();
  const modalMaxHeight = Math.round(screenHeight * 0.85);
  // Header, search, chip, OK button, padding and gaps
  const chromeHeight = 56 + 44 + 40 + 52 + 48;
  const treeMaxHeight = Math.max(120, modalMaxHeight - chromeHeight);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
        className="flex-1 items-center justify-center bg-black/60 px-4"
      >
        <Pressable
          onPress={() => {}}
          accessibilityLabel="category-picker-dialog"
          style={{ maxHeight: modalMaxHeight }}
          className="w-full max-w-lg rounded-2xl bg-card border border-border p-4 overflow-hidden"
        >
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-bold text-foreground flex-1">
              {t("stock.selectCategory")}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              className="w-8 h-8 -mr-2 items-center justify-center rounded-full active:opacity-70"
              hitSlop={8}
            >
              <X size={18} color="#64748B" />
            </Pressable>
          </View>

          <StockCategoryTree
            categories={categories}
            selectedId={selectedId}
            onSelect={onSelect}
            maxHeight={treeMaxHeight}
            showHeading={false}
          />

          <View className="mt-4">
            <Button variant="primary" fullWidth onPress={onClose}>
              {t("common.ok")}
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function RegisteredBarcodeDialog({
  visible,
  item,
  barcode,
  onClose,
  onViewProduct,
  t,
}: {
  visible: boolean;
  item: StockItem | null;
  barcode: string;
  onClose: () => void;
  onViewProduct: () => void;
  t: (key: string) => string;
}) {
  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
        className="flex-1 items-center justify-center bg-black/60 px-6"
      >
        <Pressable
          onPress={() => {}}
          accessibilityLabel="registered-barcode-dialog"
          className="w-full max-w-md rounded-2xl bg-card border border-border p-6"
        >
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-bold text-foreground flex-1">
              {t("stock.barcodeAlreadyRegistered")}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              className="w-8 h-8 -mr-2 items-center justify-center rounded-full active:opacity-70"
              hitSlop={8}
            >
              <X size={18} color="#64748B" />
            </Pressable>
          </View>

          <Text className="text-sm text-muted-foreground mb-4">
            {t("stock.barcodeRegisteredDesc")}
          </Text>

          <Card className="flex-row items-center mb-4">
            <View className="h-14 w-14 items-center justify-center rounded-xl bg-primary/10 mr-3">
              <Package size={26} color="#1E40AF" />
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-base font-bold text-foreground" numberOfLines={2}>
                {item.name}
              </Text>
              <Text className="text-caption text-mono text-muted-foreground mt-0.5">
                {t("stock.sku")}: {item.sku}
              </Text>
              {barcode ? (
                <Text className="text-caption text-mono text-muted-foreground mt-0.5">
                  {t("stock.barcode")}: {barcode}
                </Text>
              ) : null}
              {item.is_low_stock ? (
                <View className="mt-1.5 self-start">
                  <Badge variant="warning" size="sm" label={t("stock.lowStockBadge")} />
                </View>
              ) : null}
            </View>
          </Card>

          <View className="gap-2">
            <Button variant="primary" fullWidth onPress={onViewProduct}>
              {t("stock.viewExistingProduct")}
            </Button>
            <Button variant="outline" fullWidth onPress={onClose}>
              {t("common.close")}
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
