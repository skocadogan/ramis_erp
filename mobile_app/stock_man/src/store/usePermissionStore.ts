// ============================================================
// Stock Man — Permission Store
//
// Pure derived state — does not own data, only computes
// "does the current user have permission X?" from
// useAuthStore.user.permissions.
//
// `superuser` is a wildcard that grants everything. Unknown
// permission codes return false (deny by default).
//
// Subscribers can use the typed hooks in @/hooks/usePermission
// (useCanViewAmounts, useCanManage, etc.) so screens don't
// have to know about the codes list directly.
// ============================================================

import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";

type PermState = {
  has: (code: string) => boolean;
  canViewAmounts: () => boolean;
  canManage: (module: string) => boolean;
  hasAny: (codes: string[]) => boolean;
};

export const usePermissionStore = create<PermState>(() => ({
  has: (code) => {
    const perms = useAuthStore.getState().user?.permissions ?? [];
    return perms.includes(code) || perms.includes("superuser");
  },
  canViewAmounts: () => {
    const perms = useAuthStore.getState().user?.permissions ?? [];
    return perms.includes("financial.view_amount") || perms.includes("superuser");
  },
  canManage: (module) => {
    const perms = useAuthStore.getState().user?.permissions ?? [];
    return perms.includes(`${module}.manage`) || perms.includes("superuser");
  },
  hasAny: (codes) => {
    const perms = useAuthStore.getState().user?.permissions ?? [];
    return (
      codes.some((c) => perms.includes(c)) || perms.includes("superuser")
    );
  },
}));
