import React from "react";
import { Text, View } from "react-native";
import { cn } from "@/utils/cn";

export interface InfoRowProps {
  label: string;
  value: string;
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  isLast?: boolean;
  className?: string;
}

export function InfoRow({ label, value, icon: Icon, isLast, className }: InfoRowProps) {
  return (
    <View
      className={cn(
        "flex-row items-center py-2",
        !isLast && "border-b border-border",
        className
      )}
    >
      {Icon ? (
        <Icon size={14} color="#64748B" />
      ) : null}
      <View className="flex-1 ml-2">
        <Text className="text-caption text-muted-foreground">{label}</Text>
        <Text className="text-body text-foreground" numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

