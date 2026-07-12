// ============================================================
// Stock Man — PO Delivery (Tesellüm) Details Sheet
//
// Web Mal Kabul detay modalı ile aynı içerik: siparişe bağlı
// tesellüm kayıtları ve kalem dökümü.
// ============================================================

import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from "react-native";
import { X } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { Loading } from "@/components/ui/Loading";
import { Amount } from "@/components/ui/Amount";
import { GRStatusBadge } from "@/components/receiving/GRStatusBadge";
import { ReceivingItemsTable } from "@/components/receiving/ReceivingItemsTable";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { useGoodsReceivingsByPurchaseOrder } from "@/hooks/useGoodsReceivings";
import type { GoodsReceiving, UUID } from "@/types";

export interface PODeliveryDetailsSheetProps {
  purchaseOrderId: UUID;
  orderNumber: string;
  onClose: () => void;
}

function GoodsReceivingBlock({ gr }: { gr: GoodsReceiving }) {
  const { t } = useI18n();
  const { date } = useFormatters();

  return (
    <View className="mb-4 rounded-xl border border-border bg-card overflow-hidden">
      <View className="px-3 py-3 border-b border-border bg-muted/30">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="text-body font-semibold text-foreground flex-1" numberOfLines={1}>
            {gr.receiving_number}
          </Text>
          <GRStatusBadge status={gr.status} size="sm" />
        </View>
        <Text className="text-caption text-muted-foreground mt-1">
          {date(gr.received_date)}
        </Text>
      </View>

      <View className="px-3 py-2 gap-1">
        {gr.invoice_number ? (
          <MetaLine label={t("receiving.invoiceLabel")} value={gr.invoice_number} />
        ) : null}
        {gr.waybill_number ? (
          <MetaLine label={t("receiving.waybillLabel")} value={gr.waybill_number} />
        ) : null}
        {gr.received_by_name ? (
          <MetaLine label={t("receiving.receivedByLabel")} value={gr.received_by_name} />
        ) : null}
        {gr.inspected_by_name ? (
          <MetaLine label={t("receiving.inspectedByLabel")} value={gr.inspected_by_name} />
        ) : null}
      </View>

      <View className="px-2 py-2 border-t border-border">
        <ReceivingItemsTable items={gr.items ?? []} />
      </View>

      {(gr.total_amount ?? 0) > 0 ? (
        <View className="px-3 py-2 border-t border-border flex-row items-center justify-between">
          <Text className="text-caption text-muted-foreground">{t("common.total")}</Text>
          <Amount value={gr.total_amount ?? 0} className="text-body font-semibold" />
        </View>
      ) : null}
    </View>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row">
      <Text className="text-caption text-muted-foreground w-28">{label}</Text>
      <Text className="text-caption text-foreground flex-1">{value}</Text>
    </View>
  );
}

export function PODeliveryDetailsSheet({
  purchaseOrderId,
  orderNumber,
  onClose,
}: PODeliveryDetailsSheetProps) {
  const { t } = useI18n();
  const query = useGoodsReceivingsByPurchaseOrder(purchaseOrderId);
  const receivings = query.data ?? [];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={styles.backdrop}
        className="justify-end bg-black/60"
        accessibilityLabel="po-delivery-details-dismiss"
      >
        <Pressable onPress={() => {}} className="bg-card border-t border-border rounded-t-2xl max-h-[88%]">
          <View className="flex-row items-center px-4 py-3 border-b border-border">
            <View className="flex-1 min-w-0 pr-2">
              <Text className="text-h3 text-foreground" numberOfLines={1}>
                {t("purchase.deliveryDetailsTitle")}
              </Text>
              <Text className="text-caption text-muted-foreground mt-0.5" numberOfLines={1}>
                {orderNumber}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
              hitSlop={8}
            >
              <X size={20} color="#64748B" />
            </Pressable>
          </View>

          <ScrollView className="px-4 py-3" keyboardShouldPersistTaps="handled">
            {query.isLoading ? (
              <View className="py-10 items-center">
                <Loading />
                <Text className="text-caption text-muted-foreground mt-2">
                  {t("common.loading")}
                </Text>
              </View>
            ) : query.isError ? (
              <Text className="text-body text-destructive text-center py-8">
                {t("errors.unknown")}
              </Text>
            ) : receivings.length === 0 ? (
              <Text className="text-body text-muted-foreground text-center py-8">
                {t("purchase.deliveryDetailsEmpty")}
              </Text>
            ) : (
              receivings.map((gr) => <GoodsReceivingBlock key={gr.id} gr={gr} />)
            )}
            <View className="h-2" />
          </ScrollView>

          <View className="px-4 py-3 border-t border-border">
            <Button variant="secondary" onPress={onClose} fullWidth>
              {t("common.close")}
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}


const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
});
