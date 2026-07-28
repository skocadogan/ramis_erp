"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import api from "@/lib/api"
import { useAuthStore } from "@/store/useAuthStore"
import {
  usePosStore,
  applyServerPosScreenPreferences,
  markPosCloudPrefsSaveAllowed,
} from "@/store/usePosStore"
import { useShallow } from "zustand/react/shallow"
import { hasModuleAccess } from "@/lib/constants"
import { WS_HTTP_FALLBACK_INTERVAL_MS } from "@/lib/wsBackendHost"
import { queryKeys } from "@/lib/queryKeys"
import { useMenuCatalogSync } from "./useMenuCatalogSync"
import { usePosTables, usePosZones } from "./usePosTables"
import { usePosProducts } from "./usePosProducts"
import { usePosCategories } from "./usePosCategories"

interface UsePosDataSyncOptions {
  pathname: string
  /** Garson: masalar `scope=waiter`, müşteri ekranı WS kapalı */
  variant?: "pos" | "waiter"
}

interface UsePosDataSyncReturn {
  isLoading: boolean
  /** Menü/şube kataloğunu yenile (WS veya menü yönetimi dönüşü). Sipariş akışında kullanma. */
  fetchData: () => Promise<void>
}

/**
 * POS sayfasındaki tüm veri senkronizasyon effect'lerini tek hook'ta toplar:
 * - TanStack Query ile optimize edilmiş veri çekme ve polling.
 * - Masa listesi: `usePosTables` (tek kaynak) + `TableSync` WS.
 * - Visibility: menü WS kapalıysa katalog yenileme.
 * - Pathname bazlı menü yenileme.
 */
export function usePosDataSync({
  pathname,
  variant = "pos",
}: UsePosDataSyncOptions): UsePosDataSyncReturn {
  const user = useAuthStore(useShallow((s) => s.user))
  const prevPathRef = useRef<string | null>(null)

  const {
    activeBranchId,
    initializeSettings,
  } = usePosStore(
    useShallow((s) => ({
      activeBranchId: s.activeBranchId,
      initializeSettings: s.initializeSettings,
    }))
  )

  const [menuCatalogWsOpen, setMenuCatalogWsOpen] = useState(false)

  const perms = user?.permissions
  const su = user?.is_superuser
  const bid = activeBranchId || user?.branch_id

  const needTables = hasModuleAccess(perms, su, "tables")
  const needMenu = hasModuleAccess(perms, su, "menu")
  const canBranches = hasModuleAccess(perms, su, "branches")

  const isWaiter = variant === "waiter"

  // WS açıkken menü HTTP poll kapalı; kapalıyken yedek interval.
  const menuPollMs =
    menuCatalogWsOpen && needMenu ? false : WS_HTTP_FALLBACK_INTERVAL_MS

  // ── Queries ────────────────────────────────────────────────────────────────

  const branchesQuery = useQuery({
    queryKey: queryKeys.posBranchesBase,
    queryFn: async () => {
      const { data } = await api.get("/branches/")
      return data.results || data
    },
    enabled: !!user && canBranches,
    refetchInterval: isWaiter ? false : menuPollMs,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })

  // Masalar: tek kaynak (TableSync mount HTTP'siz; WS ile günceller)
  const tablesQuery = usePosTables(bid, variant, {
    enabled: !!user && !!bid && needTables,
  })

  const zonesQuery = usePosZones({
    branchId: bid,
    enabled: !!user && !!bid && needTables,
  })

  const categoriesQuery = usePosCategories({
    branchId: bid,
    enabled: !!user && !!bid && needMenu,
    refetchInterval: menuPollMs,
    gcTime: 30 * 60_000,
  })

  const productsQuery = usePosProducts({
    branchId: bid,
    enabled: !!user && !!bid && needMenu,
    refetchInterval: menuPollMs,
  })

  const isLoading =
    (branchesQuery.isLoading && canBranches) ||
    (tablesQuery.isLoading && needTables) ||
    (zonesQuery.isLoading && needTables) ||
    (categoriesQuery.isLoading && needMenu) ||
    (productsQuery.isLoading && needMenu)

  const refreshMenuCatalog = useCallback(async () => {
    await Promise.all([
      categoriesQuery.refetch(),
      productsQuery.refetch(),
    ])
  }, [categoriesQuery, productsQuery])

  /** Menü + şube — sipariş/ödeme sonrası çağrılmamalı. */
  const fetchData = useCallback(async () => {
    await Promise.all([
      branchesQuery.refetch(),
      categoriesQuery.refetch(),
      productsQuery.refetch(),
    ])
  }, [branchesQuery, categoriesQuery, productsQuery])

  // ── Ayarlar: localStorage (cihaz) + sunucu (kullanıcı / pos|waiter) ─────────
  useEffect(() => {
    markPosCloudPrefsSaveAllowed(false)
    initializeSettings(variant)
    let cancelled = false
    if (!user?.id) {
      markPosCloudPrefsSaveAllowed(true)
      return () => {
        cancelled = true
      }
    }
    void (async () => {
      try {
        const { data } = await api.get<{
          context: string
          preferences: Record<string, unknown>
        }>("/auth/me/pos-screen-preferences/", { params: { context: variant } })
        if (cancelled) return
        if (usePosStore.getState().settingsContext !== variant) return
        applyServerPosScreenPreferences(data.preferences)
      } catch {
        /* çevrimdışı veya hata: yerel ayarlar kullanılır */
      } finally {
        if (
          !cancelled &&
          usePosStore.getState().settingsContext === variant
        ) {
          markPosCloudPrefsSaveAllowed(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [variant, initializeSettings, user?.id])

  // Backend health: BackendHealthProvider / banner — POS'ta ayrı toast yok.

  // ── Visibility: menü WS kapalıysa katalog yenile ─────────────────────────────

  const menuCatalogWsOpenRef = useRef(menuCatalogWsOpen)
  menuCatalogWsOpenRef.current = menuCatalogWsOpen
  const visibilityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const runIfNeeded = () => {
      // WS canlıysa katalog zaten sync; gereksiz 500 ürün refetch yok.
      if (menuCatalogWsOpenRef.current) return
      void refreshMenuCatalog()
    }
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return
      if (visibilityDebounceRef.current) clearTimeout(visibilityDebounceRef.current)
      visibilityDebounceRef.current = setTimeout(() => {
        visibilityDebounceRef.current = null
        runIfNeeded()
      }, 400)
    }
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) runIfNeeded()
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pageshow", onPageShow as EventListener)
    return () => {
      if (visibilityDebounceRef.current) clearTimeout(visibilityDebounceRef.current)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pageshow", onPageShow as EventListener)
    }
  }, [refreshMenuCatalog])

  // ── Menü yönetiminden dönüş / pathname değişimi ──────────────────────────────

  useEffect(() => {
    const prev = prevPathRef.current
    prevPathRef.current = pathname
    if ((pathname === "/pos" || pathname === "/waiter") && prev !== null && prev !== pathname) {
      void refreshMenuCatalog()
    }
  }, [pathname, refreshMenuCatalog])

  // ── WS: menü kataloğu senkronizasyonu ───────────────────────────────────────

  const canMenuCatalogWs = hasModuleAccess(user?.permissions, user?.is_superuser, "menu")
  useMenuCatalogSync(canMenuCatalogWs, refreshMenuCatalog, (open) => setMenuCatalogWsOpen(open))

  return { isLoading, fetchData }
}
