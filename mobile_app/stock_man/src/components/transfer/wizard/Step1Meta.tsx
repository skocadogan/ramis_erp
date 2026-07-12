import { Pressable, Text, View } from "react-native";
import { Calendar, Warehouse as WarehouseIcon } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Chip } from "@/components/ui/Chip";
import { Loading } from "@/components/ui/Loading";
import { cn } from "@/utils/cn";
import type { UUID, Warehouse } from "@/types";

type WarehouseT = Warehouse;

export interface Step1MetaProps {
  warehouses: WarehouseT[];
  sourceWarehouse: WarehouseT | null;
  targetWarehouse: WarehouseT | null;
  onOpenSourcePicker: () => void;
  onOpenTargetPicker: () => void;
  onSelectSourceWarehouse: (id: UUID) => void;
  transferDate: string;
  onTransferDateChange: (v: string) => void;
  t: (key: string) => string;
}

export function Step1Meta({
  warehouses,
  sourceWarehouse,
  targetWarehouse,
  onOpenSourcePicker,
  onOpenTargetPicker,
  onSelectSourceWarehouse,
  transferDate,
  onTransferDateChange,
  t,
}: Step1MetaProps) {
  return (
    <View className="gap-3 mt-2">
      <Card>
        <View className="flex-row items-center mb-2">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
            <WarehouseIcon size={20} color="#1E40AF" />
          </View>
          <Text className="flex-1 text-h3 text-foreground">
            {t("transfer.sourceWarehouse")}
          </Text>
          <Pressable
            onPress={onOpenSourcePicker}
            accessibilityRole="button"
            className="px-3 py-2 rounded-lg bg-primary active:bg-primary/90"
          >
            <Text className="text-caption font-semibold text-primary-foreground">
              {sourceWarehouse ? t("common.edit") : t("common.selectAll")}
            </Text>
          </Pressable>
        </View>
        {sourceWarehouse ? (
          <View>
            <Text className="text-body font-semibold text-foreground">
              {sourceWarehouse.name}
            </Text>
            {sourceWarehouse.code ? (
              <Text className="text-caption text-mono text-muted-foreground mt-0.5">
                {sourceWarehouse.code}
              </Text>
            ) : null}
          </View>
        ) : (
          <View>
            {warehouses.length === 0 ? (
              <Loading label={t("common.loading")} />
            ) : (
              <View className="flex-row flex-wrap gap-2 mt-1">
                {warehouses.map((w) => {
                  const isSelected =
                    !!sourceWarehouse && w.id === (sourceWarehouse as WarehouseT).id;
                  return (
                    <Chip
                      key={w.id}
                      label={w.name}
                      selected={isSelected}
                      onPress={() => onSelectSourceWarehouse(w.id)}
                      variant={isSelected ? "primary" : "default"}
                      leftIcon={WarehouseIcon}
                      size="sm"
                    />
                  );
                })}
              </View>
            )}
          </View>
        )}
      </Card>

      <Card>
        <View className="flex-row items-center mb-2">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
            <WarehouseIcon size={20} color="#1E40AF" />
          </View>
          <Text className="flex-1 text-h3 text-foreground">
            {t("transfer.targetWarehouse")}
          </Text>
          <Pressable
            onPress={onOpenTargetPicker}
            accessibilityRole="button"
            className="px-3 py-2 rounded-lg bg-primary active:bg-primary/90"
            disabled={!sourceWarehouse}
          >
            <Text
              className={cn(
                "text-caption font-semibold text-primary-foreground",
                !sourceWarehouse && "opacity-50"
              )}
            >
              {targetWarehouse ? t("common.edit") : t("common.selectAll")}
            </Text>
          </Pressable>
        </View>
        {targetWarehouse ? (
          <View>
            <Text className="text-body font-semibold text-foreground">
              {targetWarehouse.name}
            </Text>
            {targetWarehouse.code ? (
              <Text className="text-caption text-mono text-muted-foreground mt-0.5">
                {targetWarehouse.code}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text className="text-caption text-muted-foreground">
            {t("purchase.selectWarehouse")}
          </Text>
        )}
      </Card>

      <Card>
        <View className="flex-row items-center mb-2">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
            <Calendar size={20} color="#1E40AF" />
          </View>
          <Text className="flex-1 text-h3 text-foreground">
            {t("common.date")}
          </Text>
        </View>
        <Input
          label={t("transfer.shippedAt")}
          value={transferDate}
          onChangeText={onTransferDateChange}
          placeholder="YYYY-AA-GG"
          hint={t("common.required")}
          required
          leftIcon={Calendar}
        />
      </Card>
    </View>
  );
}
