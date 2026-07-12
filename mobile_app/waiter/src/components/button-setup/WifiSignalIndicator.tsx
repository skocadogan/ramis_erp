import React from "react";
import { View } from "react-native";

function barsFromLevel(level: number): number {
  if (level >= -55) return 4;
  if (level >= -67) return 3;
  if (level >= -75) return 2;
  return 1;
}

interface WifiSignalIndicatorProps {
  level: number;
  activeColor?: string;
  inactiveColor?: string;
}

export function WifiSignalIndicator({
  level,
  activeColor = "#1E2A4A",
  inactiveColor = "#D1D5DB",
}: WifiSignalIndicatorProps) {
  const activeBars = barsFromLevel(level);
  const heights = [6, 10, 14, 18];

  return (
    <View className="flex-row items-end gap-[3px]">
      {heights.map((height, index) => {
        const barIndex = index + 1;
        const isActive = barIndex <= activeBars;
        return (
          <View
            key={barIndex}
            style={{
              width: 4,
              height,
              borderRadius: 2,
              backgroundColor: isActive ? activeColor : inactiveColor,
              opacity: isActive ? 1 : 0.45,
            }}
          />
        );
      })}
    </View>
  );
}
