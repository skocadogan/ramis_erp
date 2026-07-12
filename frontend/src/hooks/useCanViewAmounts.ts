"use client";

import { useMemo } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { canViewMonetaryAmounts } from "@/lib/constants";

/** Tutar Görüntüleme (`financial.view_amount`) — yoksa tutarlar `***` gösterilir. */
export function useCanViewAmounts(): boolean {
  const user = useAuthStore((s) => s.user);
  return useMemo(
    () => canViewMonetaryAmounts(user?.permissions, user?.is_superuser),
    [user?.permissions, user?.is_superuser]
  );
}
