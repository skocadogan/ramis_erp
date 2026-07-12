// ============================================================
// Stock Man — Permission Hooks
//
// Thin React-friendly wrappers around usePermissionStore.
// Each hook subscribes only to the boolean it needs so the
// consumer re-renders only when that permission flips.
//
// Usage:
//   const canView = useCanViewAmounts();
//   const canManage = useCanManage("stock");
//   if (!canView) return <AmountMasked />;
// ============================================================

import { usePermissionStore } from "@/store/usePermissionStore";

export function usePermission(code: string): boolean {
  return usePermissionStore((s) => s.has(code));
}

export function useCanViewAmounts(): boolean {
  return usePermissionStore((s) => s.canViewAmounts());
}


