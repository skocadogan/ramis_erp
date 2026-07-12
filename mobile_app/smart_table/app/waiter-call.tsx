// ============================================================
// Smart Table — Waiter Call (Standalone Modal)
// ============================================================

import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { WaiterCallScreen } from "@/components/waiter/WaiterCallScreen";

export default function WaiterCallModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: colors.background, paddingTop: insets.top }}
    >
      <WaiterCallScreen variant="modal" onClose={() => router.back()} />
    </View>
  );
}
