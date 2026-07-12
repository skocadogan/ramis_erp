import { View, Text, Pressable, ScrollView } from "react-native";
import { Settings, LogOut } from "lucide-react-native";
import type { UseI18n } from "../../i18n";
import { PosTerminalList } from "../PosTerminalList";

interface Props {
  t: UseI18n["t"];
  branchLabel: string;
  branchId: string;
  terminalListTick: number;
  onSettings: () => void;
  onLogout: () => void;
  onCheckAgain: () => void;
  onTerminalPersisted: () => void;
}

export function DashboardShiftClosedView({
  t,
  branchLabel,
  branchId,
  terminalListTick,
  onSettings,
  onLogout,
  onCheckAgain,
  onTerminalPersisted,
}: Props) {
  return (
    <ScrollView
      className="flex-1 px-5 pt-5"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <View className="px-5 pt-3 pb-2 flex-row justify-between items-center border-b border-border/40">
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

      <Text className="text-foreground text-2xl font-bold mb-2">
        {t("dashboard.shiftClosedTerminalOnlyTitle")}
      </Text>
      <Text className="text-muted-foreground text-sm mb-6 leading-5">
        {t("dashboard.shiftClosedTerminalOnlyDesc")}
      </Text>

      <Text className="text-foreground text-xl font-bold mb-2">
        {t("terminalSelect.sectionTitle")}
      </Text>
      <Text className="text-muted-foreground text-sm mb-5">{t("terminalSelect.sectionDesc")}</Text>

      <PosTerminalList
        branchId={branchId}
        refreshKey={terminalListTick}
        onTerminalPersisted={onTerminalPersisted}
      />

      <Pressable onPress={onCheckAgain} className="active:opacity-80 mt-8 mb-10 items-center py-3">
        <Text className="text-primary font-bold text-sm">{t("dashboard.checkAgain")}</Text>
      </Pressable>
    </ScrollView>
  );
}
