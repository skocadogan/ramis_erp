// ============================================================
// Smart Table — Tab bar yüksekliği (FAB / padding offset)
// ============================================================

import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Tab bar içerik alanı (_layout.tsx ile aynı). */
const TAB_BAR_CONTENT_HEIGHT = 60;
const TAB_BOTTOM_FALLBACK = 14;

/** Alt tab bar'ın toplam yüksekliği (safe area dahil). */
function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  const safeBottom = insets.bottom > 0 ? insets.bottom : TAB_BOTTOM_FALLBACK;
  return TAB_BAR_CONTENT_HEIGHT + safeBottom;
}

/** Tab bar üstünde konumlanan FAB'lar için bottom offset. */
export function useFabBottomOffset(extra = 16): number {
  return useTabBarHeight() + extra;
}
