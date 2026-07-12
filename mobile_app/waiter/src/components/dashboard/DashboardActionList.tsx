import { View, Text, Pressable } from "react-native";
import { Monitor, Settings, ChevronRight } from "lucide-react-native";
import type { UseI18n } from "../../i18n";

interface Props {
  t: UseI18n["t"];
  terminalId: string;
  onChangeTerminal: () => void;
  onSettings: () => void;
}

export function DashboardActionList({ t, terminalId, onChangeTerminal, onSettings }: Props) {
  return (
    <View className="mb-8">
      <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-3 ml-1">
        {t("dashboard.settings")}
      </Text>
      <ActionItem
        title={t("dashboard.changeTerminal")}
        subtitle={terminalId || t("settings.notSelected")}
        icon={<Monitor size={18} color="#1E2A4A" />}
        onPress={onChangeTerminal}
      />
      <ActionItem
        title={t("dashboard.settings")}
        subtitle={t("dashboard.appSettings")}
        icon={<Settings size={18} color="#1E2A4A" />}
        onPress={onSettings}
      />
    </View>
  );
}

function ActionItem({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-80 flex-row items-center mb-2 bg-secondary rounded-xl p-4"
    >
      <View className="w-10 h-10 bg-card border border-border rounded-xl items-center justify-center mr-3">
        {icon}
      </View>
      <View className="flex-1">
        <Text className="text-foreground font-bold text-sm">{title}</Text>
        <Text className="text-muted-foreground text-xs">{subtitle}</Text>
      </View>
      <ChevronRight size={18} className="text-muted-foreground" />
    </Pressable>
  );
}
