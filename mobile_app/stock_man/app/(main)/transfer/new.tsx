// ============================================================
// Stock Man — New Transfer Wizard (P3)
//
// 3-step wizard for creating a Warehouse Transfer:
//   Step 1 — Kaynak → Hedef warehouses + transfer_date
//   Step 2 — Items (manual add via StockItemPicker; each row
//            edits the quantity with a NumberStepper)
//   Step 3 — Notes, accept_partial toggle, Oluştur button
//
// The wizard always creates the transfer in DRAFT status
// (per the backend contract); the user then "Onaya Gönder"
// on the detail page to move it to PENDING.
//
// Data sources (read-only inside the wizard):
//   - useWarehouses (branch-scoped via useBranchStore)
//   - useStockItems (via StockItemPicker modal)
//   - WarehousePicker (custom for source/target selection)
//
// Submission:
//   - useCreateTransfer() → POST /warehouse/transfers/
//   - Success → router.replace(/transfer/<new id>)
//   - Error   → dialog.error(...)
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import { ArrowLeft, ArrowRight, ChevronLeft, Save } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { WizardSteps } from "@/components/ui/WizardSteps";
import { StockItemPicker } from "@/components/purchase/StockItemPicker";
import { WarehousePicker } from "@/components/transfer/WarehousePicker";
import {
  Step1Meta,
  Step2Items,
  Step3Summary,
  type DraftItem,
} from "@/components/transfer/wizard";
import { useI18n } from "@/i18n";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useCreateTransfer } from "@/hooks/useTransfers";
import { isOfflineQueued, showOfflineQueuedToast } from "@/lib/offline/useOfflineMutation";
import { useBranchStore } from "@/store/useBranchStore";
import { useToast } from "@/components/ui/Toast";
import { dialog } from "@/store/useDialogStore";
import { extractApiError } from "@/utils/apiError";
import type { StockItem, UUID, Warehouse } from "@/types";

type WarehouseT = Warehouse;

const STEPS = [
  { key: 1 as const, i18nKey: "transfer.sourceWarehouse" },
  { key: 2 as const, i18nKey: "transfer.items" },
  { key: 3 as const, i18nKey: "purchase.notes" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function NewTransferScreen(): React.ReactElement {
  const { t } = useI18n();
  const toast = useToast();

  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const activeWarehouseId = useBranchStore((s) => s.activeWarehouseId);
  const setActiveWarehouse = useBranchStore((s) => s.setActiveWarehouse);
  const warehousesQuery = useWarehouses();
  const warehouses: WarehouseT[] = warehousesQuery.data ?? [];

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sourceWarehouseId, setSourceWarehouseId] = useState<UUID | null>(
    activeWarehouseId ?? null
  );
  const [targetWarehouseId, setTargetWarehouseId] = useState<UUID | null>(null);
  const [transferDate, setTransferDate] = useState<string>(todayIso());
  const [items, setItems] = useState<DraftItem[]>([]);
  const [notes, setNotes] = useState<string>("");
  const [acceptPartial, setAcceptPartial] = useState<boolean>(false);

  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);

  const findWh = (
    id: UUID | null
  ): WarehouseT | null => warehouses.find((w) => w.id === id) ?? null;
  const sourceWarehouse: WarehouseT | null = findWh(sourceWarehouseId);
  const targetWarehouse: WarehouseT | null = findWh(targetWarehouseId);

  const canGoNext = useMemo(() => {
    if (step === 1)
      return (
        !!sourceWarehouseId &&
        !!targetWarehouseId &&
        sourceWarehouseId !== targetWarehouseId &&
        !!transferDate
      );
    if (step === 2) return items.length > 0;
    return true;
  }, [
    step,
    sourceWarehouseId,
    targetWarehouseId,
    transferDate,
    items.length,
  ]);

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

  const create = useCreateTransfer();

  const onSubmit = useCallback(() => {
    if (!sourceWarehouseId || !targetWarehouseId) return;
    if (sourceWarehouseId === targetWarehouseId) {
      toast.error(t("errors.sameWarehouse"));
      return;
    }
    if (items.length === 0) {
      toast.error(t("purchase.noItems"));
      return;
    }
    const payload = {
      source_warehouse_id: sourceWarehouseId,
      target_warehouse_id: targetWarehouseId,
      transfer_date: transferDate,
      notes: notes.trim() || undefined,
      accept_partial: acceptPartial,
      items: items.map((i) => ({
        stock_item_id: i.stock_item_id,
        quantity: i.quantity,
        unit: i.unit,
        notes: i.notes,
      })),
    };
    create.mutate(payload as any, {
      onSuccess: (tr) => {
        if (isOfflineQueued(tr)) {
          showOfflineQueuedToast(toast, t);
          router.back();
          return;
        }
        toast.success(t("transfer.detail"));
        router.replace(`/(main)/transfer/${tr.id}` as any);
      },
      onError: (err: unknown) => {
        dialog.error(
          t("common.error"),
          extractApiError(err, t("errors.unknown"))
        );
      },
    });
  }, [
    sourceWarehouseId,
    targetWarehouseId,
    items,
    transferDate,
    notes,
    acceptPartial,
    create,
    toast,
    t,
  ]);

  const onNext = () => {
    if (!canGoNext) {
      if (step === 1) {
        if (!sourceWarehouseId) toast.error(t("transfer.sourceWarehouse"));
        else if (!targetWarehouseId) toast.error(t("transfer.targetWarehouse"));
        else if (sourceWarehouseId === targetWarehouseId)
          toast.error(t("errors.unknown"));
      } else if (step === 2 && items.length === 0) {
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

  if (!activeBranchId) {
    return (
      <Screen padded>
        <Header
          title={t("transfer.new")}
          subtitle={t("transfer.title")}
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

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
        <View className="px-4 pt-2">
          <Header
            title={t("transfer.new")}
            subtitle={t("transfer.title")}
            back
            onBackPress={onHeaderBack}
            right={
              <Text className="text-caption text-muted-foreground">
                {step}/3
              </Text>
            }
          />
        </View>

        <WizardSteps steps={STEPS} currentStep={step} t={t} />

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
              <Step1Meta
                warehouses={warehouses}
                sourceWarehouse={sourceWarehouse}
                targetWarehouse={targetWarehouse}
                onOpenSourcePicker={() => setSourcePickerOpen(true)}
                onOpenTargetPicker={() => setTargetPickerOpen(true)}
                onSelectSourceWarehouse={(id) => {
                  setSourceWarehouseId(id);
                  void setActiveWarehouse(id);
                  if (id === targetWarehouseId) {
                    setTargetWarehouseId(null);
                  }
                }}
                transferDate={transferDate}
                onTransferDateChange={setTransferDate}
                t={t}
              />
            ) : null}

            {step === 2 ? (
              <Step2Items
                items={items}
                onOpenItemPicker={() => setItemPickerOpen(true)}
                onUpdate={updateItem}
                onRemove={removeItem}
                t={t}
              />
            ) : null}

            {step === 3 ? (
              <Step3Summary
                notes={notes}
                onNotesChange={setNotes}
                acceptPartial={acceptPartial}
                onAcceptPartialChange={setAcceptPartial}
                sourceName={sourceWarehouse?.name ?? null}
                targetName={targetWarehouse?.name ?? null}
                itemCount={items.length}
                isSubmitting={create.isPending}
                onSubmit={onSubmit}
                t={t}
              />
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>

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
              {t("common.save")}
            </Button>
          )}
        </View>

        <WarehousePicker
          visible={sourcePickerOpen}
          title={t("transfer.sourceWarehouse")}
          onSelect={(w) => {
            setSourceWarehouseId(w.id);
            void setActiveWarehouse(w.id);
            if (w.id === targetWarehouseId) setTargetWarehouseId(null);
            setSourcePickerOpen(false);
          }}
          onClose={() => setSourcePickerOpen(false)}
        />
        <WarehousePicker
          visible={targetPickerOpen}
          title={t("transfer.targetWarehouse")}
          excludeId={sourceWarehouseId ?? undefined}
          onSelect={(w) => {
            setTargetWarehouseId(w.id);
            setTargetPickerOpen(false);
          }}
          onClose={() => setTargetPickerOpen(false)}
        />
        <StockItemPicker
          visible={itemPickerOpen}
          warehouseId={sourceWarehouseId ?? undefined}
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
