// ============================================================
// useAppTheme — Tema tercihi yönetimi
//
// - Zustand ile kalıcı tercih (light / dark / system)
// - NativeWind colorScheme.set() ile dark: sınıfları
// - Kök View'a vars() enjekte ederek semantic renkleri günceller
//   (RN'de colorScheme observable her zaman tetiklenmediği için)
// ============================================================

import { useEffect, useState } from "react";
import { Appearance } from "react-native";
import { colorScheme as nativeColorScheme } from "nativewind";
import { darkThemeVars, lightThemeVars } from "@/theme/colorVariables";
import { useUIStore, type ThemePreference } from "@/store/useUIStore";

export type ColorScheme = "light" | "dark";

function resolveActiveScheme(preference: ThemePreference): ColorScheme {
  if (preference === "system") {
    return Appearance.getColorScheme() === "dark" ? "dark" : "light";
  }
  return preference;
}

function applyThemePreference(preference: ThemePreference): void {
  nativeColorScheme.set(preference);
}

export function useAppTheme() {
  const preference = useUIStore((s) => s.themePreference);
  const [activeScheme, setActiveScheme] = useState<ColorScheme>(
    () => resolveActiveScheme(preference)
  );

  useEffect(() => {
    applyThemePreference(preference);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveScheme(resolveActiveScheme(preference));
  }, [preference]);

  useEffect(() => {
    if (preference !== "system") return;

    const subscription = Appearance.addChangeListener(() => {
      setActiveScheme(resolveActiveScheme(preference));
    });

    return () => subscription.remove();
  }, [preference]);

  const isDark = activeScheme === "dark";

  return {
    preference,
    activeScheme,
    isDark,
    themeVarsStyle: isDark ? darkThemeVars : lightThemeVars,
    setPreference: (p: ThemePreference) => {
      applyThemePreference(p);
      void useUIStore.getState().setThemePreference(p);
    },
  };
}
