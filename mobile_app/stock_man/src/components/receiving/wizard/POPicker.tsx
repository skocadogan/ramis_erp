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
import { Input } from "@/components/ui/Input";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import type { UUID } from "@/types";

export interface POPickerProps {
  visible: boolean;
  value: UUID | null;
  onSelect: (id: UUID) => void;
  onClose: () => void;
}

export function POPicker({ visible, value, onSelect, onClose }: POPickerProps) {
  const { t } = useI18n();
  const [search, setSearch] = React.useState("");

  const [list, setList] = React.useState<
    { id: UUID; order_number: string; supplier_name?: string; status?: string }[]
  >([]);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const run = async () => {
      setPending(true);
      try {
        const { purchaseOrderService } = await import("@/services/purchaseOrderService");
        const res = await purchaseOrderService.list({
          search: search || undefined,
          page_size: 50,
        } as any);
        if (cancelled) return;
        const results = res?.results ?? [];
        const open = (results as any[]).filter((p) =>
          ["APPROVED", "ORDERED", "PARTIALLY_RECEIVED"].includes(p.status)
        );
        setList(open as any);
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
  }, [visible, search]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className="flex-1 justify-end bg-black/60"
      >
        <Pressable
          onPress={() => {}}
          className="bg-card border-t border-border rounded-t-2xl max-h-[80%]"
        >
          <View className="flex-row items-center px-4 py-3 border-b border-border">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
              <ShoppingBag size={20} color="#1E40AF" />
            </View>
            <Text className="flex-1 text-h3 text-foreground">
              {t("receiving.purchaseOrder")}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
            >
              <Text className="text-h2 text-muted-foreground">×</Text>
            </Pressable>
          </View>
          <View className="px-4 py-3 border-b border-border">
            <Input
              value={search}
              onChangeText={setSearch}
              placeholder={t("common.searchPlaceholder")}
            />
          </View>
          {pending ? (
            <View className="py-10 items-center">
              <ActivityIndicator color="#1E40AF" />
              <Text className="mt-3 text-caption text-muted-foreground">
                {t("common.loading")}
              </Text>
            </View>
          ) : list.length === 0 ? (
            <View className="py-12 px-6 items-center">
              <Text className="text-body text-foreground text-center">
                {t("common.noData")}
              </Text>
            </View>
          ) : (
            <ScrollView>
              {list.map((p) => {
                const selected = p.id === value;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      onSelect(p.id);
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
                        {p.order_number}
                      </Text>
                      {p.supplier_name ? (
                        <Text className="text-caption text-muted-foreground" numberOfLines={1}>
                          {p.supplier_name}
                        </Text>
                      ) : null}
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
