import { Pressable, Text, View } from "react-native";
import { Calendar, Truck, Warehouse } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { DatePicker } from "@/components/ui/DatePicker";
import { Loading } from "@/components/ui/Loading";
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
  onOpenWarehousePicker?: () => void;
  orderDate: string;
  onOrderDateChange: (v: string) => void;
  expectedDate: string;
  onExpectedDateChange: (v: string) => void;
  t: (key: string) => string;
}

function parseIsoDate(value: string): Date {
  if (!value) return new Date();
  const parts = value.split("-").map(Number);
  const year = parts[0] ?? new Date().getFullYear();
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return new Date(year, month - 1, day);
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function warehouseLabel(w: WarehouseT): string {
  return w.warehouse_type_display
    ? `${w.name} · ${w.warehouse_type_display}`
    : w.name;
}

export function Step1Meta({
  supplier,
  supplierId,
  onOpenSupplierPicker,
  warehouses,
  warehouseId,
  onSelectWarehouse,
  onOpenWarehousePicker,
  orderDate,
  onOrderDateChange,
  expectedDate,
  onExpectedDateChange,
  t,
}: Step1MetaProps) {
  return (
    <View className="gap-3 mt-2">
      <Card>
        <View className="flex-row items-center mb-2">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
            <Truck size={20} color="#1E40AF" />
          </View>
          <Text className="flex-1 text-h3 text-foreground">
            {t("purchase.supplier")}
          </Text>
          <Button variant="primary" size="sm" onPress={onOpenSupplierPicker}>
            {supplierId ? t("common.edit") : t("purchase.selectSupplier")}
          </Button>
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
          <Pressable onPress={onOpenSupplierPicker}>
            <Text className="text-caption text-muted-foreground">
              {t("purchase.selectSupplier")}
            </Text>
          </Pressable>
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
          {onOpenWarehousePicker ? (
            <Button variant="outline" size="sm" onPress={onOpenWarehousePicker}>
              {t("common.selectAll")}
            </Button>
          ) : null}
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
                label={warehouseLabel(w)}
                selected={w.id === warehouseId}
                onPress={() => onSelectWarehouse(w.id)}
                variant="primary"
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
        <View className="gap-3">
          <DatePicker
            label={t("purchase.orderDate")}
            value={parseIsoDate(orderDate)}
            onChange={(d) => onOrderDateChange(toIsoDate(d))}
          />
          <DatePicker
            label={t("purchase.expectedDate")}
            value={parseIsoDate(expectedDate || orderDate)}
            onChange={(d) => onExpectedDateChange(toIsoDate(d))}
            minimumDate={parseIsoDate(orderDate)}
          />
          {!expectedDate ? (
            <Text className="text-caption text-muted-foreground">
              {t("common.optional")}
            </Text>
          ) : null}
        </View>
      </Card>
    </View>
  );
}
