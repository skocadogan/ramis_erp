"use client"

import { useState, useEffect, lazy, Suspense } from "react"
import { Menu, LogOut, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useShallow } from "zustand/react/shallow"
import { useTranslations, useLocale } from "next-intl"
import { useAuthStore } from "@/store/useAuthStore"
import { BackendHealthIndicator } from "@/components/shell/BackendHealthProvider"
import { ThemeMenu } from "@/components/shell/ThemeMenu"
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher"

const ProfileModal = lazy(() =>
  import("@/features/users/components/ProfileModal").then((m) => ({ default: m.ProfileModal })),
)
const GlobalSearchDialog = lazy(() =>
  import("@/features/search/components/GlobalSearchDialog").then((m) => ({
    default: m.GlobalSearchDialog,
  })),
)

interface AppHeaderProps {
  onToggleSidebar: () => void
}

export function AppHeader({ onToggleSidebar }: AppHeaderProps) {
  const { user, logout } = useAuthStore(useShallow((s) => ({ user: s.user, logout: s.logout })))
  const router = useRouter()
  const [showProfile, setShowProfile] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const t = useTranslations("common.header")
  const locale = useLocale()

  // ⌘K / Ctrl+K kısayolu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  const handleLogout = async () => {
    try {
      const { default: axios } = await import('axios')
      const { getRuntimeConfig } = await import('@/lib/runtimeConfig')
      await axios.post(getRuntimeConfig().apiBaseUrl + "/auth/logout/", {}, { withCredentials: true })
    } catch {
      // ignore
    }
    logout()
    router.push("/")
  }

  const trimmedFirst = (user?.first_name ?? "").trim()
  const trimmedLast = (user?.last_name ?? "").trim()
  const hasProfileName = Boolean(trimmedFirst || trimmedLast)
  const displayName = hasProfileName
    ? [trimmedFirst, trimmedLast].filter(Boolean).join(" ")
    : user?.username ?? ""

  const initials = (() => {
    if (!user?.username) return "?"
    if (trimmedFirst && trimmedLast) {
      return `${trimmedFirst[0]!}${trimmedLast[0]!}`.toUpperCase()
    }
    if (trimmedFirst.length >= 2) return trimmedFirst.slice(0, 2).toUpperCase()
    if (trimmedFirst.length === 1) {
      return `${trimmedFirst[0]!}${user.username[0] ?? ""}`.toUpperCase()
    }
    return user.username.slice(0, 2).toUpperCase()
  })()

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label={t("toggleSidebar")}
          >
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-foreground">{t("brandName")}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Arama butonu — masaüstü */}
          <button
            id="global-search-trigger"
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
            aria-label={t("searchLabel")}
          >
            <Search size={14} />
            <span className="hidden md:block">{t("search")}</span>
            <kbd className="hidden md:flex items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 text-xs font-mono text-muted-foreground/60">
              ⌘K
            </kbd>
          </button>

          {/* Arama butonu — mobil */}
          <button
            id="global-search-trigger-mobile"
            onClick={() => setSearchOpen(true)}
            className="flex sm:hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label={t("searchMobileLabel")}
          >
            <Search size={16} />
          </button>

          {/* Tema menüsü */}
          <ThemeMenu />

          {/* Dil değiştirici */}
          <LanguageSwitcher currentLocale={locale} variant="ghost" />

          {/* Kullanıcı profili */}
          <button
            onClick={() => setShowProfile(true)}
            className="flex items-center gap-2 ps-2 border-s border-border hover:bg-muted rounded-md px-2 py-1 transition-colors cursor-pointer"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
              {initials}
            </div>
            <span className="text-sm font-medium text-foreground hidden sm:block">
              {displayName}
            </span>
          </button>

          {/* Çıkış */}
          <button
            onClick={handleLogout}
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            aria-label={t("logoutLabel")}
          >
            <LogOut size={15} />
            <span className="hidden sm:block">{t("logout")}</span>
          </button>

          <BackendHealthIndicator />
        </div>
      </header>

      {showProfile && (
        <Suspense fallback={null}>
          <ProfileModal onClose={() => setShowProfile(false)} />
        </Suspense>
      )}

      {searchOpen && (
        <Suspense fallback={null}>
          <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
        </Suspense>
      )}
    </>
  )
}
