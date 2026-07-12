import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { ClipboardList, ShoppingBag } from "lucide-react-native";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import {
  filterReturnCancelPurchaseOrders,
  formatReturnCancelPoOption,
} from "@/utils/returnCancelPurchaseOrder";
import type { PurchaseOrder, UUID } from "@/types";

export interface ReturnCancelPurchaseOrderPickerProps {
  visible: boolean;
  value: UUID | null;
  warehouseId?: UUID;
  stockItemId?: UUID;
  onSelect: (order: PurchaseOrder) => void;
  onClose: () => void;
}

export function ReturnCancelPurchaseOrderPicker({
  visible,
  value,
  warehouseId,
  stockItemId,
  onSelect,
  onClose,
}: ReturnCancelPurchaseOrderPickerProps) {
  const { t, language } = useI18n();
  const [list, setList] = React.useState<PurchaseOrder[]>([]);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!visible || !warehouseId || !stockItemId) return;
    let cancelled = false;
    const run = async () => {
      setPending(true);
      try {
        const { purchaseOrderService } = await import("@/services/purchaseOrderService");
        const res = await purchaseOrderService.list({
          warehouse_id: warehouseId,
          stock_item_id: stockItemId,
          page_size: 100,
        });
        if (cancelled) return;
        const results = (res?.results ?? []) as PurchaseOrder[];
        setList(filterReturnCancelPurchaseOrders(results, stockItemId));
      } catch {
        if (!cancelled) setList([]);
      } finally {
        if (!cancelled) setPending(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [visible, warehouseId, stockItemId]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 justify-end bg-black/60">
        <Pressable onPress={() => {}} className="bg-card border-t border-border rounded-t-2xl max-h-[80%]">
          <View className="flex-row items-center px-4 py-3 border-b border-border">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
              <ShoppingBag size={20} color="#1E40AF" />
            </View>
            <Text className="flex-1 text-h3 text-foreground">{t("returnCancel.formPurchaseOrder")}</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
            >
              <Text className="text-h2 text-muted-foreground">×</Text>
            </Pressable>
          </View>

          {pending ? (
            <View className="py-10 items-center">
              <ActivityIndicator color="#1E40AF" />
              <Text className="mt-3 text-caption text-muted-foreground">{t("returnCancel.formPurchaseOrderLoading")}</Text>
            </View>
          ) : list.length === 0 ? (
            <View className="py-12 px-6 items-center">
              <Text className="text-body text-foreground text-center">
                {t("returnCancel.formPurchaseOrderEmpty")}
              </Text>
            </View>
          ) : (
            <ScrollView>
              {list.map((po) => {
                const selected = po.id === value;
                return (
                  <Pressable
                    key={po.id}
                    onPress={() => {
                      onSelect(po);
                      onClose();
                    }}
                    className={cn(
                      "flex-row items-center px-4 py-3 border-b border-border active:opacity-80",
                      selected && "bg-primary/10"
                    )}
                  >
                    <View className="h-9 w-9 items-center justify-center rounded-full bg-muted mr-3">
                      <ClipboardList size={18} color="#64748B" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-body font-semibold text-foreground" numberOfLines={1}>
                        {po.order_number}
                      </Text>
                      <Text className="text-caption text-muted-foreground" numberOfLines={2}>
                        {stockItemId
                          ? formatReturnCancelPoOption(po, stockItemId, language)
                              .split(" · ")
                              .slice(1)
                              .join(" · ")
                          : ""}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
