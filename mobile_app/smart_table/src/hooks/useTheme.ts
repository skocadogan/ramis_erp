// ============================================================
// Smart Table — useTheme Hook
//
// Merkezi tema palette hook'u. Tüm bileşenler renklere
// buradan erişir. Bu sayede tek bir kaynaktan yönetim ve
// tutarlı tema geçişleri sağlanır.
//
// Kullanım:
//   const { isDark, colors } = useTheme();
//   <Icon color={colors.primary} />
//   <View style={{ backgroundColor: colors.background }} />
// ============================================================

import { useUIStore } from "@/store/ui-store";
import { useMemo } from "react";

// ─── Light Palette ─────────────────────────────────────────

const lightColors = {
  // Ana renkler
  primary: "#D94A3D",
  primaryForeground: "#FFFFFF",

  secondary: "#2B2D42",
  secondaryForeground: "#FFFFFF",

  // Arkaplan & Yüzey
  background: "#FAFAFA",
  foreground: "#1A1A2E",

  card: "#FFFFFF",
  cardForeground: "#1A1A2E",

  popover: "#FFFFFF",
  popoverForeground: "#1A1A2E",

  // Vurgu
  accent: "#F5E6D3",
  accentForeground: "#2B2D42",

  muted: "#F0F0F0",
  mutedForeground: "#6B7280",

  // Kenarlık & Giriş
  border: "#E5E7EB",
  input: "#E5E7EB",
  ring: "#D94A3D",

  // Durum renkleri (her iki temada da sabit)
  destructive: "#EF4444",
  destructiveForeground: "#FFFFFF",

  success: "#059669",
  successForeground: "#FFFFFF",

  warning: "#F59E0B",
  warningForeground: "#FFFFFF",

  // Placeholder metin
  placeholder: "#9CA3AF",

  // İkon renkleri
  icon: "#6B7280",
  iconMuted: "#9CA3AF",
} as const;

// ─── Dark Palette ───────────────────────────────────────────

const darkColors = {
  // Ana renkler
  primary: "#E85D04",
  primaryForeground: "#FFFFFF",

  secondary: "#EDEDED",
  secondaryForeground: "#1A1A2E",

  // Arkaplan & Yüzey
  background: "#0F0F1A",
  foreground: "#EDEDED",

  card: "#1A1A2E",
  cardForeground: "#EDEDED",

  popover: "#1A1A2E",
  popoverForeground: "#EDEDED",

  // Vurgu
  accent: "#2B2D42",
  accentForeground: "#EDEDED",

  muted: "#2B2D42",
  mutedForeground: "#9CA3AF",

  // Kenarlık & Giriş
  border: "#2B2D42",
  input: "#2B2D42",
  ring: "#E85D04",

  // Durum renkleri (her iki temada da sabit)
  destructive: "#EF4444",
  destructiveForeground: "#FFFFFF",

  success: "#059669",
  successForeground: "#FFFFFF",

  warning: "#F59E0B",
  warningForeground: "#FFFFFF",

  // Placeholder metin
  placeholder: "#6B7280",

  // İkon renkleri
  icon: "#9CA3AF",
  iconMuted: "#6B7280",
} as const;

// ─── Shadow Helpers ──────────────────────────────────────────

function makeShadow(color: string, opacity: number, radius = 12, offsetY = 6) {
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: radius,
    elevation: Math.round(offsetY * 1.5),
  };
}

// ─── Hook ───────────────────────────────────────────────────

export interface ThemeColors {
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  accent: string;
  accentForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  input: string;
  ring: string;
  destructive: string;
  destructiveForeground: string;
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  placeholder: string;
  icon: string;
  iconMuted: string;
}

export function useTheme() {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";
  const colors: ThemeColors = isDark ? darkColors : lightColors;

  /** Primary renk için hazır gölge stili */
  const primaryShadow = useMemo(
    () => makeShadow(colors.primary, isDark ? 0.55 : 0.35),
    [colors.primary, isDark],
  );

  /** Hafif kart gölgesi */
  const cardShadow = useMemo(
    () => makeShadow("#000000", isDark ? 0.3 : 0.08, 8, 2),
    [isDark],
  );

  return {
    isDark,
    colors,
    primaryShadow,
    cardShadow,
  };
}
