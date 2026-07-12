// ============================================================
// Stock Man — New Deficiency Report Wizard (P4)
//
// 3-step wizard for creating a Deficiency Report:
//
//   Step 1 — Mutfak İstasyonu + Depo (kitchen_station + target_warehouse).
//            KitchenStationPicker ile istasyon seçimi; istasyona
//            bağlı depo varsa hedef depo otomatik önerilir.
//   Step 2 — Kalemler (StockItemPicker + DeficiencyItemRow).
//   Step 3 — Notes + summary + Oluştur.
//
// Data sources (read-only inside the wizard):
//   - useWarehouses        (branch-scoped via useBranchStore)
//   - useKitchenStations   (branch-scoped via useBranchStore)
//   - useStockItems        (via StockItemPicker, warehouse-filtered)
//
// Submission:
//   - useCreateDeficiencyReport() → POST /warehouse/deficiency-reports/
//   - Success → router.replace(/deficiency/<new id>)
//   - Error   → dialog.error(...)
//
// Note: `target_warehouse_id` is currently NOT part of the
// create payload (the model has `target_warehouse` but the
// create serializer ignores it — the warehouse is set from
// the kitchen_station's default). The picker is still
// surfaced to the user because P4 calls it the "Hedef Depo"
// and we'll wire it through when the backend supports it.
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChefHat,
  FileText,
  Info,
  Plus,
  Save,
  Warehouse,
} from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Loading } from "@/components/ui/Loading";
import { StockItemPicker } from "@/components/purchase/StockItemPicker";
import { DeficiencyItemRow } from "@/components/deficiency/DeficiencyItemRow";
import { KitchenStationPicker } from "@/components/deficiency/KitchenStationPicker";
import { DetailItemsList } from "@/components/ui/DetailItemsList";
import { useI18n } from "@/i18n";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useCreateDeficiencyReport } from "@/hooks/useDeficiencyReports";
import { useBranchStore } from "@/store/useBranchStore";
import { useToast } from "@/components/ui/Toast";
import { dialog } from "@/store/useDialogStore";
import { extractApiError } from "@/utils/apiError";
import { cn } from "@/utils/cn";
import type {
  DeficiencyReportCreateItem,
  KitchenStation,
  StockItem,
  UUID,
  Warehouse as WarehouseT,
} from "@/types";

const STEPS: { key: 1 | 2 | 3; i18nKey: string }[] = [
  { key: 1, i18nKey: "common.details" },
  { key: 2, i18nKey: "deficiency.items" },
  { key: 3, i18nKey: "common.save" },
];

// Draft item kept locally — the create payload uses the
// `stock_item_id` + unit + qty.
type DraftItem = DeficiencyReportCreateItem & {
  stock_item_name?: string;
  stock_item_sku?: string;
  current_stock?: number;
  minimum_stock?: number;
  is_low_stock?: boolean;
};

export default function NewDeficiencyScreen() {
  const { t } = useI18n();
  const toast = useToast();

  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const activeWarehouseId = useBranchStore((s) => s.activeWarehouseId);
  const setActiveWarehouse = useBranchStore((s) => s.setActiveWarehouse);
  const warehousesQuery = useWarehouses();
  const warehouses = useMemo(
    () => warehousesQuery.data ?? [],
    [warehousesQuery.data]
  );

  // ─── Wizard state ──────────────────────────────────────────
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [kitchenStationId, setKitchenStationId] = useState<UUID | null>(null);
  const [selectedStationName, setSelectedStationName] = useState<string | null>(
    null
  );
  const [stationPickerOpen, setStationPickerOpen] = useState(false);
  const [targetWarehouseId, setTargetWarehouseId] = useState<UUID | null>(
    activeWarehouseId ?? null
  );
  const [items, setItems] = useState<DraftItem[]>([]);
  const [notes, setNotes] = useState<string>("");
  const [itemPickerOpen, setItemPickerOpen] = useState(false);

  const selectedWarehouse = useMemo(
    () => warehouses.find((w) => w.id === targetWarehouseId) ?? null,
    [warehouses, targetWarehouseId]
  );

  // ─── Step guards ───────────────────────────────────────────
  const canGoNext = useMemo(() => {
    if (step === 1)
      return !!kitchenStationId && !!targetWarehouseId;
    if (step === 2) return items.length > 0;
    return true;
  }, [step, kitchenStationId, targetWarehouseId, items.length]);

  const onSelectKitchenStation = useCallback(
    (station: KitchenStation) => {
      setKitchenStationId(station.id);
      setSelectedStationName(station.name);
      if (station.warehouse) {
        setTargetWarehouseId(station.warehouse);
        void setActiveWarehouse(station.warehouse);
      }
    },
    [setActiveWarehouse]
  );

  // ─── Item management ──────────────────────────────────────
  const addItem = useCallback(
    (stock: StockItem) => {
      const existing = items.find((i) => i.stock_item_id === stock.id);
      if (existing) {
        setItems((prev) =>
          prev.map((i) =>
            i.stock_item_id === stock.id
              ? { ...i, quantity: i.quantity + 1 }
              : i
          )
        );
        return;
      }
      const next: DraftItem = {
        stock_item_id: stock.id,
        quantity: 1,
        unit: stock.unit ?? "",
        stock_item_name: stock.name,
        stock_item_sku: stock.sku,
        current_stock: stock.current_quantity ?? stock.physical_quantity,
        minimum_stock: stock.minimum_quantity,
        is_low_stock: stock.is_low_stock,
      };
      setItems((prev) => [...prev, next]);
    },
    [items]
  );

  const updateItem = useCallback(
    (stockItemId: UUID, patch: Partial<DraftItem>) => {
      setItems((prev) =>
        prev.map((it) =>
          it.stock_item_id === stockItemId ? { ...it, ...patch } : it
        )
      );
    },
    []
  );

  const removeItem = useCallback((stockItemId: UUID) => {
    setItems((prev) => prev.filter((it) => it.stock_item_id !== stockItemId));
  }, []);

  // ─── Submit ────────────────────────────────────────────────
  const create = useCreateDeficiencyReport();

  const onSubmit = useCallback(() => {
    if (!kitchenStationId || !targetWarehouseId) return;
    if (items.length === 0) {
      toast.error(t("purchase.noItems"));
      return;
    }
    const hasPositiveQty = items.every((i) => i.quantity > 0);
    if (!hasPositiveQty) {
      toast.error(t("deficiency.requirePositiveQty"));
      return;
    }
    const payload: {
      kitchen_station_id: UUID;
      notes?: string;
      items: { stock_item_id: UUID; quantity: number; unit: string }[];
    } = {
      kitchen_station_id: kitchenStationId,
      items: items.map((i) => ({
        stock_item_id: i.stock_item_id,
        quantity: i.quantity,
        unit: i.unit,
      })),
    };
    if (notes.trim()) payload.notes = notes.trim();

    create.mutate(payload as any, {
      onSuccess: (dr) => {
        toast.success(t("common.success"));
        router.replace(`/(main)/deficiency/${dr.id}` as any);
      },
      onError: (err: unknown) => {
        dialog.error(
          t("common.error"),
          extractApiError(err, t("errors.unknown"))
        );
      },
    });
  }, [kitchenStationId, targetWarehouseId, items, notes, create, toast, t]);

  // ─── Step navigation ──────────────────────────────────────
  const onNext = () => {
    if (!canGoNext) {
      if (step === 1) {
        if (!kitchenStationId)
          toast.error(t("deficiency.selectKitchenStation"));
        else if (!targetWarehouseId) toast.error(t("purchase.selectWarehouse"));
      } else if (step === 2 && items.length === 0) {
        toast.error(t("deficiency.noSuggestions") || t("purchase.noItems"));
      }
      return;
    }
    setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s));
  };

  const onBack = () => {
    setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));
  };

  const onHeaderBack = useCallback(() => {
    if (step > 1) onBack();
    else if (router.canGoBack()) router.back();
  }, [step]);

  // ─── Empty / branch gate ───────────────────────────────────
  if (!activeBranchId) {
    return (
      <Screen padded>
        <Header
          title={t("deficiency.new") || t("deficiency.title")}
          subtitle={t("deficiency.title")}
          back
        />
        <Card className="mt-4">
          <View className="p-6">
            <Text className="text-body text-foreground text-center">
              {t("branches.select")}
            </Text>
            <Text className="text-caption text-muted-foreground text-center mt-2">
              {t("branches.selectHelper")}
            </Text>
          </View>
        </Card>
      </Screen>
    );
  }

  // ─── Render ────────────────────────────────────────────────
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
        <View className="px-4 pt-2">
          <Header
            title={t("deficiency.new") || t("deficiency.title")}
            subtitle={t("deficiency.title")}
            back
            onBackPress={onHeaderBack}
            right={
              <Text className="text-caption text-muted-foreground">
                {step}/3
              </Text>
            }
          />
        </View>

        {/* Step indicator */}
        <View className="px-4 pt-2 pb-1">
          <View className="flex-row gap-1.5">
            {STEPS.map((s) => {
              const isCurrent = s.key === step;
              const isPast = s.key < step;
              return (
                <View
                  key={s.key}
                  className={cn(
                    "flex-1 h-1.5 rounded-full",
                    isCurrent
                      ? "bg-primary"
                      : isPast
                        ? "bg-primary/40"
                        : "bg-muted"
                  )}
                />
              );
            })}
          </View>
          <View className="mt-2 flex-row items-center justify-between">
            <Text className="text-caption text-muted-foreground">
              {STEPS[step - 1] ? t(STEPS[step - 1]!.i18nKey) : ""}
            </Text>
          </View>
        </View>

        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            className="flex-1 px-4 pt-2"
            contentContainerStyle={{ paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
          >
            {step === 1 ? (
              <Step1
                kitchenStationId={kitchenStationId}
                selectedStationName={selectedStationName}
                onOpenStationPicker={() => setStationPickerOpen(true)}
                warehouses={warehouses}
                targetWarehouseId={targetWarehouseId}
                onSelectWarehouse={(id) => {
                  setTargetWarehouseId(id);
                  if (id) void setActiveWarehouse(id);
                }}
                t={t}
              />
            ) : null}

            {step === 2 ? (
              <Step2
                items={items}
                onOpenItemPicker={() => setItemPickerOpen(true)}
                onUpdate={updateItem}
                onRemove={removeItem}
                t={t}
              />
            ) : null}

            {step === 3 ? (
              <Step3
                notes={notes}
                onNotesChange={setNotes}
                stationName={selectedStationName}
                warehouseName={selectedWarehouse?.name ?? null}
                itemCount={items.length}
                t={t}
              />
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Footer navigation */}
        <View className="border-t border-border bg-card px-4 py-3 flex-row gap-2">
          {step > 1 ? (
            <Button
              variant="outline"
              onPress={onBack}
              leftIcon={ArrowLeft}
              className="flex-1"
              disabled={create.isPending}
            >
              {t("common.previous")}
            </Button>
          ) : (
            <Button
              variant="outline"
              onPress={() => router.back()}
              leftIcon={ChevronLeft}
              className="flex-1"
              disabled={create.isPending}
            >
              {t("common.cancel")}
            </Button>
          )}

          {step < 3 ? (
            <Button
              variant="primary"
              onPress={onNext}
              rightIcon={ArrowRight}
              className="flex-1"
            >
              {t("common.next")}
            </Button>
          ) : (
            <Button
              variant="primary"
              onPress={onSubmit}
              leftIcon={Save}
              className="flex-1"
              loading={create.isPending}
              disabled={items.length === 0}
            >
              {t("deficiency.new") || t("deficiency.title")}
            </Button>
          )}
        </View>

        {/* Modals */}
        <StockItemPicker
          visible={itemPickerOpen}
          warehouseId={targetWarehouseId ?? undefined}
          alreadySelectedIds={items.map((i) => i.stock_item_id)}
          onSelect={(stock) => {
            addItem(stock);
            setItemPickerOpen(false);
          }}
          onClose={() => setItemPickerOpen(false)}
        />
        <KitchenStationPicker
          visible={stationPickerOpen}
          value={kitchenStationId}
          onSelect={onSelectKitchenStation}
          onClose={() => setStationPickerOpen(false)}
        />
      </SafeAreaView>
    </>
  );
}

// ─── Sub-step components ─────────────────────────────────────

interface Step1Props {
  kitchenStationId: UUID | null;
  selectedStationName: string | null;
  onOpenStationPicker: () => void;
  warehouses: WarehouseT[];
  targetWarehouseId: UUID | null;
  onSelectWarehouse: (id: UUID | null) => void;
  t: (key: string) => string;
}

function Step1({
  kitchenStationId,
  selectedStationName,
  onOpenStationPicker,
  warehouses,
  targetWarehouseId,
  onSelectWarehouse,
  t,
}: Step1Props) {
  return (
    <View className="gap-3 mt-2">
      <Card>
        <View className="flex-row items-center mb-2">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-warning/10 mr-3">
            <ChefHat size={20} color="#F59E0B" />
          </View>
          <Text className="flex-1 text-h3 text-foreground">
            {t("deficiency.kitchenStation")}
          </Text>
        </View>
        <Pressable
          onPress={onOpenStationPicker}
          accessibilityRole="button"
          accessibilityLabel={t("deficiency.selectKitchenStation")}
          className={cn(
            "min-h-[48px] rounded-xl border px-3 py-3 flex-row items-center justify-between active:opacity-80",
            kitchenStationId ? "border-primary bg-primary/5" : "border-input bg-background"
          )}
        >
          <Text
            className={cn(
              "text-body flex-1",
              kitchenStationId ? "text-foreground font-semibold" : "text-muted-foreground"
            )}
            numberOfLines={1}
          >
            {selectedStationName ?? t("deficiency.selectKitchenStation")}
          </Text>
          <ChefHat size={18} color={kitchenStationId ? "#1E40AF" : "#64748B"} />
        </Pressable>
        <View className="mt-2 flex-row items-start">
          <Info size={12} color="#64748B" />
          <Text className="ml-1 flex-1 text-caption text-muted-foreground">
            {t("deficiency.stationHint")}
          </Text>
        </View>
      </Card>

      {/* Target warehouse */}
      <Card>
        <View className="flex-row items-center mb-2">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
            <Warehouse size={20} color="#1E40AF" />
          </View>
          <Text className="flex-1 text-h3 text-foreground">
            {t("deficiency.warehouse")}
          </Text>
        </View>
        {warehouses.length === 0 ? (
          <View className="py-3">
            <Loading label={t("common.loading")} />
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {warehouses.map((w) => (
              <Chip
                key={w.id}
                label={w.name}
                selected={w.id === targetWarehouseId}
                onPress={() => onSelectWarehouse(w.id)}
                variant={w.id === targetWarehouseId ? "primary" : "default"}
                leftIcon={Warehouse}
                size="sm"
              />
            ))}
          </View>
        )}
      </Card>
    </View>
  );
}

interface Step2Props {
  items: DraftItem[];
  onOpenItemPicker: () => void;
  onUpdate: (id: UUID, patch: Partial<DraftItem>) => void;
  onRemove: (id: UUID) => void;
  t: (key: string) => string;
}

function Step2({ items, onOpenItemPicker, onUpdate, onRemove, t }: Step2Props) {
  return (
    <View className="gap-3 mt-2">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
            <Warehouse size={20} color="#1E40AF" />
          </View>
          <Text className="text-h3 text-foreground">
            {t("deficiency.items")}
          </Text>
        </View>
        <Pressable
          onPress={onOpenItemPicker}
          accessibilityRole="button"
          accessibilityLabel={t("purchase.addItem")}
          className="px-3 py-2 rounded-lg bg-primary active:bg-primary/90 flex-row items-center"
        >
          <Plus size={16} color="#FFFFFF" />
          <Text className="ml-1 text-caption font-semibold text-primary-foreground">
            {t("purchase.addItem")}
          </Text>
        </Pressable>
      </View>

      {items.length === 0 ? (
        <Card>
          <View className="py-6 items-center">
            <Warehouse size={28} color="#94A3B8" />
            <Text className="text-body text-muted-foreground mt-2 text-center">
              {t("purchase.noItems")}
            </Text>
            <Button
              variant="outline"
              onPress={onOpenItemPicker}
              leftIcon={Plus}
              className="mt-3"
            >
              {t("purchase.addItem")}
            </Button>
          </View>
        </Card>
      ) : (
        <DetailItemsList
          data={items}
          keyExtractor={(it) => it.stock_item_id}
          itemHeight={96}
          renderItem={({ item: it }) => (
            <DeficiencyItemRow
              item={{
                stock_item: it.stock_item_id,
                stock_item_name: it.stock_item_name,
                stock_item_sku: it.stock_item_sku,
                quantity: it.quantity,
                unit: it.unit,
                current_stock: it.current_stock,
                minimum_stock: it.minimum_stock,
                is_low_stock: it.is_low_stock,
              }}
              editable
              onQuantityChange={(q) =>
                onUpdate(it.stock_item_id, { quantity: q })
              }
              onRemove={() => onRemove(it.stock_item_id)}
            />
          )}
        />
      )}
    </View>
  );
}

interface Step3Props {
  notes: string;
  onNotesChange: (v: string) => void;
  stationName: string | null;
  warehouseName: string | null;
  itemCount: number;
  t: (key: string) => string;
}

function Step3({
  notes,
  onNotesChange,
  stationName,
  warehouseName,
  itemCount,
  t,
}: Step3Props) {
  return (
    <View className="gap-3 mt-2">
      <Card>
        <View className="flex-row items-center mb-2">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
            <FileText size={20} color="#1E40AF" />
          </View>
          <Text className="flex-1 text-h3 text-foreground">
            {t("purchase.notes")}
          </Text>
        </View>
        <Input
          value={notes}
          onChangeText={onNotesChange}
          placeholder={t("purchase.notes")}
          multiline
          numberOfLines={4}
          className="min-h-[100px]"
        />
      </Card>

      <Card>
        <View className="flex-row items-center mb-3">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-success/15 mr-3">
            <Check size={20} color="#059669" />
          </View>
          <Text className="flex-1 text-h3 text-foreground">
            {t("common.details")}
          </Text>
        </View>
        <SummaryRow
          label={t("deficiency.kitchenStation")}
          value={stationName ?? "—"}
        />
        <SummaryRow
          label={t("deficiency.warehouse")}
          value={warehouseName ?? "—"}
        />
        <SummaryRow
          label={t("deficiency.items")}
          value={`${itemCount} ${t("deficiency.items").toLowerCase()}`}
          isLast
        />
      </Card>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  isLast,
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <View
      className={cn(
        "flex-row items-center justify-between py-2",
        !isLast && "border-b border-border"
      )}
    >
      <Text className="text-caption text-muted-foreground">{label}</Text>
      <Text className="text-body font-semibold text-foreground" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
