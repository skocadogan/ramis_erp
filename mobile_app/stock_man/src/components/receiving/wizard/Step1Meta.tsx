import { Pressable, Text, View } from "react-native";
import { Calendar, Plus, ShoppingBag, Truck, Warehouse } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { DatePicker } from "@/components/ui/DatePicker";
import { Loading } from "@/components/ui/Loading";
import { parseIsoDate, toIsoDate } from "@/lib/format/date";
import type { UUID, Warehouse as WarehouseT } from "@/types";

export interface Step1MetaProps {
  supplier: {
    id: UUID;
    name: string;
    contact_person?: string;
    phone?: string;
  } | null;
  supplierId: UUID | null;
  onOpenSupplierPicker: () => void;
  warehouses: WarehouseT[];
  warehouseId: UUID | null;
  onSelectWarehouse: (id: UUID | null) => void;
  purchaseOrderId: UUID | null;
  poNumber: string | null;
  onOpenPoPicker: () => void;
  onClearPo: () => void;
  receivedDate: string;
  onReceivedDateChange: (v: string) => void;
  t: (key: string) => string;
}

export function Step1Meta({
  supplier,
  supplierId,
  onOpenSupplierPicker,
  warehouses,
  warehouseId,
  onSelectWarehouse,
  purchaseOrderId,
  poNumber,
  onOpenPoPicker,
  onClearPo,
  receivedDate,
  onReceivedDateChange,
  t,
}: Step1MetaProps) {
  return (
    <View className="gap-3 mt-2">
      <Card>
        <View className="flex-row items-center mb-2">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
            <ShoppingBag size={20} color="#1E40AF" />
          </View>
          <Text className="flex-1 text-h3 text-foreground">
            {t("receiving.purchaseOrder")}
          </Text>
        </View>
        {purchaseOrderId ? (
          <View>
            <Text className="text-body font-mono font-semibold text-foreground">
              {poNumber ?? "—"}
            </Text>
            <View className="mt-2 flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onPress={onOpenPoPicker}
                fullWidth
              >
                {t("common.edit")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onPress={onClearPo}
                fullWidth
              >
                {t("common.clear")}
              </Button>
            </View>
          </View>
        ) : (
          <Button
            variant="outline"
            onPress={onOpenPoPicker}
            leftIcon={Plus}
            fullWidth
          >
            {t("receiving.purchaseOrder")}
          </Button>
        )}
      </Card>

      <Card>
        <View className="flex-row items-center mb-2">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
            <Truck size={20} color="#1E40AF" />
          </View>
          <Text className="flex-1 text-h3 text-foreground">
            {t("receiving.supplier")}
          </Text>
          <Pressable
            onPress={onOpenSupplierPicker}
            accessibilityRole="button"
            className="px-3 py-2 rounded-lg bg-primary active:bg-primary/90"
          >
            <Text className="text-caption font-semibold text-primary-foreground">
              {supplierId ? t("common.edit") : t("common.selectAll")}
            </Text>
          </Pressable>
        </View>
        {supplier ? (
          <View>
            <Text className="text-body font-semibold text-foreground">
              {supplier.name}
            </Text>
            {supplier.contact_person ? (
              <Text className="text-caption text-muted-foreground mt-0.5">
                {supplier.contact_person}
              </Text>
            ) : null}
            {supplier.phone ? (
              <Text className="text-caption text-muted-foreground">
                {supplier.phone}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text className="text-caption text-muted-foreground">
            {t("purchase.selectSupplier")}
          </Text>
        )}
      </Card>

      <Card>
        <View className="flex-row items-center mb-2">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
            <Warehouse size={20} color="#1E40AF" />
          </View>
          <Text className="flex-1 text-h3 text-foreground">
            {t("purchase.warehouse")}
          </Text>
        </View>
        {warehouses.length === 0 ? (
          <View className="py-3">
            <Loading label={t("common.loading")} />
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {warehouses.map((w) => (
              <Chip
                key={w.id}
                label={w.name}
                selected={w.id === warehouseId}
                onPress={() => onSelectWarehouse(w.id)}
                variant={w.id === warehouseId ? "primary" : "default"}
                leftIcon={Warehouse}
                size="sm"
              />
            ))}
          </View>
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
        <DatePicker
          label={t("common.date")}
          value={parseIsoDate(receivedDate)}
          onChange={(d) => onReceivedDateChange(toIsoDate(d))}
          maximumDate={new Date()}
        />
      </Card>
    </View>
  );
}
