// ============================================================
// useResponsive — Tablet/Phone breakpoint hook
//
// Breakpoints (portrait width):
//   phone     : < 600 dp       — tek kolon, yatay scroll
//   tablet    : 600–899 dp     — iki kolon, tablolarda yatay scroll
//   wide      : >= 900 dp      — tam esnek tablo layout'u
//
// Tablet uyumlu listeler ve split-view layout'lar için
// `bp` ve `isTablet` kullanılır.
// ============================================================

import { useWindowDimensions } from "react-native";

type Breakpoint = "phone" | "tablet" | "wide";

export interface ResponsiveInfo {
  bp: Breakpoint;
  isLandscape: boolean;
  width: number;
  height: number;
  isTablet: boolean;
  isWide: boolean;
}

export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  let bp: Breakpoint = "phone";
  if (width >= 900) bp = "wide";
  else if (width >= 600) bp = "tablet";

  return {
    bp,
    isLandscape,
    width,
    height,
    isTablet: bp !== "phone",
    isWide: bp === "wide",
  };
}
