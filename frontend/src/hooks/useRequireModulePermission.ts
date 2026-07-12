"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/store/useAuthStore"
import { useAuthMe } from "@/hooks/useAuthMe"
import { 
  hasModuleAccess, 
  hasPermission, 
  hasOperationalManageAccess, 
  type ModuleKey, 
  type OperationalShortcutKey 
} from "@/lib/constants"

/**
 * Ensures the user has permission to access a specific module.
 * 
 * PERFORMANCE: /auth/me/ çağrısı React Query ile cache'lenir (staleTime: 5dk).
 * İlk sayfa yüklemesinden sonraki 5 dakika boyunca cache'den anında çözülür —
 * her navigasyonda tekrar fetch yapılmaz.
 * 
 * @param module - The module key to check permission for.
 * @param options - Additional checks (specific permission or manage mode).
 * @returns true if user has permission, false otherwise (and will redirect)
 */
export function useRequireModulePermission(
  module: ModuleKey, 
  options: { requiredPermission?: string; mode?: "view" | "manage" } = {}
): boolean | null {
  const { requiredPermission, mode = "view" } = options
  const router = useRouter()
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)

  // React Query ile cache'lenmiş /auth/me/ çağrısı
  // staleTime: 5dk — bu süre içinde isLoading=false, data=cache'den
  const { user: meUser, isLoading: meLoading, isError: meError } = useAuthMe()

  useEffect(() => {
    // Henüz auth/me yükleniyorsa bekle
    if (meLoading) {
      setHasAccess(null)
      return
    }

    // Kullanıcı verisini belirle: React Query'den veya Zustand fallback
    const user = meUser ?? useAuthStore.getState().user

    // auth/me başarısız ve store'da da user yok → login'e yönlendir
    if (meError && !user) {
      router.push("/")
      setHasAccess(false)
      return
    }

    // User yok (logout durumu)
    if (!user) {
      router.push("/")
      setHasAccess(false)
      return
    }

    // İzin kontrolü
    let access = hasModuleAccess(user.permissions, user.is_superuser, module)
    
    if (access && mode === "manage") {
      access = hasOperationalManageAccess(user.permissions, user.is_superuser, module as OperationalShortcutKey)
    }

    if (access && requiredPermission) {
      access = hasPermission(user.permissions, user.is_superuser, requiredPermission)
    }

    if (!access) {
      router.push("/")
    }
    setHasAccess(access)
  }, [module, router, meUser, meLoading, meError, mode, requiredPermission])

  return hasAccess
}
