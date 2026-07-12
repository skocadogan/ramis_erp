import { View, Text, Pressable } from "react-native";
import { Monitor } from "lucide-react-native";
import type { UseI18n } from "../../i18n";

interface Props {
  t: UseI18n["t"];
  onSelectTerminal: () => void;
  onSettings: () => void;
  onLogout: () => void;
}

export function DashboardPosTerminalRequiredView({
  t,
  onSelectTerminal,
  onSettings,
  onLogout,
}: Props) {
  return (
    <View className="flex-1 bg-background p-8 items-center justify-center">
      <View className="bg-secondary w-24 h-24 rounded-full items-center justify-center mb-6">
        <Monitor size={40} color="#1E2A4A" />
      </View>
      <Text className="text-foreground text-2xl font-bold text-center mb-3">
        {t("dashboard.posTerminalRequiredTitle")}
      </Text>
      <Text className="text-muted-foreground text-center mb-10 px-4 leading-5 text-sm">
        {t("dashboard.posTerminalRequiredDesc")}
      </Text>
      <Pressable
        onPress={onSelectTerminal}
        className="active:opacity-80 bg-primary w-full h-14 rounded-xl items-center justify-center shadow-md mb-4"
      >
        <Text className="text-white font-bold text-base">{t("dashboard.goSelectTerminal")}</Text>
      </Pressable>
      <Pressable onPress={onSettings} className="active:opacity-80 mb-6">
        <Text className="text-primary font-bold text-sm">{t("dashboard.settings")}</Text>
      </Pressable>
      <Pressable
        onPress={onLogout}
        className="active:opacity-80 w-full h-14 rounded-xl items-center justify-center border-2 border-border bg-secondary"
      >
        <Text className="text-muted-foreground font-bold text-base">{t("dashboard.logout")}</Text>
      </Pressable>
    </View>
  );
}
