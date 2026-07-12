// ============================================================
// Smart Table — Waiter Call Tab
// ============================================================

import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { WaiterCallScreen } from "@/components/waiter/WaiterCallScreen";

export default function WaiterCallTabScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top"]}
    >
      <WaiterCallScreen
        variant="tab"
        onGoToProfile={() => router.push("/(tabs)/profile" as never)}
      />
    </SafeAreaView>
  );
}
