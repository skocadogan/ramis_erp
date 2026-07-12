import { Pressable, Text, View } from "react-native";
import { Package, Plus } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TransferItemRow } from "@/components/transfer/TransferItemRow";
import { DetailItemsList } from "@/components/ui/DetailItemsList";
import type { UUID } from "@/types";
import type { DraftItem } from "./types";

export interface Step2ItemsProps {
  items: DraftItem[];
  onOpenItemPicker: () => void;
  onUpdate: (id: UUID, patch: Partial<DraftItem>) => void;
  onRemove: (id: UUID) => void;
  t: (key: string) => string;
}

export function Step2Items({
  items,
  onOpenItemPicker,
  onUpdate,
  onRemove,
  t,
}: Step2ItemsProps) {
  return (
    <View className="gap-3 mt-2">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
            <Package size={20} color="#1E40AF" />
          </View>
          <Text className="text-h3 text-foreground">{t("transfer.items")}</Text>
        </View>
        <Pressable
          onPress={onOpenItemPicker}
          accessibilityRole="button"
          accessibilityLabel={t("purchase.addItem")}
          className="px-3 py-2 rounded-lg bg-primary active:bg-primary/90 flex-row items-center"
        >
          <Plus size={16} color="#FFFFFF" />
          <Text className="ml-1 text-caption font-semibold text-primary-foreground">
            {t("purchase.addItem")}
          </Text>
        </Pressable>
      </View>

      {items.length === 0 ? (
        <Card>
          <View className="py-6 items-center">
            <Package size={28} color="#94A3B8" />
            <Text className="text-body text-muted-foreground mt-2 text-center">
              {t("purchase.noItems")}
            </Text>
            <Button
              variant="outline"
              onPress={onOpenItemPicker}
              leftIcon={Plus}
              className="mt-3"
            >
              {t("purchase.addItem")}
            </Button>
          </View>
        </Card>
      ) : (
        <DetailItemsList
          data={items}
          keyExtractor={(it) => it.stock_item_id}
          itemHeight={88}
          renderItem={({ item: it }) => (
            <TransferItemRow
              item={{
                id: it.stock_item_id,
                stock_item: it.stock_item_id,
                stock_item_name: it.stock_item_name,
                stock_item_sku: it.stock_item_sku,
                quantity: it.quantity,
                unit: it.unit,
              }}
              editable
              onQtyChange={(q) => onUpdate(it.stock_item_id, { quantity: q })}
              onRemove={() => onRemove(it.stock_item_id)}
            />
          )}
        />
      )}
    </View>
  );
}
