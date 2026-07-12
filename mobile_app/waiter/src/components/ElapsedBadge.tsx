import React, { useEffect, useMemo, useState } from "react";
import { View, Text } from "react-native";
import { Clock } from "lucide-react-native";

interface ElapsedBadgeProps {
  createdAt: string;
  isDark: boolean;
}

/**
 * Siparişin ne kadar süredir bekleme veya hazır modunda olduğunu Türkçe formatta döndürür.
 * Ayrı bir component olarak ayrıştırıldı — elapsedTick değişikliğinde tüm liste yeniden oluşmasın.
 */
export const ElapsedBadge = React.memo(function ElapsedBadge({
  createdAt,
  isDark,
}: ElapsedBadgeProps) {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = useMemo(() => {
    try {
      const diffMs = tick - new Date(createdAt).getTime();
      if (isNaN(diffMs) || diffMs < 0) return "";
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 60) return `${diffMins}dk`;
      const diffHours = Math.floor(diffMins / 60);
      return `${diffHours}sa ${diffMins % 60}dk`;
    } catch {
      return "";
    }
  }, [createdAt, tick]);

  if (!elapsed) return null;

  return (
    <View className="flex-row items-center mt-1 bg-transparent px-1 py-0.5">
      <Clock size={10} color={isDark ? "#A1A1AA" : "#475569"} style={{ marginRight: 3 }} />
      <Text className="text-[10px] text-foreground/80 dark:text-muted-foreground font-bold">
        {elapsed}
      </Text>
    </View>
  );
});

ElapsedBadge.displayName = "ElapsedBadge";
