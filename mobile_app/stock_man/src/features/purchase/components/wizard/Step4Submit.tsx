import { Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { Amount } from "@/components/ui/Amount";
import { SummaryRow } from "@/components/ui/SummaryRow";
import { cn } from "@/utils/cn";

export interface Step4SubmitProps {
  supplierName: string | null;
  warehouseName: string | null;
  itemCount: number;
  totalAmount: number;
  notes: string;
  orderDate: string;
  expectedDate: string;
  isSubmitting: boolean;
  onSubmit: () => void;
  t: (key: string) => string;
}

export function Step4Submit({
  supplierName,
  warehouseName,
  itemCount,
  totalAmount,
  notes,
  orderDate,
  expectedDate,
  isSubmitting,
  onSubmit,
  t,
}: Step4SubmitProps) {
  return (
    <View className="gap-3 mt-2">
      <Card>
        <View className="flex-row items-center mb-3">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-success/15 mr-3">
            <Check size={20} color="#059669" />
          </View>
          <Text className="flex-1 text-h3 text-foreground">
            {t("common.details")}
          </Text>
        </View>
        <SummaryRow label={t("purchase.supplier")} value={supplierName ?? "—"} />
        <SummaryRow label={t("purchase.warehouse")} value={warehouseName ?? "—"} />
        <SummaryRow label={t("purchase.orderDate")} value={orderDate} />
        {expectedDate ? (
          <SummaryRow label={t("purchase.expectedDate")} value={expectedDate} />
        ) : null}
        <SummaryRow
          label={t("purchase.items")}
          value={`${itemCount} ${t("purchase.items").toLowerCase()}`}
        />
        {notes ? (
          <SummaryRow label={t("purchase.notes")} value={notes} />
        ) : null}
        <View
          className={cn(
            "flex-row items-center justify-between py-2 border-t border-border"
          )}
        >
          <Text className="text-h3 text-foreground">
            {t("purchase.totalAmount")}
          </Text>
          <Amount value={totalAmount} minimumFractionDigits={2} maximumFractionDigits={2} />
        </View>
      </Card>

    </View>
  );
}
