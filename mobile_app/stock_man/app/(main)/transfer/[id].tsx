// ============================================================
// Stock Man — Transfer Detail (P3)
//
// Split layout:
//   - Top: status timeline
//   - Left: transfer info, dates, status, print + actions
//   - Right: transfer items table
// ============================================================

import React, { useCallback, useMemo } from "react";
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
  ArrowLeftRight,
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  FileText,
  PackageX,
  Printer,
} from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { HorizontalStatusTimeline } from "@/components/ui/HorizontalStatusTimeline";
import { InfoRow } from "@/components/ui/InfoRow";
import { Loading } from "@/components/ui/Loading";
import { TransferItemsTable } from "@/components/transfer/TransferItemsTable";
import { TransferActionBar } from "@/components/transfer/TransferActionBar";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { useResponsive } from "@/hooks/useResponsive";
import { useTransfer } from "@/hooks/useTransfers";
import { useToast } from "@/components/ui/Toast";

import type { TransferStatus, UUID } from "@/types";

const STATUS_FLOW: TransferStatus[] = [
  "DRAFT",
  "PENDING",
  "IN_TRANSIT",
  "COMPLETED",
];

function stepIndex(status: TransferStatus): number {
  if (status === "CANCELLED") return -1;
  return STATUS_FLOW.indexOf(status);
}

export default function TransferDetailScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { isTablet, width: screenWidth } = useResponsive();

  const panelWidths = useMemo(() => {
    const pagePad = 32;
    const gap = 8;
    const contentWidth = screenWidth - pagePad;
    return {
      left: Math.floor(contentWidth * 0.4 - gap / 2),
      right: Math.floor(contentWidth * 0.6 - gap / 2),
    };
  }, [screenWidth]);
  const params = useLocalSearchParams<{ id: string }>();
  const id = (params.id ?? "") as UUID;
  const qc = useQueryClient();

  const { date, dateTime } = useFormatters();

  const query = useTransfer(id || undefined);
  const tr = query.data;

  const onRefresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["transfers", id] });
  }, [qc, id]);

  const onActionComplete = useCallback(
    (action: "submit" | "approve" | "complete" | "cancel" | "delete") => {
      if (action === "delete") {
        toast.success(t("common.success"));
        router.back();
        return;
      }
      const labelMap: Record<string, string> = {
        submit: t("transfer.actions.approve"),
        approve: t("transfer.actions.approve"),
        complete: t("transfer.actions.complete"),
        cancel: t("transfer.actions.cancel"),
      };
      toast.success(labelMap[action] ?? t("common.success"));
    },
    [router, toast, t]
  );

  const currentStep = tr ? stepIndex(tr.status) : -1;
  const transferDate = useMemo(
    () => (tr ? date(tr.transfer_date) : "—"),
    [tr, date]
  );
  const completedDate = useMemo(
    () => (tr?.completed_date ? dateTime(tr.completed_date) : null),
    [tr, dateTime]
  );
  const createdAt = useMemo(
    () => (tr ? dateTime(tr.created_at) : "—"),
    [tr, dateTime]
  );

  if (query.isPending) {
    return (
      <Screen padded>
        <Stack.Screen options={{ headerShown: false }} />
        <Loading fullScreen label={t("common.loading")} />
      </Screen>
    );
  }

  if (query.isError || !tr) {
    return (
      <Screen padded>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="px-4 pt-2">
          <Header
            title={t("transfer.detail")}
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
    <Card className="mb-3">
      {tr.status !== "CANCELLED" ? (
        <>
          <Text className="text-caption text-muted-foreground mb-3">
            {t("common.status")}
          </Text>
          <HorizontalStatusTimeline
            flow={STATUS_FLOW}
            current={currentStep}
            getLabel={(status) => t(`transfer.statusLabels.${TRANSFER_STATUS_LABEL_MAP[status]}` as any)}
          />
        </>
      ) : (
        <View className="border-l-4 border-l-destructive pl-3">
          <Text className="text-body font-semibold text-destructive">
            {t("transfer.statusLabels.cancelled")}
          </Text>
        </View>
      )}
    </Card>
  );

  const transferInfoSection = (
    <Card className="mb-3">
      <View className="flex-row items-center mb-3">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
          <ArrowLeftRight size={20} color="#1E40AF" />
        </View>
        <Text className="flex-1 text-h3 text-foreground">
          {t("transfer.detail")}
        </Text>
      </View>

      <View className="flex-row items-center bg-muted/40 rounded-lg px-3 py-3">
        <View className="flex-1">
          <Text className="text-caption text-muted-foreground">
            {t("transfer.sourceWarehouse")}
          </Text>
          <Text className="text-body font-semibold text-foreground" numberOfLines={2}>
            {tr.source_warehouse_name ?? "—"}
          </Text>
        </View>
        <ArrowRight size={18} color="#1E40AF" />
        <View className="flex-1 ml-3">
          <Text className="text-caption text-muted-foreground text-right">
            {t("transfer.targetWarehouse")}
          </Text>
          <Text
            className="text-body font-semibold text-foreground text-right"
            numberOfLines={2}
          >
            {tr.target_warehouse_name ?? "—"}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <View className="flex-1 mr-2">
          <Text className="text-caption text-muted-foreground">
            {t("transfer.items")}
          </Text>
          <Text className="text-h3 text-foreground font-bold mt-0.5">
            {tr.items?.length ?? 0}
          </Text>
        </View>
        {tr.requested_by_name ? (
          <View className="flex-1">
            <Text className="text-caption text-muted-foreground text-right">
              {t("transfer.requestedBy")}
            </Text>
            <Text className="text-body text-foreground mt-0.5 text-right" numberOfLines={1}>
              {tr.requested_by_name}
            </Text>
          </View>
        ) : null}
      </View>

      {tr.deficiency_report ? (
        <View className="mt-3 pt-3 border-t border-border">
          <Text className="text-caption text-muted-foreground">
            {t("deficiency.title")}
          </Text>
          <Text className="text-body font-mono text-foreground mt-0.5">
            {tr.deficiency_report.slice(0, 8)}
          </Text>
        </View>
      ) : null}
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
      <InfoRow label={t("transfer.shippedAt")} value={transferDate} />
      {completedDate ? (
        <InfoRow
          label={t("transfer.statusLabels.completed")}
          value={completedDate}
        />
      ) : null}
      {tr.approved_by_name ? (
        <InfoRow
          label={t("transfer.actions.approve")}
          value={tr.approved_by_name}
          icon={Check}
        />
      ) : null}
      <InfoRow label={t("common.createdAt")} value={createdAt} isLast />
    </Card>
  );

  const printSection = (
    <View className="mb-3">
      <Button
        variant="outline"
        onPress={() =>
          toast.info(t("common.comingSoon"), t("common.comingSoonDesc"))
        }
        leftIcon={Printer}
        fullWidth
        disabled
      >
        {t("printing.printReceipt")}
      </Button>
    </View>
  );

  const notesSection = tr.notes ? (
    <Card className="mb-3">
      <View className="flex-row items-center mb-2">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
          <FileText size={18} color="#1E40AF" />
        </View>
        <Text className="flex-1 text-h3 text-foreground">{t("purchase.notes")}</Text>
      </View>
      <Text className="text-body text-foreground leading-5">{tr.notes}</Text>
    </Card>
  ) : null;

  const actionsSection = (
    <TransferActionBar t={tr} onActionComplete={onActionComplete} />
  );

  const leftColumnContent = (
    <>
      {transferInfoSection}
      {datesSection}
      {printSection}
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
          {t("transfer.items")}
        </Text>
        <Text className="text-caption text-muted-foreground ml-2">
          {tr.items?.length ?? 0}
        </Text>
      </View>
      <TransferItemsTable items={tr.items ?? []} />
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
            title={tr.transfer_number}
            subtitle={t("transfer.detail")}
            back
            inline
            onBackPress={() => router.back()}
          />
        </View>

        {isTablet ? (
          <View className="flex-1 px-4 pb-4">
            <View className="pt-4">{statusSection}</View>
            <View className="flex-1 flex-row pt-3" style={{ gap: 8 }}>
              <ScrollView
                style={{ width: panelWidths.left, flex: 1 }}
                className="shrink-0"
                contentContainerStyle={{ paddingBottom: 24 }}
                refreshControl={refreshControl}
                showsVerticalScrollIndicator
                nestedScrollEnabled
              >
                {leftColumnContent}
              </ScrollView>
              <ScrollView
                style={{ width: panelWidths.right, flex: 1 }}
                className="shrink-0"
                contentContainerStyle={{ paddingBottom: 24 }}
                showsVerticalScrollIndicator
                nestedScrollEnabled
              >
                {itemsSection}
              </ScrollView>
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
      </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}



const TRANSFER_STATUS_LABEL_MAP: Record<string, string> = {
  DRAFT: "draft",
  PENDING: "pending",
  IN_TRANSIT: "inTransit",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};
