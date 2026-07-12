"use client"

import { useCallback, useEffect, useRef, useMemo, useState } from "react"
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

/** Menü kataloğu WebSocket açıkken tam `fetchData` yedek polling aralığı (ms). */
const MENU_CATALOG_WS_POLL_INTERVAL_MS = 300_000

interface UsePosDataSyncOptions {
  pathname: string
  /** Garson: masalar `scope=waiter`, müşteri ekranı WS kapalı */
  variant?: "pos" | "waiter"
}

interface UsePosDataSyncReturn {
  isLoading: boolean
  fetchData: () => Promise<void>
}

/**
 * POS sayfasındaki tüm veri senkronizasyon effect'lerini tek hook'ta toplar:
 * - TanStack Query ile optimize edilmiş veri çekme ve polling.
 * - Zustand store ile çift taraflı senkronizasyon (backward compatibility).
 * - Visibility / pageshow yenileme.
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

  const pollMs =
    menuCatalogWsOpen && needMenu
      ? MENU_CATALOG_WS_POLL_INTERVAL_MS
      : WS_HTTP_FALLBACK_INTERVAL_MS

  const isWaiter = variant === "waiter"

  // ── Queries ────────────────────────────────────────────────────────────────

  const branchesQuery = useQuery({
    queryKey: queryKeys.posBranchesBase,
    queryFn: async () => {
      const { data } = await api.get("/branches/")
      return data.results || data
    },
    enabled: !!user && canBranches,
    refetchInterval: isWaiter ? false : pollMs,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  })

  const tableParams = useMemo(() => ({
    branch_id: bid,
    ...(variant === "waiter" ? { scope: "waiter" } : {})
  }), [bid, variant])

  const tablesQuery = useQuery({
    queryKey: queryKeys.posTables(bid, variant),
    queryFn: async () => {
      const { data } = await api.get("/tables/", { params: tableParams })
      return data.results || data
    },
    enabled: !!user && !!bid && needTables,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
  })

  const takeawayVirtualQuery = useQuery({
    queryKey: queryKeys.posTablesTakeawayVirtual(bid, variant),
    queryFn: async () => {
      const { data } = await api.get("/tables/takeaway_virtual/", {
        params: tableParams,
      })
      return Array.isArray(data) ? data : []
    },
    enabled: !!user && !!bid && needTables,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
  })

  const zonesQuery = useQuery({
    queryKey: queryKeys.posZones(bid),
    queryFn: async () => {
      const { data } = await api.get("/zones/", { params: { branch_id: bid } })
      const results = data.results || data
      return results.filter((z: { is_active?: boolean }) => z.is_active)
    },
    enabled: !!user && !!bid && needTables,
    refetchInterval: isWaiter ? false : pollMs,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
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
    refetchInterval: pollMs,
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
    refetchInterval: pollMs,
    staleTime: 5 * 60_000,
  })

  // ── Sync to Zustand: TÜM server verileri React Query'ye taşındı.
  // tables/zones/branches/categories/products → bileşenler doğrudan Query okuyor.
  // Sync efektleri kaldırıldı. (bkz. P0.2/Faz4)

  const isLoading = 
    (branchesQuery.isLoading && canBranches) || 
    (tablesQuery.isLoading && needTables) || 
    (takeawayVirtualQuery.isLoading && needTables) ||
    (zonesQuery.isLoading && needTables) || 
    (categoriesQuery.isLoading && needMenu) || 
    (productsQuery.isLoading && needMenu)

  const fetchData = useCallback(async () => {
    // Masalar/zonlar WS ile canlı güncelleniyor — refetch sadece titreme yaratır.
    // Sadece menu (kategori/ürün) ve şube verilerini tazele.
    await Promise.all([
      branchesQuery.refetch(),
      categoriesQuery.refetch(),
      productsQuery.refetch(),
    ])
  }, [branchesQuery, categoriesQuery, productsQuery])

  const refreshMenuCatalog = useCallback(async () => {
    await Promise.all([
      categoriesQuery.refetch(),
      productsQuery.refetch(),
    ])
  }, [categoriesQuery, productsQuery])

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

  // ── Visibility / pageshow yenileme ───────────────────────────────────────────

  const visibilityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const run = () => void fetchData()
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return
      if (visibilityDebounceRef.current) clearTimeout(visibilityDebounceRef.current)
      visibilityDebounceRef.current = setTimeout(() => {
        visibilityDebounceRef.current = null
        run()
      }, 400)
    }
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) run()
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pageshow", onPageShow as EventListener)
    return () => {
      if (visibilityDebounceRef.current) clearTimeout(visibilityDebounceRef.current)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pageshow", onPageShow as EventListener)
    }
  }, [fetchData])

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
