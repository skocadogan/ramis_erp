// ============================================================
// Stock Man — New Purchase Order Wizard (P2)
//
// Single-screen 4-step wizard for creating a PO. We use a
// local `step` state instead of nested routes so back/next
// is one tap and we never lose the draft on a router race.
//
//   Step 1 — Supplier & Warehouse + order/expected dates
//   Step 2 — Add stock items, edit qty / unit-price
//   Step 3 — Notes + summary
//   Step 4 — Submit
//
// Data sources (read-only inside the wizard):
//   - useSuppliers    (via SupplierPicker modal)
//   - useWarehouses   (branch-scoped via useBranchStore)
//   - useStockItems   (via StockItemPicker modal, warehouse-filtered)
//
// Submission:
//   - useCreatePurchaseOrder()  → POST /warehouse/purchase-orders/
//   - Success → router.replace(/purchase/<new id>)
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
import { routes } from "@/navigation/routes";
import { ArrowLeft, ArrowRight, ChevronLeft, Save } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { WizardSteps } from "@/components/ui/WizardSteps";
import { SupplierPicker } from "@/components/purchase/SupplierPicker";
import { StockItemPicker } from "@/components/purchase/StockItemPicker";
import { WarehousePicker } from "@/components/transfer/WarehousePicker";
import {
  Step1Meta,
  Step2Items,
  Step3Summary,
  Step4Submit,
  type DraftItem,
} from "@/components/purchase/wizard";
import { useI18n } from "@/i18n";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useSupplier } from "@/hooks/useSuppliers";
import { useCreatePurchaseOrder } from "@/hooks/usePurchaseOrders";
import { isOfflineQueued, showOfflineQueuedToast } from "@/lib/offline/useOfflineMutation";
import { useBranchStore } from "@/store/useBranchStore";
import { useToast } from "@/components/ui/Toast";
import { dialog } from "@/store/useDialogStore";
import { extractApiError } from "@/utils/apiError";
import type { StockItem, UUID } from "@/types";

const STEPS = [
  { key: 1 as const, i18nKey: "purchase.supplier" },
  { key: 2 as const, i18nKey: "purchase.items" },
  { key: 3 as const, i18nKey: "purchase.notes" },
  { key: 4 as const, i18nKey: "common.save" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function NewPurchaseOrderScreen() {
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

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [supplierId, setSupplierId] = useState<UUID | null>(null);
  const [warehouseId, setWarehouseId] = useState<UUID | null>(
    activeWarehouseId ?? null
  );
  const [orderDate, setOrderDate] = useState<string>(todayIso());
  const [expectedDate, setExpectedDate] = useState<string>("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [notes, setNotes] = useState<string>("");

  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [warehousePickerOpen, setWarehousePickerOpen] = useState(false);

  const supplierQuery = useSupplier(supplierId ?? undefined);
  const supplier = supplierQuery.data;
  const selectedWarehouse = useMemo(
    () => warehouses.find((w) => w.id === warehouseId) ?? null,
    [warehouses, warehouseId]
  );

  const canGoNext = useMemo(() => {
    if (step === 1) return !!supplierId && !!warehouseId && !!orderDate;
    if (step === 2) return items.length > 0;
    return true;
  }, [step, supplierId, warehouseId, orderDate, items.length]);

  const totalAmount = useMemo(
    () => items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0),
    [items]
  );

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
        unit_price: stock.last_purchase_price ?? stock.average_cost ?? 0,
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

  const create = useCreatePurchaseOrder();

  const onSubmit = useCallback(() => {
    if (!supplierId || !warehouseId) return;
    if (items.length === 0) {
      toast.error(t("purchase.noItems"));
      return;
    }
    if (expectedDate && orderDate && expectedDate < orderDate) {
      toast.error(t("purchase.expectedBeforeOrder"));
      return;
    }
    const payload = {
      supplier_id: supplierId,
      warehouse_id: warehouseId,
      order_date: orderDate,
      expected_date: expectedDate || undefined,
      notes: notes.trim() || undefined,
      items: items.map((i) => ({
        stock_item_id: i.stock_item_id,
        quantity: i.quantity,
        unit: i.unit,
        unit_price: i.unit_price,
      })),
    };
    create.mutate(payload, {
      onSuccess: (po) => {
        if (isOfflineQueued(po)) {
          showOfflineQueuedToast(toast, t);
          router.back();
          return;
        }
        toast.success(t("purchase.create"));
        router.replace(routes.purchase.detail(po.id));
      },
      onError: (err: unknown) => {
        dialog.error(
          t("common.error"),
          extractApiError(err, t("errors.unknown"))
        );
      },
    });
  }, [
    supplierId,
    warehouseId,
    items,
    orderDate,
    expectedDate,
    notes,
    create,
    toast,
    t,
  ]);

  const onNext = () => {
    if (!canGoNext) {
      if (step === 1) {
        if (!supplierId) toast.error(t("purchase.selectSupplier"));
        else if (!warehouseId) toast.error(t("purchase.selectWarehouse"));
      } else if (step === 2 && items.length === 0) {
        toast.error(t("purchase.noItems"));
      }
      return;
    }
    setStep((s) => (s < 4 ? ((s + 1) as 1 | 2 | 3 | 4) : s));
  };

  const onBack = () => {
    setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s));
  };

  const onHeaderBack = useCallback(() => {
    if (step > 1) onBack();
    else if (router.canGoBack()) router.back();
  }, [step]);

  if (!activeBranchId) {
    return (
      <Screen padded>
        <Header
          title={t("purchase.new")}
          subtitle={t("purchase.list")}
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
            title={t("purchase.new")}
            subtitle={t("purchase.title")}
            back
            onBackPress={onHeaderBack}
            right={
              <Text className="text-caption text-muted-foreground">
                {step}/4
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
                supplier={supplier ?? null}
                supplierId={supplierId}
                onOpenSupplierPicker={() => setSupplierPickerOpen(true)}
                warehouses={warehouses}
                warehouseId={warehouseId}
                onSelectWarehouse={(id) => {
                  setWarehouseId(id);
                  if (id) void setActiveWarehouse(id);
                }}
                onOpenWarehousePicker={() => setWarehousePickerOpen(true)}
                orderDate={orderDate}
                onOrderDateChange={setOrderDate}
                expectedDate={expectedDate}
                onExpectedDateChange={setExpectedDate}
                t={t}
              />
            ) : null}

            {step === 2 ? (
              <Step2Items
                items={items}
                onOpenItemPicker={() => setItemPickerOpen(true)}
                onUpdate={updateItem}
                onRemove={removeItem}
                totalAmount={totalAmount}
                t={t}
              />
            ) : null}

            {step === 3 ? (
              <Step3Summary
                notes={notes}
                onNotesChange={setNotes}
                supplierName={supplier?.name ?? null}
                warehouseName={selectedWarehouse?.name ?? null}
                itemCount={items.length}
                totalAmount={totalAmount}
                t={t}
              />
            ) : null}

            {step === 4 ? (
              <Step4Submit
                supplierName={supplier?.name ?? null}
                warehouseName={selectedWarehouse?.name ?? null}
                itemCount={items.length}
                totalAmount={totalAmount}
                notes={notes}
                orderDate={orderDate}
                expectedDate={expectedDate}
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

          {step < 4 ? (
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
              {t("purchase.create")}
            </Button>
          )}
        </View>

        <SupplierPicker
          visible={supplierPickerOpen}
          value={supplierId}
          onSelect={(id) => setSupplierId(id)}
          onClose={() => setSupplierPickerOpen(false)}
        />
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
        <WarehousePicker
          visible={warehousePickerOpen}
          title={t("purchase.selectWarehouse")}
          onSelect={(warehouse) => {
            setWarehouseId(warehouse.id);
            void setActiveWarehouse(warehouse.id);
            setWarehousePickerOpen(false);
          }}
          onClose={() => setWarehousePickerOpen(false)}
        />
      </SafeAreaView>
    </>
  );
}
