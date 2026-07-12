import React from "react";
import { Text, View } from "react-native";

export interface SectionCardProps {
  title: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  children: React.ReactNode;
  className?: string;
}

export function SectionCard({ title, icon: Icon, children, className }: SectionCardProps) {
  return (
    <View className={`mb-3 rounded-xl border border-border bg-card ${className ?? ""}`}>
      <View className="flex-row items-center px-3 py-2.5 border-b border-border">
        <Icon size={16} color="#1E40AF" />
        <Text className="ml-2 text-body font-semibold text-foreground">
          {title}
        </Text>
      </View>
      <View className="p-3">{children}</View>
    </View>
  );
}

