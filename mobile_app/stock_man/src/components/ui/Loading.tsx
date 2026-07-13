// ============================================================
// Stock Man — Loading
//
// Spinner with optional label. `fullScreen` mode fills the
// parent and centres the indicator (use as a route fallback
// or splash). Otherwise it renders inline with a minHeight
// to avoid layout jumps as content streams in.
// ============================================================

import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

export interface LoadingProps {
  fullScreen?: boolean;
  label?: string;
  size?: "small" | "large";
  className?: string;
}

export function Loading({
  fullScreen = false,
  label,
  size = "large",
  className,
}: LoadingProps) {
  const { t } = useI18n();
  const a11yLabel = label ?? t("common.loadingA11y");

  if (fullScreen) {
    return (
      <View
        className={cn(
          "flex-1 items-center justify-center bg-background",
          className
        )}
        accessibilityRole="progressbar"
        accessibilityLabel={a11yLabel}
      >
        <ActivityIndicator size={size}" className="text-primary"/>
        {label ? (
          <Text className="mt-3 text-sm text-muted-foreground">{label}</Text>
        ) : null}
      </View>
    );
  }
  return (
    <View
      className={cn(
        "items-center justify-center min-h-[120px] py-6",
        className
      )}
      accessibilityRole="progressbar"
      accessibilityLabel={a11yLabel}
    >
      <ActivityIndicator size={size} className="text-primary" />
      {label ? (
        <Text className="mt-2 text-sm text-muted-foreground">{label}</Text>
      ) : null}
    </View>
  );
}

