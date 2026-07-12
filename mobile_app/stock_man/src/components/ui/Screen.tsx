// ============================================================
// Stock Man — Screen
//
// Standard screen wrapper. Always safe-area aware (top edge
// at minimum). If `scroll` is true, contents are wrapped in
// a ScrollView. `padded` adds the app's standard horizontal
// padding so feature screens don't have to repeat the class.
// ============================================================

import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  View,
  type RefreshControlProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";
import { cn } from "@/utils/cn";

export interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  refreshControl?: RefreshControlProps;
  padded?: boolean;
  keyboardShouldPersistTaps?: "always" | "never" | "handled";
  className?: string;
  /** Apply safe area on the bottom too (default false). */
  bottomSafe?: boolean;
}

export function Screen({
  children,
  scroll = false,
  refreshControl,
  padded = false,
  keyboardShouldPersistTaps = "handled",
  className,
  bottomSafe = false,
}: ScreenProps) {
  const { isWide, isTablet } = useResponsive();
  const containerClass = cn("flex-1 bg-background", className);

  const padClass = padded
    ? isWide
      ? "px-8"
      : isTablet
        ? "px-6"
        : "px-4"
    : "";

  const Inner = (
    <View className={cn("flex-1", padClass)}>{children}</View>
  );

  const content = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={refreshControl ? <RefreshControl {...refreshControl} /> : undefined}
    >
      {Inner}
    </ScrollView>
  ) : (
    Inner
  );

  return (
    <SafeAreaView
      edges={bottomSafe ? ["top", "bottom"] : ["top"]}
      className={containerClass}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

