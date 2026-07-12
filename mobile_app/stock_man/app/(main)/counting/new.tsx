// ============================================================
// Stock Man — New Stock Counting Wizard (P4)
//
// 3-step wizard for creating a Stock Counting:
//   Step 1 — Depo (warehouse picker) + counting_date
//   Step 2 — Kalemler (items). If `auto_populate` is on, the
//            backend fills the list from the warehouse's
//            current stock; the user can still add manual
//            rows. Each row edits `counted_quantity` with a
//            NumberStepper; `system_quantity` is shown
//            read-only and the row auto-computes the
//            `difference`.
//   Step 3 — Notes + summary + Oluştur
//
// Data sources (read-only inside the wizard):
//   - useWarehouses (branch-scoped via useBranchStore)
//   - useStockItems (via StockItemPicker, warehouse-filtered)
//
// Submission:
//   - useCreateStockCounting()  → POST /warehouse/stock-counting/
//     with `auto_populate: true|false`
//   - Success → router.replace(/counting/<new id>)
//   - Error   → dialog.error(...)
//
// The `auto_populate` toggle is a one-way decision at create
// time; if it's on, the payload still has to include an
// `items: []` array (the backend will overwrite it with
// the auto-populated set after creation).
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  ChevronLeft,
  ClipboardList,
  FileText,
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
import { CountingItemRow } from "@/components/counting/CountingItemRow";
import { DetailItemsList } from "@/components/ui/DetailItemsList";
import { useI18n } from "@/i18n";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useCreateStockCounting } from "@/hooks/useStockCountings";
import { isOfflineQueued, showOfflineQueuedToast } from "@/lib/offline/useOfflineMutation";
import { useBranchStore } from "@/store/useBranchStore";
import { useToast } from "@/components/ui/Toast";
import { dialog } from "@/store/useDialogStore";
import { extractApiError } from "@/utils/apiError";
import { cn } from "@/utils/cn";
import type {
  StockCountingCreateItem,
  StockItem,
  UUID,
  Warehouse as WarehouseT,
} from "@/types";

const STEPS: { key: 1 | 2 | 3; i18nKey: string }[] = [
  { key: 1, i18nKey: "common.details" },
  { key: 2, i18nKey: "counting.items" },
  { key: 3, i18nKey: "common.save" },
];

// Draft item kept locally — the create payload uses the
// `stock_item_id` + unit + system/counted qty.
type DraftItem = StockCountingCreateItem & {
  stock_item_name?: string;
  stock_item_sku?: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function NewCountingScreen() {
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
  const [warehouseId, setWarehouseId] = useState<UUID | null>(
    activeWarehouseId ?? null
  );
  const [countingDate, setCountingDate] = useState<string>(todayIso());
  const [autoPopulate, setAutoPopulate] = useState<boolean>(true);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [notes, setNotes] = useState<string>("");
  const [itemPickerOpen, setItemPickerOpen] = useState(false);

  const selectedWarehouse = useMemo(
    () => warehouses.find((w) => w.id === warehouseId) ?? null,
    [warehouses, warehouseId]
  );

  // ─── Step guards ───────────────────────────────────────────
  const canGoNext = useMemo(() => {
    if (step === 1) return !!warehouseId && !!countingDate;
    if (step === 2) return autoPopulate || items.length > 0;
    return true;
  }, [step, warehouseId, countingDate, items.length, autoPopulate]);

  // ─── Item management ──────────────────────────────────────
  const addItem = useCallback(
    (stock: StockItem) => {
      const existing = items.find((i) => i.stock_item_id === stock.id);
      if (existing) {
        setItems((prev) =>
          prev.map((i) =>
            i.stock_item_id === stock.id
              ? { ...i, counted_quantity: i.counted_quantity + 1 }
              : i
          )
        );
        return;
      }
      const systemQty = stock.current_quantity ?? stock.physical_quantity ?? 0;
      const next: DraftItem = {
        stock_item_id: stock.id,
        system_quantity: systemQty,
        counted_quantity: systemQty,
        unit: stock.unit ?? "",
        stock_item_name: stock.name,
        stock_item_sku: stock.sku,
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
  const create = useCreateStockCounting();

  const onSubmit = useCallback(() => {
    if (!warehouseId) return;
    const payload: {
      warehouse_id: UUID;
      counting_date: string;
      notes?: string;
      auto_populate: boolean;
      items: { stock_item_id: UUID; system_quantity: number; counted_quantity: number; unit: string }[];
    } = {
      warehouse_id: warehouseId,
      counting_date: countingDate,
      auto_populate: autoPopulate,
      items: autoPopulate
        ? []
        : items.map((i) => ({
            stock_item_id: i.stock_item_id,
            system_quantity: i.system_quantity,
            counted_quantity: i.counted_quantity,
            unit: i.unit,
          })),
    };
    if (notes.trim()) payload.notes = notes.trim();

    create.mutate(payload as any, {
      onSuccess: (counting) => {
        if (isOfflineQueued(counting)) {
          showOfflineQueuedToast(toast, t);
          router.back();
          return;
        }
        toast.success(t("common.success"));
        router.replace(`/(main)/counting/${counting.id}` as any);
      },
      onError: (err: unknown) => {
        dialog.error(
          t("common.error"),
          extractApiError(err, t("errors.unknown"))
        );
      },
    });
  }, [warehouseId, countingDate, autoPopulate, items, notes, create, toast, t]);

  // ─── Step navigation ──────────────────────────────────────
  const onNext = () => {
    if (!canGoNext) {
      if (step === 1) {
        if (!warehouseId) toast.error(t("purchase.selectWarehouse"));
      } else if (step === 2 && !autoPopulate && items.length === 0) {
        toast.error(t("purchase.noItems"));
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
          title={t("counting.new")}
          subtitle={t("counting.title")}
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
            title={t("counting.new")}
            subtitle={t("counting.title")}
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
                warehouses={warehouses}
                warehouseId={warehouseId}
                onSelectWarehouse={(id) => {
                  setWarehouseId(id);
                  if (id) void setActiveWarehouse(id);
                }}
                countingDate={countingDate}
                onCountingDateChange={setCountingDate}
                t={t}
              />
            ) : null}

            {step === 2 ? (
              <Step2
                items={items}
                autoPopulate={autoPopulate}
                onToggleAutoPopulate={setAutoPopulate}
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
                warehouseName={selectedWarehouse?.name ?? null}
                autoPopulate={autoPopulate}
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
              disabled={!warehouseId || (!autoPopulate && items.length === 0)}
            >
              {t("counting.new")}
            </Button>
          )}
        </View>

        {/* Modals */}
        <StockItemPicker
          visible={itemPickerOpen}
          warehouseId={warehouseId ?? undefined}
          alreadySelectedIds={items.map((i) => i.stock_item_id)}
          onSelect={(stock) => {
            addItem(stock);
            setItemPickerOpen(false);
          }}
          onClose={() => setItemPickerOpen(false)}
        />
      </SafeAreaView>
    </>
  );
}

// ─── Sub-step components ─────────────────────────────────────

interface Step1Props {
  warehouses: WarehouseT[];
  warehouseId: UUID | null;
  onSelectWarehouse: (id: UUID | null) => void;
  countingDate: string;
  onCountingDateChange: (v: string) => void;
  t: (key: string) => string;
}

function Step1({
  warehouses,
  warehouseId,
  onSelectWarehouse,
  countingDate,
  onCountingDateChange,
  t,
}: Step1Props) {
  return (
    <View className="gap-3 mt-2">
      {/* Warehouse */}
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
                selected={w.id === warehouseId}
                onPress={() => onSelectWarehouse(w.id)}
                variant={w.id === warehouseId ? "primary" : "default"}
                leftIcon={Warehouse}
                size="sm"
              />
            ))}
          </View>
        )}
      </Card>

      {/* Date */}
      <Card>
        <View className="flex-row items-center mb-2">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
            <Calendar size={20} color="#1E40AF" />
          </View>
          <Text className="flex-1 text-h3 text-foreground">
            {t("counting.countedAt")}
          </Text>
        </View>
        <Input
          value={countingDate}
          onChangeText={onCountingDateChange}
          placeholder="YYYY-AA-GG"
          hint={t("common.required")}
          required
          leftIcon={Calendar}
        />
      </Card>
    </View>
  );
}

interface Step2Props {
  items: DraftItem[];
  autoPopulate: boolean;
  onToggleAutoPopulate: (v: boolean) => void;
  onOpenItemPicker: () => void;
  onUpdate: (id: UUID, patch: Partial<DraftItem>) => void;
  onRemove: (id: UUID) => void;
  t: (key: string) => string;
}

function Step2({
  items,
  autoPopulate,
  onToggleAutoPopulate,
  onOpenItemPicker,
  onUpdate,
  onRemove,
  t,
}: Step2Props) {
  return (
    <View className="gap-3 mt-2">
      {/* Auto-populate toggle */}
      <Card>
        <View className="flex-row items-center">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
            <ClipboardList size={20} color="#1E40AF" />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-body font-semibold text-foreground">
              {t("counting.autoPopulate")}
            </Text>
            <Text className="text-caption text-muted-foreground mt-0.5">
              {t("counting.items")}
            </Text>
          </View>
          <Switch
            value={autoPopulate}
            onValueChange={onToggleAutoPopulate}
            accessibilityLabel={t("counting.autoPopulate")}
          />
        </View>
      </Card>

      {/* Manual add UI only when autoPopulate is off */}
      {!autoPopulate ? (
        <>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
                <ClipboardList size={20} color="#1E40AF" />
              </View>
              <Text className="text-h3 text-foreground">
                {t("counting.items")}
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
                <ClipboardList size={28} color="#94A3B8" />
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
                <CountingItemRow
                  item={{
                    stock_item: it.stock_item_id,
                    stock_item_name: it.stock_item_name,
                    stock_item_sku: it.stock_item_sku,
                    system_quantity: it.system_quantity,
                    counted_quantity: it.counted_quantity,
                    unit: it.unit,
                    difference: it.counted_quantity - it.system_quantity,
                  }}
                  editable
                  onCountedChange={(q) =>
                    onUpdate(it.stock_item_id, { counted_quantity: q })
                  }
                />
              )}
            />
          )}
        </>
      ) : null}
    </View>
  );
}

interface Step3Props {
  notes: string;
  onNotesChange: (v: string) => void;
  warehouseName: string | null;
  autoPopulate: boolean;
  itemCount: number;
  t: (key: string) => string;
}

function Step3({
  notes,
  onNotesChange,
  warehouseName,
  autoPopulate,
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
          label={t("deficiency.warehouse")}
          value={warehouseName ?? "—"}
        />
        <SummaryRow
          label={t("counting.autoPopulate")}
          value={autoPopulate ? t("common.yes") : t("common.no")}
        />
        <SummaryRow
          label={t("counting.items")}
          value={
            autoPopulate
              ? `~ (${t("counting.autoPopulate")})`
              : `${itemCount} ${t("counting.items").toLowerCase()}`
          }
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
