"use client"

import { Suspense } from "react"
import { AppHeader } from "@/components/shell/AppHeader"
import { AppSidebar } from "@/components/shell/AppSidebar"
import { BackendHealthBanner } from "@/components/shell/BackendHealthProvider"
import { PageLoadingState } from "@/components/ui/async-state"
import { useAuthStore } from "@/store/useAuthStore"
import type { AuthUser } from "@/types/user.types"
import { useSidebarStore } from "@/store/useSidebarStore"
import { useShallow } from "zustand/react/shallow"

interface InitialAuthState {
  user: AuthUser | null
  token: string | null
  rememberMe: boolean
}

interface AppShellProps {
  children: React.ReactNode
  lowStockCount?: number
  initialAuthState?: InitialAuthState
}

function ShellLayout({ children, lowStockCount = 0, initialAuthState }: AppShellProps) {
  const storeUser = useAuthStore((s) => s.user)
  // Server'dan gelen initialAuthState önceliklidir; yoksa client-side store kullanılır
  const user = storeUser ?? initialAuthState?.user ?? null
  const { collapsed, toggleCollapsed } = useSidebarStore(
    useShallow((s) => ({ collapsed: s.collapsed, toggleCollapsed: s.toggleCollapsed })),
  )

  const handleCollapse = () => {
    toggleCollapsed()
  }

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      <AppHeader onToggleSidebar={handleCollapse} />
      <BackendHealthBanner />
      <div className="flex flex-1 overflow-hidden">
        <Suspense fallback={<div className="w-20 border-r border-border bg-sidebar" />}>
          <AppSidebar
            collapsed={collapsed}
            onCollapse={handleCollapse}
            userPermissions={user?.permissions}
            is_superuser={user?.is_superuser}
            lowStockCount={lowStockCount}
          />
        </Suspense>
        <main className="min-w-0 flex-1 overflow-auto bg-card">
          <Suspense fallback={<PageLoadingState className="absolute inset-0 flex items-center justify-center" />}>
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  )
}

export function AppShell({ children, lowStockCount, initialAuthState }: AppShellProps) {
  return <ShellLayout lowStockCount={lowStockCount} initialAuthState={initialAuthState}>{children}</ShellLayout>
}
