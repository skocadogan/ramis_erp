// ============================================================
// Smart Table — CategoryCard Component
// ============================================================

import React from "react";
import { Text, Pressable } from "react-native";
import type { Category, Language } from "@/types";
import { useTheme } from "@/hooks/useTheme";

export interface CategoryCardProps {
  category: Category;
  isActive?: boolean;
  language?: Language;
  onPress?: () => void;
}

export const CategoryCard = React.memo(function CategoryCard({
  category,
  isActive = false,
  language,
  onPress,
}: CategoryCardProps) {
  const { colors } = useTheme();
  const displayName =
    language === "en" && category.nameEn ? category.nameEn : category.name;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={displayName}
      accessibilityState={{ selected: isActive }}
      className="items-center justify-center h-[42px] min-w-[96px] px-5 rounded-full shadow-sm"
      style={{
        backgroundColor: isActive ? colors.primary : colors.card,
        borderWidth: isActive ? 0 : 1,
        borderColor: colors.border,
      }}
    >
      <Text
        numberOfLines={1}
        className="text-sm font-semibold"
        style={{
          color: isActive ? colors.primaryForeground : colors.foreground,
        }}
      >
        {displayName}
      </Text>
    </Pressable>
  );
});
