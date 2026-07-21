"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import api from "@/lib/api"
import { checkBackendHealth } from "@/lib/healthCheck"
import { useRuntimeConfig } from "@/lib/RuntimeConfigProvider"
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
import { resolveMediaUrl } from "@/lib/mediaUrl"
import type { Product } from "@/types/pos"


function normalizePosProduct(product: Product): Product {
  return {
    ...product,
    image: resolveMediaUrl(product.image),
  }
}

/** Backend `MenuCatalogPagination.max_page_size` ile uyumlu; tüm menü (birleşik ürünler dahil) yüklensin. */
const MENU_CATALOG_PAGE_SIZE = 500

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
  const t = useTranslations("pos")
  const runtime = useRuntimeConfig()
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

  const categoriesQuery = useQuery({
    queryKey: queryKeys.posCategories(bid),
    queryFn: async () => {
      const { data } = await api.get("/menu/categories/", {
        params: { branch_id: bid, page_size: MENU_CATALOG_PAGE_SIZE },
      })
      return data.results || data
    },
    enabled: !!user && !!bid && needMenu,
    refetchInterval: menuPollMs,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })

  const productsQuery = useQuery({
    queryKey: queryKeys.posProducts(bid),
    queryFn: async () => {
      const { data } = await api.get("/menu/products/", {
        params: {
          branch_id: bid,
          is_active: true,
          show_on_pos: true,
          page_size: MENU_CATALOG_PAGE_SIZE,
        },
      })
      const raw = data.results || data
      return Array.isArray(raw)
        ? raw.map((product: Product) => normalizePosProduct(product))
        : raw
    },
    enabled: !!user && !!bid && needMenu,
    refetchInterval: menuPollMs,
    staleTime: 5 * 60_000,
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


  // ── Backend health check ──────────────────────────────────────────────────────

  useEffect(() => {
    const ac = new AbortController()
    void (async () => {
      const ok = await checkBackendHealth(ac.signal)
      if (ac.signal.aborted) return
      if (!ok) {
        const base = runtime.apiBaseUrl
        toast.error(t("healthCheck.unreachableTitle"), {
          id: "pos-api-unreachable",
          duration: 12_000,
          description: t("healthCheck.unreachableDescription", { base }),
        })
      }
    })()
    return () => ac.abort()
  }, [runtime.apiBaseUrl, t])

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
