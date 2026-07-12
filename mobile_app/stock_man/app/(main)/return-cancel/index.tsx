// ============================================================
// Stock Man — Return / Cancel List
//
// Web ReturnCancelReportsTab ile aynı iş akışı: filtre,
// özet kartları, sanallaştırılmış tablo, kayıt oluştur/sil.
// ============================================================

import React, { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Plus, RotateCcw } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loading } from "@/components/ui/Loading";
import { Amount } from "@/components/ui/Amount";
import { BranchRequiredPrompt } from "@/components/branch/BranchRequiredPrompt";
import {
  ReturnCancelFilterBar,
  type ReturnCancelFiltersWithDates,
} from "@/components/return-cancel/ReturnCancelFilterBar";
import { ReturnCancelTable } from "@/components/return-cancel/ReturnCancelTable";
import { ReturnCancelDetailSheet } from "@/components/return-cancel/ReturnCancelDetailSheet";
import { useI18n } from "@/i18n";
import {
  defaultReturnCancelDateRange,
  summarizeReturnCancelRows,
  useDeleteReturnCancelMovement,
  useInfiniteReturnCancelMovements,
  useReturnCancelReasonCodes,
  isOfflineQueued,
  showOfflineQueuedToast,
} from "@/hooks/useReturnCancelMovements";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useBranchStore } from "@/store/useBranchStore";
import { usePermission } from "@/hooks/usePermission";
import { useFormatters } from "@/hooks/useFormatters";
import { useToast } from "@/components/ui/Toast";
import { dialog } from "@/store/useDialogStore";
import { extractApiError } from "@/utils/apiError";
import { normalizeIsoDate } from "@/lib/format/date";
import { extractResults } from "@/types/api";
import type { StockMovement } from "@/types";

export default function ReturnCancelListScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { quantity } = useFormatters();
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const canView = usePermission("inventory.view_return_cancel");
  const canManage = usePermission("inventory.manage_return_cancel");

  const defaults = useMemo(() => defaultReturnCancelDateRange(), []);
  const [filters, setFilters] = useState<ReturnCancelFiltersWithDates>(() => ({
    startDate: defaults.startDate,
    endDate: defaults.endDate,
    page_size: 50,
  }));
  const [detailTarget, setDetailTarget] = useState<StockMovement | null>(null);

  const { data: reasonCodes = [] } = useReturnCancelReasonCodes();
  const warehousesQuery = useWarehouses();
  const suppliersQuery = useSuppliers({ page_size: 200 } as any);

  const warehouses = useMemo(
    () => warehousesQuery.data ?? [],
    [warehousesQuery.data]
  );
  const suppliers = useMemo(
    () => extractResults(suppliersQuery.data) ?? [],
    [suppliersQuery.data]
  );

  const queryFilters = useMemo(
    () => ({
      warehouse_id: filters.warehouse_id,
      start_date: normalizeIsoDate(filters.startDate),
      end_date: normalizeIsoDate(filters.endDate),
      movement_type: filters.movement_type,
      reason_code: filters.reason_code,
      supplier_id: filters.supplier_id,
      search: filters.search,
      page_size: filters.page_size ?? 50,
    }),
    [filters]
  );

  const query = useInfiniteReturnCancelMovements(queryFilters);
  const deleteMutation = useDeleteReturnCancelMovement();

  const movements = useMemo(() => {
    if (!query.data) return [];
    return query.data.pages.flatMap((page) => page.results ?? []);
  }, [query.data]);

  const { totalQty, totalAmount } = useMemo(
    () => summarizeReturnCancelRows(movements),
    [movements]
  );

  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [query]);

  const onRefresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  const onAdd = useCallback(() => {
    router.push("/(main)/return-cancel/new" as any);
  }, [router]);

  const onDelete = useCallback(
    (row: StockMovement) => {
      dialog.confirm(
        t("returnCancel.deleteConfirmTitle"),
        t("returnCancel.deleteConfirmDescription"),
        () => {
          deleteMutation.mutate(row.id, {
            onSuccess: (data) => {
              if (isOfflineQueued(data)) {
                showOfflineQueuedToast(toast, t);
                return;
              }
              toast.success(t("returnCancel.deleteSuccess"));
            },
            onError: (err: unknown) => {
              toast.error(extractApiError(err, t("returnCancel.deleteFailed")));
            },
          });
        }
      );
    },
    [deleteMutation, t, toast]
  );

  if (!activeBranchId) {
    return (
      <BranchRequiredPrompt
        title={t("returnCancel.title")}
        subtitle={t("returnCancel.subtitle")}
        icon={RotateCcw}
      />
    );
  }

  if (!canView) {
    return (
      <Screen padded>
        <Header title={t("returnCancel.title")} subtitle={t("returnCancel.subtitle")} />
        <Card className="mt-4">
          <Text className="text-body text-muted-foreground text-center py-6">
            {t("errors.forbidden")}
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      padded={false}
      refreshControl={{
        refreshing: query.isFetching && !query.isFetchingNextPage,
        onRefresh,
      }}
    >
      <View className="px-4 pt-2">
        <Header
          title={t("returnCancel.title")}
          subtitle={t("returnCancel.subtitle")}
          right={
            canManage ? (
              <Pressable
                onPress={onAdd}
                accessibilityRole="button"
                accessibilityLabel={t("returnCancel.createButton")}
                className="h-10 w-10 items-center justify-center rounded-full bg-primary active:opacity-80"
              >
                <Plus size={20} color="#FFFFFF" />
              </Pressable>
            ) : undefined
          }
        />
      </View>

      <ReturnCancelFilterBar
        filters={filters}
        onChange={setFilters}
        warehouses={warehouses}
        suppliers={suppliers}
        reasonCodes={reasonCodes}
      />

      <View className="px-4 pb-2 flex-row gap-3">
        <Card className="flex-1 bg-blue-50/80 dark:bg-blue-950/20">
          <Text className="text-caption text-muted-foreground uppercase font-semibold">
            {t("returnCancel.totalQuantity")}
          </Text>
          <Text className="text-h2 font-bold text-foreground mt-1">
            {quantity(totalQty)}
          </Text>
        </Card>
        <Card className="flex-1 bg-rose-50/80 dark:bg-rose-950/20">
          <Text className="text-caption text-muted-foreground uppercase font-semibold">
            {t("returnCancel.totalCostEstimate")}
          </Text>
          <View className="mt-1">
            <Amount value={totalAmount} className="text-h2 font-bold" />
          </View>
        </Card>
      </View>

      <View className="flex-1 min-h-0">
        {query.isLoading ? (
          <View className="flex-1 items-center justify-center py-12">
            <Loading />
            <Text className="text-caption text-muted-foreground mt-2">
              {t("returnCancel.loading")}
            </Text>
          </View>
        ) : movements.length === 0 ? (
          <View className="px-4">
            <EmptyState
              icon={RotateCcw}
              title={t("returnCancel.empty")}
              actionLabel={canManage ? t("returnCancel.createButton") : undefined}
              onAction={canManage ? onAdd : undefined}
            />
          </View>
        ) : (
          <ReturnCancelTable
            rows={movements}
            canManage={canManage}
            onSelect={setDetailTarget}
            onDelete={onDelete}
            onEndReached={loadMore}
            isFetchingNextPage={query.isFetchingNextPage}
            contentContainerStyle={{ paddingBottom: 32 }}
          />
        )}
      </View>

      {detailTarget ? (
        <ReturnCancelDetailSheet
          row={detailTarget}
          canManage={canManage}
          onClose={() => setDetailTarget(null)}
          onDelete={(row) => {
            setDetailTarget(null);
            onDelete(row);
          }}
        />
      ) : null}
    </Screen>
  );
}
