import { Text, View } from "react-native";
import { Check, FileText } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Amount } from "@/components/ui/Amount";
import { SummaryRow } from "@/components/ui/SummaryRow";

export interface Step3SummaryProps {
  notes: string;
  onNotesChange: (v: string) => void;
  invoiceNumber: string;
  onInvoiceNumberChange: (v: string) => void;
  waybillNumber: string;
  onWaybillNumberChange: (v: string) => void;
  supplierName: string | null;
  warehouseName: string | null;
  itemCount: number;
  totalAmount: number;
  isSubmitting: boolean;
  onSubmit: () => void;
  t: (key: string) => string;
}

export function Step3Summary({
  notes,
  onNotesChange,
  invoiceNumber,
  onInvoiceNumberChange,
  waybillNumber,
  onWaybillNumberChange,
  supplierName,
  warehouseName,
  itemCount,
  totalAmount,
  isSubmitting,
  onSubmit,
  t,
}: Step3SummaryProps) {
  return (
    <View className="gap-3 mt-2">
      <Card>
        <View className="flex-row items-center mb-2">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
            <FileText size={20} color="#1E40AF" />
          </View>
          <Text className="flex-1 text-h3 text-foreground">
            {t("purchase.notes")}
          </Text>
        </View>
        <View className="gap-2">
          <Input
            label={t("receiving.detail")}
            value={invoiceNumber}
            onChangeText={onInvoiceNumberChange}
            placeholder={t("receiving.detail")}
            hint={t("common.optional")}
            leftIcon={FileText}
          />
          <Input
            label={t("transfer.shippedAt")}
            value={waybillNumber}
            onChangeText={onWaybillNumberChange}
            placeholder="İrsaliye No"
            hint={t("common.optional")}
            leftIcon={FileText}
          />
          <Input
            value={notes}
            onChangeText={onNotesChange}
            placeholder={t("purchase.notes")}
            multiline
            numberOfLines={4}
            className="min-h-[100px]"
          />
        </View>
      </Card>

      <Card>
        <View className="flex-row items-center mb-3">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
            <Check size={20} color="#1E40AF" />
          </View>
          <Text className="flex-1 text-h3 text-foreground">
            {t("common.details")}
          </Text>
        </View>
        <SummaryRow label={t("receiving.supplier")} value={supplierName ?? "—"} />
        <SummaryRow label={t("purchase.warehouse")} value={warehouseName ?? "—"} />
        <SummaryRow
          label={t("receiving.items")}
          value={`${itemCount} ${t("receiving.items").toLowerCase()}`}
          isLast
        />
      </Card>

      <Card>
        <View className="flex-row items-center justify-between">
          <Text className="text-h3 text-foreground">
            {t("purchase.totalAmount")}
          </Text>
          <Amount value={totalAmount} minimumFractionDigits={2} maximumFractionDigits={2} />
        </View>
      </Card>

    </View>
  );
}
