// ============================================================
// Stock Man — Purchase Order Detail (P2)
//
// Read-mostly view of a single PO. Composes:
//   - Header (back + order_number + status badge)
//   - Top card (supplier, warehouse, dates, totals, RBAC-aware amount)
//   - Horizontal status timeline (6 stepper with current highlighted)
//   - Items list (POItemRow read-only)
//   - Notes section (if present)
//   - POActionBar (status-driven action buttons)
//
// Data: usePurchaseOrder(id). Refreshes on focus via the
// React Query cache; pull-to-refresh wired too.
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  PackageX,
  User,
  Warehouse,
} from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/ui/Header";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { Loading } from "@/components/ui/Loading";
import { Button } from "@/components/ui/Button";
import { HorizontalStatusTimeline } from "@/components/ui/HorizontalStatusTimeline";
import { InfoRow } from "@/components/ui/InfoRow";
import { POActionBar } from "@/components/purchase/POActionBar";
import { POItemsTable } from "@/components/purchase/POItemsTable";
import { PODeliveryDetailsSheet } from "@/components/purchase/PODeliveryDetailsSheet";
import { StockItemPicker } from "@/features/purchase/components/StockItemPicker";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { useResponsive } from "@/hooks/useResponsive";
import { usePurchaseOrder, useUpdatePurchaseOrder } from "@/hooks/usePurchaseOrders";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/utils/cn";
import type { POStatus, UUID, PurchaseOrderItem, StockItem } from "@/types";

const STATUS_FLOW: POStatus[] = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "ORDERED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
];

// Map status → step index in the flow (0-based).
// CANCELLED is a side branch, rendered separately.
function stepIndex(status: POStatus): number {
  if (status === "CANCELLED") return -1;
  return STATUS_FLOW.indexOf(status);
}

export default function PurchaseOrderDetailScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { isTablet } = useResponsive();
  const params = useLocalSearchParams<{ id: string }>();
  const id = (params.id ?? "") as UUID;
  const currentUser = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { date, dateTime } = useFormatters();

  const query = usePurchaseOrder(id || undefined);
  const po = query.data;
  const currentStep = po ? stepIndex(po.status) : 0;
  const [deliveryDetailsOpen, setDeliveryDetailsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedItems, setEditedItems] = useState<PurchaseOrderItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const updatePO = useUpdatePurchaseOrder();

  const onRefresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["purchase-orders", id] });
  }, [qc, id]);

  const startEditing = () => {
    if (!po) return;
    setEditedItems(po.items ? [...po.items] : []);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditedItems([]);
  };

  const saveEditing = () => {
    if (!po) return;
    updatePO.mutate(
      {
        id: po.id,
        payload: {
          items: editedItems.map((item) => ({
            stock_item_id: item.stock_item,
            quantity: item.quantity ?? 0,
            unit: item.unit ?? "",
            unit_price: item.unit_price ?? 0,
          })),
        },
      },
      {
        onSuccess: () => {
          toast.success(t("common.success"));
          setIsEditing(false);
          void qc.invalidateQueries({ queryKey: ["purchase-orders", id] });
        },
        onError: (err) => {
          toast.error(t("errors.unknown"));
        },
      }
    );
  };

  const onUpdateQuantity = (stockItemId: UUID, qty: number) => {
    setEditedItems((prev) =>
      prev.map((item) =>
        item.stock_item === stockItemId ? { ...item, quantity: qty } : item
      )
    );
  };

  const onUpdateUnitPrice = (stockItemId: UUID, price: number) => {
    setEditedItems((prev) =>
      prev.map((item) =>
        item.stock_item === stockItemId ? { ...item, unit_price: price } : item
      )
    );
  };

  const onRemoveItem = (stockItemId: UUID) => {
    setEditedItems((prev) => prev.filter((item) => item.stock_item !== stockItemId));
  };

  const onAddItem = (stockItem: StockItem) => {
    if (editedItems.some((item) => item.stock_item === stockItem.id)) {
      toast.error(t("stock.barcodeAlreadyRegistered"));
      return;
    }
    const newItem: PurchaseOrderItem = {
      stock_item: stockItem.id,
      stock_item_name: stockItem.name,
      stock_item_sku: stockItem.sku,
      unit: stockItem.unit,
      quantity: 1,
      unit_price: stockItem.last_purchase_price ?? 0,
    };
    setEditedItems((prev) => [...prev, newItem]);
  };

  const onActionComplete = useCallback(
    (action: "submit" | "approve" | "mark_ordered" | "cancel" | "delete") => {
      if (action === "delete") {
        toast.success(t("common.success"));
        router.back();
        return;
      }
      const labelMap: Record<string, string> = {
        submit: t("purchase.actions.submit"),
        approve: t("purchase.actions.approve"),
        mark_ordered: t("purchase.actions.markOrdered"),
        cancel: t("purchase.actions.cancel"),
      };
      toast.success(labelMap[action] ?? t("common.success"));
    },
    [router, toast, t]
  );

  const displayItems = isEditing ? editedItems : (po?.items ?? []);
  const displayTotal = isEditing
    ? editedItems.reduce((sum, item) => sum + (item.quantity ?? 0) * (item.unit_price ?? 0), 0)
    : (po?.total_amount ?? 0);
  const orderDate = useMemo(
    () => (po ? date(po.order_date) : "—"),
    [po, date]
  );
  const expectedDate = useMemo(
    () => (po ? date(po.expected_date ?? null) : "—"),
    [po, date]
  );
  const createdAt = useMemo(
    () => (po ? dateTime(po.created_at) : "—"),
    [po, dateTime]
  );

  const canOpenDeliveryDetails = !!po && po.status !== "CANCELLED";

  const openDeliveryDetails = useCallback(() => {
    if (!po || po.status === "CANCELLED") return;
    setDeliveryDetailsOpen(true);
  }, [po]);

  const openCreateReceiving = useCallback(() => {
    if (!po) return;
    router.push({
      pathname: "/(main)/receiving/new",
      params: { po_id: po.id },
    } as any);
  }, [router, po]);

  // ─── Loading / error ───────────────────────────────────────
  if (query.isPending) {
    return (
      <Screen padded>
        <Stack.Screen options={{ headerShown: false }} />
        <Loading fullScreen label={t("common.loading")} />
      </Screen>
    );
  }

  if (query.isError || !po) {
    return (
      <Screen padded>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="px-4 pt-2">
          <Header
            title={t("purchase.detail")}
            back
            inline
            onBackPress={() => router.back()}
          />
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <PackageX size={40} color="#DC2626" />
          <Text className="text-h3 text-foreground mt-3 text-center">
            {t("errors.notFound")}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-4 px-5 py-3 rounded-xl bg-primary"
          >
            <Text className="text-primary-foreground font-semibold">
              {t("common.back")}
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const statusSection = (
    <Card
      className={cn("mb-3", canOpenDeliveryDetails && "active:opacity-90")}
      onPress={canOpenDeliveryDetails ? openDeliveryDetails : undefined}
      accessibilityLabel={t("purchase.deliveryDetailsTitle")}
    >
      {po.status !== "CANCELLED" ? (
        <>
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-caption text-muted-foreground">
              {t("common.status")}
            </Text>
            {canOpenDeliveryDetails ? (
              <View className="flex-row items-center">
                <Text className="text-caption text-primary mr-1">
                  {t("purchase.deliveryDetailsTapHint")}
                </Text>
                <ChevronRight size={14} color="#1E40AF" />
              </View>
            ) : null}
          </View>
          <HorizontalStatusTimeline
            flow={STATUS_FLOW}
            current={currentStep}
            getLabel={(status) => t(`purchase.statusLabels.${PURCHASE_STATUS_LABEL_MAP[status]}` as any)}
          />
        </>
      ) : (
        <View className="border-l-4 border-l-destructive pl-3">
          <View className="flex-row items-center">
            <Badge
              variant="destructive"
              size="sm"
              label={t("purchase.statusLabels.cancelled")}
              dot
            />
            <Text className="ml-2 text-caption text-muted-foreground">
              {t("common.status")}
            </Text>
          </View>
        </View>
      )}
    </Card>
  );

  const poInfoSection = (
    <Card className="mb-3">
      <View className="flex-row items-start mb-3">
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mr-3">
          <Building2 size={20} color="#1E40AF" />
        </View>
        <Text className="flex-1 text-h3 text-foreground">{t("purchase.detail")}</Text>
      </View>

      <View className="mb-3">
        <Text className="text-caption text-muted-foreground">{t("purchase.supplier")}</Text>
        <Text className="text-body font-semibold text-foreground" numberOfLines={2}>
          {po.supplier_name ?? "—"}
        </Text>
        {po.warehouse_name ? (
          <View className="flex-row items-center mt-1">
            <Warehouse size={12} color="#64748B" />
            <Text className="ml-1 text-caption text-muted-foreground" numberOfLines={2}>
              {po.warehouse_name}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="pt-3 border-t border-border flex-row items-center justify-between">
        <View className="flex-1 mr-2">
          <Text className="text-caption text-muted-foreground">
            {t("purchase.totalAmount")}
          </Text>
          <Amount
            value={displayTotal}
            minimumFractionDigits={2}
            maximumFractionDigits={2}
            className="mt-0.5"
          />
        </View>
        <View>
          <Text className="text-caption text-muted-foreground text-right">
            {t("purchase.items")}
          </Text>
          <Text className="text-h3 text-foreground font-bold text-right mt-0.5">
            {displayItems.length}
          </Text>
        </View>
      </View>
    </Card>
  );

  const datesSection = (
    <Card className="mb-3">
      <View className="flex-row items-center mb-2">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
          <CalendarDays size={18} color="#1E40AF" />
        </View>
        <Text className="flex-1 text-h3 text-foreground">{t("common.date")}</Text>
      </View>
      <InfoRow label={t("purchase.orderDate")} value={orderDate} />
      {po.expected_date ? (
        <InfoRow label={t("purchase.expectedDate")} value={expectedDate} />
      ) : null}
      <InfoRow label={t("common.createdAt")} value={createdAt} />
      {po.created_by_name ? (
        <InfoRow
          label={t("auth.username")}
          value={po.created_by_name}
          icon={User}
        />
      ) : null}
      {po.approved_by_name ? (
        <InfoRow
          label={t("purchase.actions.approve")}
          value={po.approved_by_name}
          icon={Check}
          isLast
        />
      ) : null}
      {currentUser?.full_name && po.approved_by_name === currentUser.full_name ? (
        <View className="mt-1 flex-row items-center">
          <CheckCircle2 size={12} color="#059669" />
          <Text className="ml-1 text-caption text-success">{t("common.success")}</Text>
        </View>
      ) : null}
    </Card>
  );

  const actionsSection = (
    <View className="mb-3">
      <POActionBar
        po={po}
        onActionComplete={onActionComplete}
        onReceive={openCreateReceiving}
      />
    </View>
  );

  const notesSection = po.notes ? (
    <Card className="mb-3">
      <View className="flex-row items-center mb-2">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
          <FileText size={18} color="#1E40AF" />
        </View>
        <Text className="flex-1 text-h3 text-foreground">{t("purchase.notes")}</Text>
      </View>
      <Text className="text-body text-foreground leading-5">{po.notes}</Text>
    </Card>
  ) : null;

  const leftColumnContent = (
    <>
      {poInfoSection}
      {datesSection}
      {actionsSection}
      {notesSection}
    </>
  );

  const itemsSection = (
    <Card className="w-full">
      <View className="flex-row items-center mb-3">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
          <ClipboardList size={18} color="#1E40AF" />
        </View>
        <Text className="flex-1 text-h3 text-foreground" numberOfLines={1}>
          {t("purchase.items")}
        </Text>
        <Text className="text-caption text-muted-foreground ml-2">
          {displayItems.length}
        </Text>
      </View>
      <POItemsTable
        items={displayItems}
        editable={isEditing}
        onUpdateQuantity={onUpdateQuantity}
        onUpdateUnitPrice={onUpdateUnitPrice}
        onRemoveItem={onRemoveItem}
      />
      {isEditing ? (
        <Button
          variant="outline"
          onPress={() => setPickerOpen(true)}
          className="mt-3"
          fullWidth
        >
          {t("purchase.addItem")}
        </Button>
      ) : null}
    </Card>
  );

  const refreshControl = (
    <RefreshControl
      refreshing={query.isFetching && !query.isPending}
      onRefresh={onRefresh}
      tintColor="#1E40AF"
    />
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <View className="px-4 pt-2">
          <Header
            title={po.order_number}
            subtitle={t("purchase.detail")}
            back
            inline
            right={
              po && (po.status === "DRAFT" || po.status === "PENDING") && !isEditing ? (
                <Pressable
                  onPress={startEditing}
                  accessibilityRole="button"
                  accessibilityLabel="Edit PO"
                  className="px-3 py-1.5 rounded-lg bg-primary/10 active:bg-primary/20"
                >
                  <Text className="text-primary font-semibold text-caption">{t("common.edit")}</Text>
                </Pressable>
              ) : null
            }
            onBackPress={() => router.back()}
          />
        </View>

        {isTablet ? (
          <View className="flex-1 px-4 pb-4">
            <View className="pt-4">{statusSection}</View>
            <View className="flex-1 flex-row pt-3" style={{ gap: 8 }}>
              <View style={{ flex: 3, minWidth: 0 }}>
                <ScrollView
                  className="flex-1"
                  contentContainerStyle={{ paddingBottom: 24 }}
                  refreshControl={refreshControl}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                >
                  {leftColumnContent}
                </ScrollView>
              </View>
              <View style={{ flex: 7, minWidth: 0 }}>
                <ScrollView
                  className="flex-1"
                  contentContainerStyle={{ paddingBottom: 24 }}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                >
                  {itemsSection}
                </ScrollView>
              </View>
            </View>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            refreshControl={refreshControl}
          >
            {statusSection}
            {leftColumnContent}
            <View className="mt-1">{itemsSection}</View>
          </ScrollView>
        )}
        {isEditing ? (
          <View className="border-t border-border bg-card px-4 py-3 flex-row gap-2">
            <Button
              variant="outline"
              onPress={cancelEditing}
              className="flex-1"
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              onPress={saveEditing}
              loading={updatePO.isPending}
              className="flex-1"
            >
              {t("common.save")}
            </Button>
          </View>
        ) : null}
      </KeyboardAvoidingView>
      </SafeAreaView>

      {deliveryDetailsOpen ? (
        <PODeliveryDetailsSheet
          purchaseOrderId={po.id}
          orderNumber={po.order_number}
          onClose={() => setDeliveryDetailsOpen(false)}
        />
      ) : null}

      <StockItemPicker
        visible={pickerOpen}
        onSelect={onAddItem}
        onClose={() => setPickerOpen(false)}
        warehouseId={po.warehouse}
        alreadySelectedIds={editedItems.map((item) => item.stock_item)}
      />
    </>
  );
}



const PURCHASE_STATUS_LABEL_MAP: Record<string, string> = {
  DRAFT: "draft",
  PENDING: "pending",
  APPROVED: "approved",
  ORDERED: "ordered",
  PARTIALLY_RECEIVED: "partiallyReceived",
  RECEIVED: "received",
  CANCELLED: "cancelled",
};
