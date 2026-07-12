import { Text, View } from "react-native";
import { cn } from "@/utils/cn";

interface SummaryRowProps {
  label: string;
  value: string;
  isLast?: boolean;
}

export function SummaryRow({ label, value, isLast }: SummaryRowProps) {
  return (
    <View
      className={cn(
        "flex-row items-center justify-between py-2",
        !isLast && "border-b border-border"
      )}
    >
      <Text className="text-caption text-muted-foreground">{label}</Text>
      <Text className="text-body font-semibold text-foreground" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
