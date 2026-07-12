// ============================================================
// Smart Table — Cart Layout Helpers
// Shared layout calculations for CartSheet and its children.
// ============================================================

import { useWindowDimensions } from "react-native";

const TABLET_MIN_WIDTH = 768;

export interface CartLayoutInfo {
  isTablet: boolean;
  isLandscape: boolean;
  useSplitLayout: boolean;
  sheetWidth: number;
  splitSidebarWidth: number;
  sheetMaxHeight: number;
}

export function useCartLayout(): CartLayoutInfo {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isTablet = screenWidth >= TABLET_MIN_WIDTH;
  const isLandscape = screenWidth > screenHeight;
  const useSplitLayout = isLandscape && screenWidth >= 700;
  const sheetWidth = isTablet
    ? Math.min(screenWidth - 24, useSplitLayout ? 980 : 600)
    : screenWidth;
  const splitSidebarWidth = useSplitLayout
    ? Math.min(360, Math.max(300, Math.round(sheetWidth * 0.34)))
    : 0;
  const sheetMaxHeight = isTablet
    ? Math.min(screenHeight * 0.85, 700)
    : screenHeight * 0.88;

  return {
    isTablet,
    isLandscape,
    useSplitLayout,
    sheetWidth,
    splitSidebarWidth,
    sheetMaxHeight,
  };
}
