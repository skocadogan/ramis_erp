import { Switch, Text, View } from "react-native";
import { Check, FileText } from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SummaryRow } from "@/components/ui/SummaryRow";

export interface Step3SummaryProps {
  notes: string;
  onNotesChange: (v: string) => void;
  acceptPartial: boolean;
  onAcceptPartialChange: (v: boolean) => void;
  sourceName: string | null;
  targetName: string | null;
  itemCount: number;
  isSubmitting: boolean;
  onSubmit: () => void;
  t: (key: string) => string;
}

export function Step3Summary({
  notes,
  onNotesChange,
  acceptPartial,
  onAcceptPartialChange,
  sourceName,
  targetName,
  itemCount,
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
        <Input
          value={notes}
          onChangeText={onNotesChange}
          placeholder={t("purchase.notes")}
          multiline
          numberOfLines={4}
          className="min-h-[100px]"
        />
        <View className="mt-3 flex-row items-center justify-between pt-3 border-t border-border">
          <View className="flex-1 pr-3">
            <Text className="text-body font-semibold text-foreground">
              {t("common.optional")}
            </Text>
            <Text className="text-caption text-muted-foreground mt-0.5">
              {t("common.save")}
            </Text>
          </View>
          <Switch
            value={acceptPartial}
            onValueChange={onAcceptPartialChange}
            accessibilityLabel={t("common.save")}
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
        <SummaryRow label={t("transfer.sourceWarehouse")} value={sourceName ?? "—"} />
        <SummaryRow label={t("transfer.targetWarehouse")} value={targetName ?? "—"} />
        <SummaryRow
          label={t("transfer.items")}
          value={`${itemCount} ${t("transfer.items").toLowerCase()}`}
          isLast
        />
      </Card>

    </View>
  );
}
