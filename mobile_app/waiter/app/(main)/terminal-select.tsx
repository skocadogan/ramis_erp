import React, { useState, useCallback } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router/react-navigation";
import { ChevronLeft, Home } from "lucide-react-native";
import { useAuthStore } from "../../src/store/useAuthStore";
import { usePosStore } from "../../src/store/usePosStore";
import { useI18n } from "../../src/i18n";
import { effectiveBranchId } from "../../src/utils/branchScope";
import { PosTerminalList } from "../../src/components/PosTerminalList";

export default function TerminalSelectScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const activeBranchId = usePosStore((s) => s.activeBranchId);

  const branchId = effectiveBranchId(user?.branchId, activeBranchId);
  const [listTick, setListTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setListTick((n) => n + 1);
    }, []),
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-4 py-4 flex-row justify-between items-center">
        <Pressable onPress={() => router.back()} className="active:opacity-80 p-2">
          <ChevronLeft size={28} color="#1E2A4A" />
        </Pressable>
        <Text className="text-foreground font-bold text-3xl">{t("terminalSelect.title")}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("terminalSelect.homeAccessibility")}
          onPress={() => router.replace("/(main)")}
          className="active:opacity-80 p-2 flex-row items-center"
        >
          <Home size={26} color="#1E2A4A" />
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-8" contentInsetAdjustmentBehavior="automatic">
        <View className="mb-8 mt-4">
          <Text className="text-foreground text-2xl font-bold mb-2">{t("terminalSelect.sectionTitle")}</Text>
          <Text className="text-muted-foreground">{t("terminalSelect.sectionDesc")}</Text>
        </View>

        {branchId ? (
          <PosTerminalList
            branchId={branchId}
            refreshKey={listTick}
            onTerminalPersisted={() => router.replace("/(main)")}
          />
        ) : (
          <Text className="text-muted-foreground">{t("common.noData")}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
