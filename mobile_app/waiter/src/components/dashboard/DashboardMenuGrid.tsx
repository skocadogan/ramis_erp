import { View, Text, Pressable } from "react-native";
import { Table as TableIcon, ClipboardList, QrCode, TrendingUp } from "lucide-react-native";
import type { UseI18n } from "../../i18n";

interface Props {
  t: UseI18n["t"];
  onQrScan: () => void;
  onTables: () => void;
  onOrders: () => void;
  onProductionStatus: () => void;
}

export function DashboardMenuGrid({ t, onQrScan, onTables, onOrders, onProductionStatus }: Props) {
  return (
    <>
      <Pressable
        onPress={onQrScan}
        className="bg-primary/5 border border-primary/10 rounded-2xl p-4 mb-5 flex-row items-center active:opacity-80"
      >
        <View className="bg-primary w-11 h-11 rounded-xl items-center justify-center mr-4">
          <QrCode size={22} color="white" />
        </View>
        <View className="flex-1">
          <Text className="text-foreground font-bold text-base">{t("dashboard.qrScan")}</Text>
          <Text className="text-muted-foreground text-xs">{t("dashboard.qrScanDesc")}</Text>
        </View>
      </Pressable>

      <View className="flex-row justify-between mb-5">
        <MenuCard
          title={t("dashboard.tableMap")}
          icon={<TableIcon size={22} color="#1E2A4A" />}
          onPress={onTables}
        />
        <MenuCard
          title={t("dashboard.myOrders")}
          icon={<ClipboardList size={22} color="#1E2A4A" />}
          onPress={onOrders}
        />
      </View>

      <Pressable
        onPress={onProductionStatus}
        className="bg-secondary rounded-2xl p-4 mb-5 flex-row items-center active:opacity-80"
      >
        <View className="bg-card w-11 h-11 rounded-xl items-center justify-center mr-4 border border-border">
          <TrendingUp size={22} color="#1E2A4A" />
        </View>
        <View className="flex-1">
          <Text className="text-foreground font-bold text-base">{t("productionStatus.title")}</Text>
          <Text className="text-muted-foreground text-xs">{t("productionStatus.desc")}</Text>
        </View>
      </Pressable>
    </>
  );
}

function MenuCard({
  title,
  icon,
  onPress,
}: {
  title: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="w-[48%] bg-card border border-border rounded-2xl p-5 items-center justify-center active:opacity-80 shadow-sm"
    >
      <View className="bg-primary/5 w-11 h-11 rounded-xl items-center justify-center mb-2.5">
        {icon}
      </View>
      <Text className="text-foreground font-bold text-sm text-center">{title}</Text>
    </Pressable>
  );
}
