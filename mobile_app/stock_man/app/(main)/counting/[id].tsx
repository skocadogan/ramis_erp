// ============================================================
// Stock Man — Stock Counting Detail (P4)
//
// Read-mostly view of a single Stock Counting. Composes:
//   - Header (back + counting_number + status badge)
//   - Top card (warehouse, counting_date, counted_by, approved_by)
//   - Horizontal status timeline (4 stepper: DRAFT → IN_PROGRESS → COMPLETED → APPROVED)
//   - Items list — editable in IN_PROGRESS state (per-line
//     NumberStepper on `counted_quantity`), read-only in
//     other states
//   - Notes section (if present)
//   - CountingActionBar (status-driven action buttons)
//
// Data: useStockCounting(id). Refreshes on focus via the
// React Query cache; pull-to-refresh wired too. Bulk-save
// (`useUpdateCountingItems`) is a per-line edit that fires
// from the action bar's "Kalemleri Güncelle" button.
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  Check,
  ClipboardList,
  FileText,
  PackageX,
  User,
  Warehouse,
} from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { HorizontalStatusTimeline } from "@/components/ui/HorizontalStatusTimeline";
import { InfoRow } from "@/components/ui/InfoRow";
import { Loading } from "@/components/ui/Loading";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { dialog } from "@/store/useDialogStore";
import { extractApiError } from "@/utils/apiError";
import { CountingStatusBadge } from "@/components/counting/CountingStatusBadge";
import { CountingItemRow } from "@/components/counting/CountingItemRow";
import { DetailItemsList } from "@/components/ui/DetailItemsList";
import { CountingActionBar } from "@/components/counting/CountingActionBar";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import {
  useStockCounting,
  useUpdateCountingItems,
} from "@/hooks/useStockCountings";
import { isOfflineQueued, showOfflineQueuedToast } from "@/lib/offline/useOfflineMutation";
import type { StockCountingItem, StockCountingStatus, UUID } from "@/types";

const STATUS_FLOW: StockCountingStatus[] = [
  "DRAFT",
  "IN_PROGRESS",
  "COMPLETED",
  "APPROVED",
];

function stepIndex(status: StockCountingStatus): number {
  return STATUS_FLOW.indexOf(status);
}

export default function CountingDetailScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ id: string }>();
  const id = (params.id ?? "") as UUID;
  const qc = useQueryClient();

  const { date, dateTime } = useFormatters();

  const query = useStockCounting(id || undefined);
  const counting = query.data;

  // Local draft of items, used only while the counting is
  // IN_PROGRESS. Reset whenever the server's `items` change.
  // We follow the project's existing pattern (see receiving
  // wizard) — defer the setState to a microtask so the
  // effect body only reads the prop and the cascade
  // happens on the next tick.
  const [draftItems, setDraftItems] = useState<StockCountingItem[]>(
    () => counting?.items ?? []
  );
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!counting?.items) return;
    queueMicrotask(() => {
      if (dirty) return;
      setDraftItems(counting.items);
      setDirty(false);
    });
  }, [counting?.items, dirty]);

  const updateItems = useUpdateCountingItems();

  const onRefresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["stock-countings", id] });
  }, [qc, id]);

  const onActionComplete = useCallback(
    (action: "start" | "finish" | "approve" | "delete" | "bulk_save") => {
      if (action === "delete") {
        toast.success(t("common.success"));
        router.back();
        return;
      }
      if (action === "bulk_save") {
        // Reset dirty flag after a successful bulk-save
        setDirty(false);
        return;
      }
      const labelMap: Record<string, string> = {
        start: t("counting.actions.start"),
        finish: t("counting.actions.finish"),
        approve: t("counting.actions.approve"),
      };
      toast.success(labelMap[action] ?? t("common.success"));
    },
    [router, toast, t]
  );

  const onUpdateCounted = useCallback(
    (stockItemId: UUID, value: number) => {
      setDraftItems((prev) =>
        prev.map((it) =>
          it.stock_item === stockItemId
            ? {
                ...it,
                counted_quantity: value,
                difference: value - (it.system_quantity ?? 0),
              }
            : it
        )
      );
      setDirty(true);
    },
    []
  );

  const onBulkSave = useCallback(() => {
    if (!counting) return;
    if (!dirty) {
      // Nothing changed — silently ignore the tap
      return;
    }
    dialog.confirm(
      t("common.save"),
      `${counting.counting_number} — ${t("common.confirm")}?`,
      () => {
        const payload = {
          id: counting.id,
          items: draftItems.map((it) => ({
            stock_item_id: it.stock_item,
            counted_quantity: it.counted_quantity,
            unit: it.unit,
          })),
        };
        updateItems.mutate(payload, {
          onSuccess: (result) => {
            if (isOfflineQueued(result)) {
              showOfflineQueuedToast(toast, t);
              return;
            }
            onActionComplete("bulk_save");
          },
          onError: (err: unknown) => {
            dialog.error(
              t("common.error"),
              extractApiError(err, t("errors.unknown"))
            );
          },
        });
      }
    );
  }, [counting, dirty, draftItems, updateItems, onActionComplete, t, toast]);

  const currentStep = counting ? stepIndex(counting.status) : -1;
  const countingDate = useMemo(
    () => (counting ? date(counting.counting_date) : "—"),
    [counting, date]
  );
  const createdAt = useMemo(
    () => (counting ? dateTime(counting.created_at) : "—"),
    [counting, dateTime]
  );

  // ─── Loading / error ───────────────────────────────────────
  if (query.isPending) {
    return (
      <Screen padded>
        <Stack.Screen options={{ headerShown: false }} />
        <Loading fullScreen label={t("common.loading")} />
      </Screen>
    );
  }

  if (query.isError || !counting) {
    return (
      <Screen padded>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="px-4 pt-2">
          <Header
            title={t("counting.detail")}
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

  const isEditable = counting.status === "IN_PROGRESS";

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <View className="px-4 pt-2">
          <Header
            title={counting.counting_number}
            subtitle={t("counting.detail")}
            back
            inline
            onBackPress={() => router.back()}
            right={
              <CountingStatusBadge status={counting.status} size="md" />
            }
          />
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching && !query.isPending}
              onRefresh={onRefresh}
              tintColor="#1E40AF"
            />
          }
        >
          {/* Status timeline */}
          <Card className="mb-3">
            <Text className="text-caption text-muted-foreground mb-3">
              {t("common.status")}
            </Text>
            <HorizontalStatusTimeline
              flow={STATUS_FLOW}
              current={currentStep}
              getLabel={(status) => t(`counting.statusLabels.${COUNTING_STATUS_LABEL_MAP[status]}` as any)}
            />
          </Card>

          {/* Top card: warehouse + date */}
          <Card className="mb-3">
            <View className="flex-row items-start">
              <View className="h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mr-3">
                <Building2 size={20} color="#1E40AF" />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-caption text-muted-foreground">
                  {t("deficiency.warehouse")}
                </Text>
                <Text
                  className="text-body font-semibold text-foreground"
                  numberOfLines={1}
                >
                  {counting.warehouse_name ?? "—"}
                </Text>
                {counting.warehouse_name ? (
                  <View className="flex-row items-center mt-0.5">
                    <Warehouse size={12} color="#64748B" />
                    <Text
                      className="ml-1 text-caption text-muted-foreground"
                      numberOfLines={1}
                    >
                      {counting.warehouse_name}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View className="items-end">
                <Text className="text-caption text-muted-foreground">
                  {t("counting.countedAt")}
                </Text>
                <Text className="text-h3 text-foreground font-bold">
                  {countingDate}
                </Text>
              </View>
            </View>
          </Card>

          {/* Audit card */}
          <Card className="mb-3">
            <View className="flex-row items-center mb-2">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
                <CalendarDays size={18} color="#1E40AF" />
              </View>
              <Text className="flex-1 text-h3 text-foreground">
                {t("common.date")}
              </Text>
            </View>
            <InfoRow label={t("common.date")} value={createdAt} />
            {counting.counted_by_name ? (
              <InfoRow
                label={t("counting.countedAt")}
                value={counting.counted_by_name}
                icon={User}
              />
            ) : null}
            {counting.approved_by_name ? (
              <InfoRow
                label={t("counting.actions.approve")}
                value={counting.approved_by_name}
                icon={Check}
                isLast
              />
            ) : null}
          </Card>

          {/* Items */}
          <Card className="mb-3">
            <View className="flex-row items-center mb-3">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
                <ClipboardList size={18} color="#1E40AF" />
              </View>
              <Text className="flex-1 text-h3 text-foreground">
                {t("counting.items")}
              </Text>
              <Text className="text-caption text-muted-foreground">
                {(isEditable ? draftItems : counting.items)?.length ?? 0}
              </Text>
            </View>
            {(isEditable ? draftItems : counting.items)?.length === 0 ? (
              <Text className="text-caption text-muted-foreground text-center py-3">
                {t("purchase.noItems")}
              </Text>
            ) : (
              <DetailItemsList<StockCountingItem>
                data={(isEditable ? draftItems : counting.items) ?? []}
                keyExtractor={(it) => it.id ?? it.stock_item}
                itemHeight={96}
                renderItem={({ item: it }) => (
                  <CountingItemRow
                    item={it}
                    editable={isEditable}
                    onCountedChange={
                      isEditable
                        ? (q) => onUpdateCounted(it.stock_item, q)
                        : undefined
                    }
                  />
                )}
              />
            )}

            {isEditable && dirty ? (
              <View className="mt-2">
                <Button
                  variant="outline"
                  onPress={onBulkSave}
                  loading={updateItems.isPending}
                  disabled={updateItems.isPending}
                  fullWidth
                >
                  {t("common.save")}
                </Button>
              </View>
            ) : null}
          </Card>

          {/* Notes */}
          {counting.notes ? (
            <Card className="mb-3">
              <View className="flex-row items-center mb-2">
                <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
                  <FileText size={18} color="#1E40AF" />
                </View>
                <Text className="flex-1 text-h3 text-foreground">
                  {t("purchase.notes")}
                </Text>
              </View>
              <Text className="text-body text-foreground leading-5">
                {counting.notes}
              </Text>
            </Card>
          ) : null}

          {/* Actions */}
          <View className="mt-2">
            <CountingActionBar
              counting={counting}
              onBulkSave={isEditable ? onBulkSave : undefined}
              onActionComplete={onActionComplete}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}



const COUNTING_STATUS_LABEL_MAP: Record<string, string> = {
  DRAFT: "draft",
  IN_PROGRESS: "inProgress",
  COMPLETED: "completed",
  APPROVED: "approved",
};
