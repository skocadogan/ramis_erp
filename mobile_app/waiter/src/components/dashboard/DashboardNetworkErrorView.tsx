import { View, Text, Pressable, ScrollView } from "react-native";
import { Monitor, Settings, LogOut } from "lucide-react-native";
import type { UseI18n } from "../../i18n";

interface Props {
  t: UseI18n["t"];
  branchLabel: string;
  onSettings: () => void;
  onLogout: () => void;
  onRetry: () => void;
}

export function DashboardNetworkErrorView({
  t,
  branchLabel,
  onSettings,
  onLogout,
  onRetry,
}: Props) {
  return (
    <ScrollView
      className="flex-1 px-5 pt-5"
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingBottom: 40,
      }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View className="px-5 pt-3 pb-2 flex-row justify-between items-center border-b border-border/40 w-full">
        <Text className="text-foreground font-bold text-base flex-1 pr-2" numberOfLines={2}>
          {branchLabel}
        </Text>
        <Pressable onPress={onSettings} className="active:opacity-80 p-2 mr-1">
          <Settings size={22} color="#1E2A4A" />
        </Pressable>
        <Pressable onPress={onLogout} className="active:opacity-80 p-2">
          <LogOut size={20} color="#1E2A4A" />
        </Pressable>
      </View>

      <View className="bg-destructive/10 w-20 h-20 rounded-full items-center justify-center mb-6">
        <Monitor size={36} color="#C53030" />
      </View>
      <Text className="text-foreground text-2xl font-bold mb-3 text-center">
        {t("common.noConnectionTitle")}
      </Text>
      <Text className="text-muted-foreground text-sm mb-8 text-center px-6 leading-5">
        {t("common.noConnectionDesc")}
      </Text>
      <Pressable
        onPress={onRetry}
        className="active:opacity-80 bg-primary px-8 py-3.5 rounded-xl shadow-md"
      >
        <Text className="text-white font-bold text-base">{t("common.retry")}</Text>
      </Pressable>
    </ScrollView>
  );
}
