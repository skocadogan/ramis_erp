// ============================================================
// Stock Man — New Goods Receiving Wizard (P3)
//
// 3-step wizard for creating a Mal Kabul (Goods Receiving):
//   Step 1 — Tedarikçi & Depo + received_date (and an optional
//            PO that pre-fills the items list).
//   Step 2 — Items (PO-prefill OR manual) — each row lets the
//            user tweak expected / received / rejected qty, plus
//            batch_number + expiry_date.
//   Step 3 — Notes, invoice_number, waybill_number + Tamamla
//            button.
//
// Data sources (read-only inside the wizard):
//   - useSuppliers     (via SupplierPicker modal)
//   - useWarehouses    (branch-scoped via useBranchStore)
//   - useStockItems    (via StockItemPicker modal)
//   - usePurchaseOrders (to optionally pick a PO)
//
// Submission:
//   - useCreateGoodsReceiving() → POST /warehouse/goods-receiving/
//   - Success → router.replace(/receiving/<new id>)
//   - Error   → dialog.error(...)
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ArrowLeft, ArrowRight, ChevronLeft, Save } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { WizardSteps } from "@/components/ui/WizardSteps";
import { SupplierPicker } from "@/components/purchase/SupplierPicker";
import { StockItemPicker } from "@/components/purchase/StockItemPicker";
import {
  Step1Meta,
  Step2Items,
  Step3Summary,
  POPicker,
  type DraftItem,
} from "@/components/receiving/wizard";
import { useI18n } from "@/i18n";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useSupplier } from "@/hooks/useSuppliers";
import { usePurchaseOrder } from "@/hooks/usePurchaseOrders";
import { useCreateGoodsReceiving } from "@/hooks/useGoodsReceivings";
import { isOfflineQueued, showOfflineQueuedToast } from "@/lib/offline/useOfflineMutation";
import { useBranchStore } from "@/store/useBranchStore";
import { useToast } from "@/components/ui/Toast";
import { dialog } from "@/store/useDialogStore";
import { extractApiError } from "@/utils/apiError";
import type { StockItem, UUID } from "@/types";

const STEPS = [
  { key: 1 as const, i18nKey: "receiving.supplier" },
  { key: 2 as const, i18nKey: "receiving.items" },
  { key: 3 as const, i18nKey: "purchase.notes" },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseRouteParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default function NewGoodsReceivingScreen() {
  const { t } = useI18n();
  const toast = useToast();
  const searchParams = useLocalSearchParams<{ po_id?: string | string[] }>();
  const initialPoId = parseRouteParam(searchParams.po_id) as UUID | undefined;

  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const activeWarehouseId = useBranchStore((s) => s.activeWarehouseId);
  const setActiveWarehouse = useBranchStore((s) => s.setActiveWarehouse);
  const warehousesQuery = useWarehouses();
  const warehouses = useMemo(
    () => warehousesQuery.data ?? [],
    [warehousesQuery.data]
  );

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [supplierId, setSupplierId] = useState<UUID | null>(null);
  const [warehouseId, setWarehouseId] = useState<UUID | null>(
    activeWarehouseId ?? null
  );
  const [purchaseOrderId, setPurchaseOrderId] = useState<UUID | null>(
    initialPoId ?? null
  );
  const [receivedDate, setReceivedDate] = useState<string>(todayIso());
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [waybillNumber, setWaybillNumber] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [poPickerOpen, setPoPickerOpen] = useState(false);
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);

  const supplierQuery = useSupplier(supplierId ?? undefined);
  const supplier = supplierQuery.data;
  const selectedWarehouse = useMemo(
    () => warehouses.find((w) => w.id === warehouseId) ?? null,
    [warehouses, warehouseId]
  );
  const poQuery = usePurchaseOrder(purchaseOrderId ?? undefined);
  const poPrefilledRef = useRef<UUID | null>(null);

  useEffect(() => {
    if (!poQuery.data || !purchaseOrderId) return;
    const po = poQuery.data;
    if (po.id !== purchaseOrderId) return;
    if (poPrefilledRef.current === purchaseOrderId) return;

    const next: DraftItem[] = (po.items ?? [])
      .map((it) => {
        const ordered = Number(it.quantity ?? 0);
        const alreadyReceived = Number(it.received_quantity ?? 0);
        const remaining = Math.max(0, ordered - alreadyReceived);
        return {
          stock_item_id: it.stock_item,
          expected_quantity: remaining,
          received_quantity: remaining,
          rejected_quantity: 0,
          unit: it.unit ?? "",
          unit_price: it.unit_price ?? 0,
          stock_item_name: it.stock_item_name,
          stock_item_sku: it.stock_item_sku,
        };
      })
      .filter((it) => it.expected_quantity > 0);

    poPrefilledRef.current = purchaseOrderId;
    queueMicrotask(() => {
      setItems(next);
      setSupplierId((prev) => prev ?? po.supplier);
      setWarehouseId((prev) => {
        if (prev || !po.warehouse) return prev;
        void setActiveWarehouse(po.warehouse);
        return po.warehouse;
      });
      setPoPickerOpen(false);
    });
  }, [purchaseOrderId, poQuery.data, setActiveWarehouse]);

  useEffect(() => {
    poPrefilledRef.current = null;
  }, [purchaseOrderId]);

  const canGoNext = useMemo(() => {
    if (step === 1) return !!supplierId && !!warehouseId && !!receivedDate;
    if (step === 2) return items.length > 0;
    return true;
  }, [step, supplierId, warehouseId, receivedDate, items.length]);

  const totalAmount = useMemo(
    () => items.reduce((sum, it) => sum + it.received_quantity * it.unit_price, 0),
    [items]
  );

  const addItem = useCallback(
    (stock: StockItem) => {
      const existing = items.find((i) => i.stock_item_id === stock.id);
      if (existing) {
        setItems((prev) =>
          prev.map((i) =>
            i.stock_item_id === stock.id
              ? { ...i, received_quantity: i.received_quantity + 1 }
              : i
          )
        );
        return;
      }
      const next: DraftItem = {
        stock_item_id: stock.id,
        expected_quantity: 1,
        received_quantity: 1,
        rejected_quantity: 0,
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

  const create = useCreateGoodsReceiving();

  const onSubmit = useCallback(() => {
    if (!supplierId || !warehouseId) return;
    if (items.length === 0) {
      toast.error(t("purchase.noItems"));
      return;
    }
    const hasPositiveReceived = items.some((i) => i.received_quantity > 0);
    if (!hasPositiveReceived) {
      toast.error(t("receiving.requirePositiveQty"));
      return;
    }
    const payload = {
      purchase_order_id: purchaseOrderId ?? undefined,
      supplier_id: supplierId,
      warehouse_id: warehouseId,
      received_date: receivedDate,
      invoice_number: invoiceNumber.trim() || undefined,
      waybill_number: waybillNumber.trim() || undefined,
      notes: notes.trim() || undefined,
      items: items.map((i) => ({
        stock_item_id: i.stock_item_id,
        expected_quantity: i.expected_quantity,
        received_quantity: i.received_quantity,
        rejected_quantity: i.rejected_quantity,
        unit: i.unit,
        unit_price: i.unit_price,
        batch_number: i.batch_number,
        expiry_date: i.expiry_date,
        notes: i.notes,
      })),
    };
    create.mutate(payload as any, {
      onSuccess: (gr) => {
        if (isOfflineQueued(gr)) {
          showOfflineQueuedToast(toast, t);
          router.back();
          return;
        }
        toast.success(t("receiving.detail"));
        router.replace(`/(main)/receiving/${gr.id}` as any);
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
    purchaseOrderId,
    items,
    receivedDate,
    invoiceNumber,
    waybillNumber,
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
          title={t("receiving.new")}
          subtitle={t("receiving.title")}
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
            title={t("receiving.new")}
            subtitle={t("receiving.title")}
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
                supplier={supplier ?? null}
                supplierId={supplierId}
                onOpenSupplierPicker={() => setSupplierPickerOpen(true)}
                warehouses={warehouses}
                warehouseId={warehouseId}
                onSelectWarehouse={(id) => {
                  setWarehouseId(id);
                  if (id) void setActiveWarehouse(id);
                }}
                purchaseOrderId={purchaseOrderId}
                poNumber={poQuery.data?.order_number ?? null}
                onOpenPoPicker={() => setPoPickerOpen(true)}
                onClearPo={() => {
                  setPurchaseOrderId(null);
                  setItems([]);
                }}
                receivedDate={receivedDate}
                onReceivedDateChange={setReceivedDate}
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
                invoiceNumber={invoiceNumber}
                onInvoiceNumberChange={setInvoiceNumber}
                waybillNumber={waybillNumber}
                onWaybillNumberChange={setWaybillNumber}
                supplierName={supplier?.name ?? null}
                warehouseName={selectedWarehouse?.name ?? null}
                itemCount={items.length}
                totalAmount={totalAmount}
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
        <POPicker
          visible={poPickerOpen}
          value={purchaseOrderId}
          onSelect={(id) => setPurchaseOrderId(id)}
          onClose={() => setPoPickerOpen(false)}
        />
      </SafeAreaView>
    </>
  );
}
