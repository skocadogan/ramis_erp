// ============================================================
// Stock Man — Header
//
// Sticky top bar for screens. 56px height matches Material app bar.
// `back` shows a theme-aware chevron; use `onBackPress` to override
// (wizard step-back, custom fallback, etc.).
// ============================================================

import React from "react";
import {
  Pressable,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useI18n } from "@/i18n";
import { useAppTheme } from "@/utils/theme";
import { getSemanticIconColors } from "@/theme/colorVariables";
import { cn } from "@/utils/cn";

export interface HeaderProps {
  title: string;
  subtitle?: string;
  /** true veya özel erişilebilirlik etiketi */
  back?: boolean | string;
  right?: React.ReactNode;
  transparent?: boolean;
  /** Detay ekranları: dış sarmalayıcı zaten px-4 veriyorsa px-0 */
  inline?: boolean;
  className?: string;
  style?: ViewStyle;
  onBackPress?: () => void;
}

export function Header({
  title,
  subtitle,
  back = false,
  right,
  transparent = false,
  inline = false,
  className,
  style,
  onBackPress,
}: HeaderProps) {
  const router = useRouter();
  const { t } = useI18n();
  const { isDark } = useAppTheme();
  const iconColors = getSemanticIconColors(isDark);
  const showBack = !!back;
  const backLabel = typeof back === "string" ? back : t("common.back");

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    }
  };

  return (
    <View
      className={cn(
        "flex-row items-center min-h-[56px] border-b border-border",
        inline ? "px-0" : "px-4",
        transparent ? "bg-transparent" : "bg-background",
        className
      )}
      style={style}
    >
      <View className="flex-row items-center flex-1 min-w-0">
        {showBack ? (
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            hitSlop={8}
            className="mr-1 min-w-[48px] min-h-[48px] items-center justify-center rounded-lg active:bg-muted"
          >
            <ChevronLeft size={26} color={iconColors.foreground} strokeWidth={2.25} />
          </Pressable>
        ) : null}
        <View className="flex-1 min-w-0">
          <Text className="text-h2 text-foreground" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text
              className="text-caption text-muted-foreground mt-0.5"
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {right ? <View className="ml-2 flex-row items-center shrink-0">{right}</View> : null}
    </View>
  );
}

