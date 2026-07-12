"use client"

import { useMemo } from "react"
import { useAuthStore } from "@/store/useAuthStore"
import { hasPermission, hasOperationalManageAccess, type OperationalShortcutKey } from "@/lib/constants"

interface ModulePermissions {
  canManage: (permission: string) => boolean
  canOperationalManage: (key: OperationalShortcutKey) => boolean
  isSuperuser: boolean
}

export function useModulePermissions(): ModulePermissions {
  const user = useAuthStore((state) => state.user)

  return useMemo(() => ({
    canManage: (permission: string) =>
      hasPermission(user?.permissions, user?.is_superuser, permission),
    canOperationalManage: (key: OperationalShortcutKey) =>
      hasOperationalManageAccess(user?.permissions, user?.is_superuser, key),
    isSuperuser: Boolean(user?.is_superuser),
  }), [user?.permissions, user?.is_superuser])
}
