// ============================================================
// Stock Man — EmptyState
//
// Centered illustration + heading + optional action button.
// Used inside list views (FlatList `ListEmptyComponent`) and
// as a standalone "no data" placeholder on dashboard cards.
// ============================================================

import React from "react";
import { Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { cn } from "@/utils/cn";
import { Button } from "./Button";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <View
      className={cn(
        "items-center justify-center py-10 px-6",
        className
      )}
      accessibilityRole="summary"
    >
      {Icon ? (
        <View className="h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
          <Icon size={28} color="#64748B" />
        </View>
      ) : null}
      <Text className="text-h3 text-foreground text-center">{title}</Text>
      {description ? (
        <Text className="mt-2 text-body text-muted-foreground text-center max-w-md">
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View className="mt-6">
          <Button variant="outline" onPress={onAction}>
            {actionLabel}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

