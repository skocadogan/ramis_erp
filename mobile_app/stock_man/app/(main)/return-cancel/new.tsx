// ============================================================
// Stock Man — New Return / Cancel Record
//
// Web ReturnCancelFormModal ile aynı alanlar ve POST akışı.
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { Save } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { StockItemPicker } from "@/components/purchase/StockItemPicker";
import { ReturnCancelPurchaseOrderPicker } from "@/components/return-cancel/ReturnCancelPurchaseOrderPicker";
import { SupplierPicker } from "@/features/purchase/components/SupplierPicker";
import { WarehousePicker } from "@/components/transfer/WarehousePicker";
import { useI18n } from "@/i18n";
import { useNavigateBack } from "@/hooks/useNavigateBack";
import { usePermission } from "@/hooks/usePermission";
import {
  useCreateReturnCancelMovement,
  useReturnCancelReasonCodes,
  isOfflineQueued,
  showOfflineQueuedToast,
} from "@/hooks/useReturnCancelMovements";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useSupplier } from "@/hooks/useSuppliers";
import { useBranchStore } from "@/store/useBranchStore";
import { useToast } from "@/components/ui/Toast";
import { formatReturnCancelPoOption, findPoLine } from "@/utils/returnCancelPurchaseOrder";
import { parseMovementMoney } from "@/utils/returnCancelReason";
import { dialog } from "@/store/useDialogStore";
import { extractApiError } from "@/utils/apiError";
import type { PurchaseOrder, StockItem, UUID, Warehouse as WarehouseT } from "@/types";

const RETURN_CANCEL_LIST_ROUTE = "/(main)/(tabs)/return-cancel" as Href;

export default function NewReturnCancelScreen() {
  const { t, language } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const canManage = usePermission("inventory.manage_return_cancel");
  const setActiveWarehouse = useBranchStore((s) => s.setActiveWarehouse);
  const { goBack } = useNavigateBack(RETURN_CANCEL_LIST_ROUTE);

  const { data: reasonCodes = [] } = useReturnCancelReasonCodes();
  const warehousesQuery = useWarehouses();
  const warehouses = useMemo(
    () => warehousesQuery.data ?? [],
    [warehousesQuery.data]
  );
  const createMutation = useCreateReturnCancelMovement();

  const [warehouseId, setWarehouseId] = useState<UUID | "">("");
  const [stockItem, setStockItem] = useState<StockItem | null>(null);
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [unitPrice, setUnitPrice] = useState("");
  const [movementType, setMovementType] = useState<"RETURN" | "CANCEL">("RETURN");
  const [quantity, setQuantity] = useState("");
  const [reasonCode, setReasonCode] = useState("EXPIRED");
  const [supplierId, setSupplierId] = useState<UUID | null>(null);
  const [notes, setNotes] = useState("");

  const supplierQuery = useSupplier(supplierId ?? undefined);

  const [warehousePickerOpen, setWarehousePickerOpen] = useState(false);
  const [stockPickerOpen, setStockPickerOpen] = useState(false);
  const [purchaseOrderPickerOpen, setPurchaseOrderPickerOpen] = useState(false);
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);

  const resetPurchaseSelection = useCallback(() => {
    setPurchaseOrder(null);
    setUnitPrice("");
    setSupplierId(null);
  }, []);

  const handlePurchaseOrderSelect = useCallback(
    async (po: PurchaseOrder) => {
      if (!stockItem) return;

      let detail = po;
      let line = findPoLine(po, stockItem.id);

      if (!line) {
        try {
          const { purchaseOrderService } = await import("@/services/purchaseOrderService");
          detail = await purchaseOrderService.get(po.id);
          line = findPoLine(detail, stockItem.id);
        } catch {
          detail = po;
        }
      }

      setPurchaseOrder(detail);

      const resolvedPrice =
        line?.unit_price ??
        stockItem.last_purchase_price ??
        stockItem.average_cost ??
        0;
      setUnitPrice(resolvedPrice ? String(resolvedPrice) : "");

      if (detail.supplier) {
        setSupplierId(detail.supplier);
      }
    },
    [stockItem]
  );

  const selectedWarehouse = useMemo(
    () => warehouses.find((w) => w.id === warehouseId) ?? null,
    [warehouses, warehouseId]
  );

  const onSubmit = useCallback(() => {
    const q = Number(quantity.replace(",", "."));
    if (!stockItem || !warehouseId || !Number.isFinite(q) || q <= 0) {
      toast.error(t("returnCancel.createFailed"));
      return;
    }

    createMutation.mutate(
      {
        stock_item_id: stockItem.id,
        warehouse_id: warehouseId,
        movement_type: movementType,
        quantity: q,
        unit: stockItem.unit || undefined,
        unit_price: parseMovementMoney(unitPrice) || undefined,
        reference: reasonCode,
        notes: notes.trim() || undefined,
        supplier_id: supplierId ?? undefined,
        purchase_order_id: purchaseOrder?.id ?? undefined,
      },
      {
        onSuccess: (data) => {
          if (isOfflineQueued(data)) {
            showOfflineQueuedToast(toast, t);
            router.replace(RETURN_CANCEL_LIST_ROUTE);
            return;
          }
          toast.success(t("returnCancel.createSuccess"));
          router.replace(RETURN_CANCEL_LIST_ROUTE);
        },
        onError: (err: unknown) => {
          dialog.error(
            t("returnCancel.createFailed"),
            extractApiError(err, t("returnCancel.createFailed"))
          );
        },
      }
    );
  }, [
    createMutation,
    movementType,
    notes,
    purchaseOrder,
    quantity,
    reasonCode,
    router,
    stockItem,
    supplierId,
    t,
    toast,
    unitPrice,
    warehouseId,
  ]);

  if (!canManage) {
    return (
      <Screen padded>
        <Stack.Screen options={{ headerShown: false }} />
        <Header
          title={t("returnCancel.createTitle")}
          back
          onBackPress={goBack}
        />
        <Card className="mt-4">
          <Text className="text-body text-muted-foreground text-center py-6">
            {t("errors.forbidden")}
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen padded={false}>
        <View className="px-4 pt-2">
          <Header
            title={t("returnCancel.createTitle")}
            back
            onBackPress={goBack}
          />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <ScrollView
            className="flex-1 px-4"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            <Card className="gap-4">
              <View>
                <Text className="text-caption text-muted-foreground font-semibold uppercase mb-2">
                  {t("returnCancel.formWarehouse")}
                </Text>
                <Button
                  variant="outline"
                  onPress={() => setWarehousePickerOpen(true)}
                  fullWidth
                >
                  {selectedWarehouse?.name ?? t("returnCancel.formWarehouse")}
                </Button>
              </View>

              <View>
                <Text className="text-caption text-muted-foreground font-semibold uppercase mb-2">
                  {t("returnCancel.formStockItem")}
                </Text>
                <Button
                  variant="outline"
                  onPress={() => setStockPickerOpen(true)}
                  disabled={!warehouseId}
                  fullWidth
                >
                  {stockItem
                    ? `${stockItem.name} (${stockItem.sku})`
                    : t("returnCancel.formStockItem")}
                </Button>
              </View>

              <View>
                <Text className="text-caption text-muted-foreground font-semibold uppercase mb-2">
                  {t("returnCancel.formPurchaseOrder")}
                  <Text className="text-caption text-muted-foreground font-normal"> · {t("common.optional")}</Text>
                </Text>
                <Button
                  variant="outline"
                  onPress={() => setPurchaseOrderPickerOpen(true)}
                  disabled={!warehouseId || !stockItem}
                  fullWidth
                >
                  {purchaseOrder && stockItem
                    ? formatReturnCancelPoOption(purchaseOrder, stockItem.id, language)
                    : t("returnCancel.formPurchaseOrderPlaceholder")}
                </Button>
                {!purchaseOrder && (
                  <Text className="text-caption text-muted-foreground mt-1">
                    {t("returnCancel.formPurchaseOrderHint")}
                  </Text>
                )}
              </View>

              <View>
                <Text className="text-caption text-muted-foreground font-semibold uppercase mb-2">
                  {t("returnCancel.formMovementType")}
                </Text>
                <View className="flex-row gap-2">
                  <Chip
                    label={t("returnCancel.movementTypeReturn")}
                    selected={movementType === "RETURN"}
                    onPress={() => setMovementType("RETURN")}
                    variant="primary"
                  />
                  <Chip
                    label={t("returnCancel.movementTypeCancel")}
                    selected={movementType === "CANCEL"}
                    onPress={() => setMovementType("CANCEL")}
                    variant="primary"
                  />
                </View>
              </View>

              <View>
                <Text className="text-caption text-muted-foreground font-semibold uppercase mb-2">
                  {t("returnCancel.formReason")}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-2">
                    {reasonCodes.map((r) => (
                      <Chip
                        key={r.code}
                        label={r.label}
                        selected={reasonCode === r.code}
                        onPress={() => setReasonCode(r.code)}
                        variant="default"
                      />
                    ))}
                  </View>
                </ScrollView>
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Input
                    label={t("returnCancel.formQuantity")}
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View className="flex-1">
                  <Input
                    label={t("returnCancel.formUnit")}
                    value={stockItem?.unit ?? ""}
                    editable={false}
                  />
                </View>
              </View>

              <Input
                label={t("returnCancel.formUnitPrice")}
                value={unitPrice}
                onChangeText={setUnitPrice}
                keyboardType="decimal-pad"
                placeholder={
                  purchaseOrder
                    ? t("returnCancel.formUnitPricePlaceholder")
                    : t("returnCancel.formUnitPriceManualPlaceholder")
                }
              />

              <View>
                <Text className="text-caption text-muted-foreground font-semibold uppercase mb-2">
                  {t("returnCancel.formSupplier")}
                </Text>
                <Button
                  variant="outline"
                  onPress={() => setSupplierPickerOpen(true)}
                  fullWidth
                >
                  {supplierQuery.data?.name ?? (supplierId ? "…" : "—")}
                </Button>
              </View>

              <Input
                label={t("returnCancel.formNotes")}
                value={notes}
                onChangeText={setNotes}
                placeholder={t("returnCancel.formNotesPlaceholder")}
                multiline
                numberOfLines={3}
              />
            </Card>

            <View className="flex-row gap-2 mt-4">
              <Button variant="outline" className="flex-1" onPress={goBack}>
                {t("returnCancel.formCancel")}
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                leftIcon={Save}
                loading={createMutation.isPending}
                disabled={!stockItem || !warehouseId || !quantity}
                onPress={onSubmit}
              >
                {t("returnCancel.formSave")}
              </Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>

      <WarehousePicker
        visible={warehousePickerOpen}
        title={t("returnCancel.formWarehouse")}
        onSelect={(w: WarehouseT) => {
          setWarehouseId(w.id);
          void setActiveWarehouse(w.id);
          setStockItem(null);
          resetPurchaseSelection();
          setWarehousePickerOpen(false);
        }}
        onClose={() => setWarehousePickerOpen(false)}
      />

      <StockItemPicker
        visible={stockPickerOpen}
        warehouseId={warehouseId || undefined}
        warehouseRequired
        onSelect={(item) => {
          setStockItem(item);
          resetPurchaseSelection();
          setStockPickerOpen(false);
        }}
        onClose={() => setStockPickerOpen(false)}
      />

      <ReturnCancelPurchaseOrderPicker
        visible={purchaseOrderPickerOpen}
        value={purchaseOrder?.id ?? null}
        warehouseId={warehouseId || undefined}
        stockItemId={stockItem?.id}
        onSelect={handlePurchaseOrderSelect}
        onClose={() => setPurchaseOrderPickerOpen(false)}
      />

      <SupplierPicker
        visible={supplierPickerOpen}
        value={supplierId}
        onSelect={(id) => {
          setSupplierId(id);
          setSupplierPickerOpen(false);
        }}
        onClose={() => setSupplierPickerOpen(false)}
      />
    </>
  );
}
