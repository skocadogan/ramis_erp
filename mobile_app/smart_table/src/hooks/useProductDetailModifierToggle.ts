// ============================================================
// Ekstra seçimi — sadece yerel taslak state'i günceller
// ============================================================

import { useCallback } from "react";

export function useProductDetailModifierToggle(
  applyModifierToggle: (
    groupId: string,
    modifierId: string,
  ) => Record<string, string[]>,
) {
  return useCallback(
    (groupId: string, modifierId: string) => {
      applyModifierToggle(groupId, modifierId);
    },
    [applyModifierToggle],
  );
}
