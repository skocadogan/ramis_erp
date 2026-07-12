import { View, Text } from "react-native";
import type { UseI18n } from "../../i18n";

interface Props {
  t: UseI18n["t"];
  branchLabel: string;
  tables: number;
  ready: number;
  delivered: number;
}

export function DashboardStatsCard({ t, branchLabel, tables, ready, delivered }: Props) {
  return (
    <View className="bg-card border border-border rounded-2xl shadow-sm p-5 mb-6">
      <View className="flex-row justify-between items-center mb-4">
        <View className="flex-1 mr-2">
          <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-0.5">
            {t("dashboard.activeBranch")}
          </Text>
          <Text className="text-foreground text-lg font-bold" numberOfLines={2}>
            {branchLabel}
          </Text>
        </View>
        <View className="bg-primary/10 px-3 py-1 rounded-full">
          <Text className="text-primary text-[10px] font-bold">{t("dashboard.shiftOpen")}</Text>
        </View>
      </View>

      <View className="flex-row justify-between items-center px-2">
        <View className="items-center">
          <Text className="text-foreground text-2xl font-black">{tables}</Text>
          <Text className="text-muted-foreground text-[10px] font-bold uppercase">
            {t("dashboard.tables")}
          </Text>
        </View>
        <View className="w-px h-6 bg-border" />
        <View className="items-center">
          <Text className="text-foreground text-2xl font-black">{ready}</Text>
          <Text className="text-muted-foreground text-[10px] font-bold uppercase">
            {t("dashboard.ready")}
          </Text>
        </View>
        <View className="w-px h-6 bg-border" />
        <View className="items-center">
          <Text className="text-foreground text-2xl font-black">{delivered}</Text>
          <Text className="text-muted-foreground text-[10px] font-bold uppercase">
            {t("dashboard.delivered")}
          </Text>
        </View>
      </View>
    </View>
  );
}
