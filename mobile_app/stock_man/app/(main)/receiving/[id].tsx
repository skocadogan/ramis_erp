// ============================================================
// Stock Man — Goods Receiving Detail (P3)
//
// Read-mostly view of a single GoodsReceiving. Composes:
//   - Header (back + receiving_number + status badge)
//   - Top card (supplier, warehouse, dates, totals, RBAC-aware amount)
//   - Items list (GRItemRow read-only)
//   - Notes section (if present)
//   - GRActionBar (status-driven action buttons)
//   - "Mal Kabul Etiketi Yazdır" disabled button (P5 will wire)
//
// Data: useGoodsReceiving(id). Refreshes on focus via the
// React Query cache; pull-to-refresh wired too.
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
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  PackageX,
  Printer,
  Truck,
  User,
  Warehouse,
} from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { InfoRow } from "@/components/ui/InfoRow";
import { Loading } from "@/components/ui/Loading";
import { GRStatusBadge } from "@/components/receiving/GRStatusBadge";
import { GRItemRow } from "@/components/receiving/GRItemRow";
import { DetailItemsList } from "@/components/ui/DetailItemsList";
import { GRActionBar } from "@/components/receiving/GRActionBar";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { useGoodsReceiving } from "@/hooks/useGoodsReceivings";
import { useToast } from "@/components/ui/Toast";
import type { UUID } from "@/types";

export default function GoodsReceivingDetailScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ id: string }>();
  const id = (params.id ?? "") as UUID;
  const qc = useQueryClient();

  const { date, dateTime } = useFormatters();

  const query = useGoodsReceiving(id || undefined);
  const gr = query.data;

  const onRefresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["goods-receivings", id] });
  }, [qc, id]);

  const onActionComplete = useCallback(
    (action: "complete" | "delete") => {
      if (action === "delete") {
        toast.success(t("common.success"));
        router.back();
        return;
      }
      toast.success(t("receiving.actions.complete"));
      router.navigate("/(main)/(tabs)/purchase");
    },
    [router, toast, t]
  );

  const total = gr?.total_amount ?? 0;
  const receivedDate = useMemo(
    () => (gr ? date(gr.received_date) : "—"),
    [gr, date]
  );
  const createdAt = useMemo(
    () => (gr ? dateTime(gr.created_at) : "—"),
    [gr, dateTime]
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

  if (query.isError || !gr) {
    return (
      <Screen padded>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="px-4 pt-2">
          <Header
            title={t("receiving.detail")}
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

  // ─── Render ────────────────────────────────────────────────
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <View className="px-4 pt-2">
          <Header
            title={gr.receiving_number}
            subtitle={t("receiving.detail")}
            back
            inline
            onBackPress={() => router.back()}
            right={<GRStatusBadge status={gr.status} size="md" />}
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
          {/* Top card: supplier + warehouse + totals */}
          <Card className="mb-3">
            <View className="flex-row items-start">
              <View className="h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mr-3">
                <Building2 size={20} color="#1E40AF" />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-caption text-muted-foreground">
                  {t("receiving.supplier")}
                </Text>
                <Text
                  className="text-body font-semibold text-foreground"
                  numberOfLines={1}
                >
                  {gr.supplier_name ?? "—"}
                </Text>
                {gr.warehouse_name ? (
                  <View className="flex-row items-center mt-0.5">
                    <Warehouse size={12} color="#64748B" />
                    <Text
                      className="ml-1 text-caption text-muted-foreground"
                      numberOfLines={1}
                    >
                      {gr.warehouse_name}
                    </Text>
                  </View>
                ) : null}
                {gr.purchase_order_number ? (
                  <View className="flex-row items-center mt-0.5">
                    <Truck size={12} color="#64748B" />
                    <Text
                      className="ml-1 text-caption text-muted-foreground"
                      numberOfLines={1}
                    >
                      {gr.purchase_order_number}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View className="mt-3 pt-3 border-t border-border flex-row items-center justify-between">
              <View className="flex-1 mr-2">
                <Text className="text-caption text-muted-foreground">
                  {t("purchase.totalAmount")}
                </Text>
                <Amount
                  value={total}
                  minimumFractionDigits={2}
                  maximumFractionDigits={2}
                  className="mt-0.5"
                />
              </View>
              <View>
                <Text className="text-caption text-muted-foreground text-right">
                  {t("receiving.items")}
                </Text>
                <Text className="text-h3 text-foreground font-bold text-right mt-0.5">
                  {gr.items?.length ?? 0}
                </Text>
              </View>
            </View>
          </Card>

          {/* Dates / invoice card */}
          <Card className="mb-3">
            <View className="flex-row items-center mb-2">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
                <CalendarDays size={18} color="#1E40AF" />
              </View>
              <Text className="flex-1 text-h3 text-foreground">
                {t("common.date")}
              </Text>
            </View>
            <InfoRow label={t("common.date")} value={receivedDate} />
            {gr.invoice_number ? (
              <InfoRow label={"Fatura No"} value={gr.invoice_number} icon={FileText} />
            ) : null}
            {gr.waybill_number ? (
              <InfoRow label={"İrsaliye No"} value={gr.waybill_number} icon={FileText} />
            ) : null}
            {gr.received_by_name ? (
              <InfoRow
                label={t("auth.username")}
                value={gr.received_by_name}
                icon={User}
              />
            ) : null}
            <InfoRow label={t("common.date")} value={createdAt} isLast />
          </Card>

          {/* Items */}
          <Card className="mb-3">
            <View className="flex-row items-center mb-3">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
                <ClipboardList size={18} color="#1E40AF" />
              </View>
              <Text className="flex-1 text-h3 text-foreground">
                {t("receiving.items")}
              </Text>
            </View>
            {(gr.items ?? []).length === 0 ? (
              <Text className="text-caption text-muted-foreground text-center py-3">
                {t("purchase.noItems")}
              </Text>
            ) : (
              <DetailItemsList
                data={gr.items ?? []}
                keyExtractor={(it) => it.id ?? it.stock_item}
                itemHeight={104}
                renderItem={({ item: it }) => (
                  <GRItemRow
                    item={{
                      id: it.id,
                      stock_item: it.stock_item,
                      stock_item_name: it.stock_item_name,
                      expected_quantity: it.expected_quantity,
                      received_quantity: it.received_quantity,
                      rejected_quantity: it.rejected_quantity ?? 0,
                      unit: it.unit,
                      unit_price: it.unit_price,
                      line_total: it.line_total,
                      batch_number: it.batch_number,
                      expiry_date: it.expiry_date,
                      notes: it.notes,
                    }}
                  />
                )}
              />
            )}
          </Card>

          {/* Notes */}
          {gr.notes ? (
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
                {gr.notes}
              </Text>
            </Card>
          ) : null}

          {/* Actions */}
          <View className="mt-2">
            <GRActionBar gr={gr} onActionComplete={onActionComplete} />
          </View>

          {/* Print label — P5 wires the printing service; for
              P3 the button is visible but disabled with a
              "Yakında" toast. */}
          <View className="mt-3">
            <Button
              variant="outline"
              onPress={() =>
                toast.info(
                  t("common.comingSoon"),
                  t("common.comingSoonDesc")
                )
              }
              leftIcon={Printer}
              fullWidth
              disabled
            >
              {`${t("receiving.title")} — ${t("printing.printLabel")}`}
            </Button>
          </View>


        </ScrollView>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}


