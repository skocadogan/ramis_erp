import { View, Text, Pressable, Animated } from "react-native";
import { LogOut, Monitor } from "lucide-react-native";
import type { AuthState } from "../../store/useAuthStore";
import type { HealthStatus } from "../../store/useBackendHealthStore";
import type { UseI18n } from "../../i18n";

interface Props {
  t: UseI18n["t"];
  user: AuthState["user"];
  healthStatus: HealthStatus;
  pulseAnim: Animated.Value;
  onCheckHealth: () => void;
  onLogout: () => void;
}

export function DashboardHeader({
  t,
  user,
  healthStatus,
  pulseAnim,
  onCheckHealth,
  onLogout,
}: Props) {
  const initial = (user?.fullName || user?.username || "G")[0].toUpperCase();
  return (
    <View className="px-6 py-3 flex-row justify-between items-center border-b border-border/40">
      <View className="flex-row items-center">
        <View className="w-10 h-10 bg-primary rounded-full items-center justify-center mr-3">
          <Text className="text-primary-foreground font-bold text-lg">{initial}</Text>
        </View>
        <View className="h-10 justify-center">
          {user?.fullName && user.fullName.trim() !== "" ? (
            <>
              <Text className="text-foreground font-bold text-sm leading-none mb-1">
                {user.fullName}
              </Text>
              <Text className="text-muted-foreground text-[10px] font-bold uppercase leading-none">
                {t("dashboard.waiter")}
              </Text>
            </>
          ) : (
            <Text className="text-muted-foreground text-[11px] font-bold uppercase">
              {t("dashboard.waiter")}
            </Text>
          )}
        </View>
      </View>
      <View className="flex-row items-center gap-2">
        <Pressable onPress={onCheckHealth} className="active:opacity-80 p-2 flex-row items-center">
          <Animated.View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              marginRight: 6,
              backgroundColor:
                healthStatus === "ok" ? "#1E2A4A" : healthStatus === "down" ? "#C53030" : "#B0ACA8",
              opacity: healthStatus === "down" ? pulseAnim : 1,
            }}
          />
          <Monitor
            size={18}
            color={
              healthStatus === "ok" ? "#1E2A4A" : healthStatus === "down" ? "#C53030" : "#B0ACA8"
            }
          />
        </Pressable>
        <Pressable onPress={onLogout} className="active:opacity-80 p-2">
          <LogOut size={20} color="#1E2A4A" />
        </Pressable>
      </View>
    </View>
  );
}
