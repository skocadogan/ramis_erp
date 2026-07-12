"use client"

import { useMemo } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useAuthStore } from "@/store/useAuthStore"
import {
  collectNavSearchEntryDefs,
  matchNavSearchItems,
  resolveNavSearchItems,
  type ResolvedNavSearchItem,
} from "../utils/navSearch"

/**
 * Sidebar + modül sekmeleri için client-side navigasyon araması.
 * RBAC filtreli; aktif locale ile eşleştirir.
 */
export function useNavSearch(query: string): ResolvedNavSearchItem[] {
  const locale = useLocale()
  const user = useAuthStore((s) => s.user)

  const tNav = useTranslations("common.nav")
  const tInventory = useTranslations("inventory")
  const tWarehouse = useTranslations("warehouse.nav.tabs")
  const tWarehouseRc = useTranslations("warehouse_return_cancel.nav")
  const tPerformances = useTranslations("performances")
  const tPrep = useTranslations("prep")
  const tProduction = useTranslations("production")

  const allItems = useMemo(() => {
    const defs = collectNavSearchEntryDefs(user?.permissions, user?.is_superuser)
    return resolveNavSearchItems(defs, {
      tNav,
      tInventory,
      tWarehouse,
      tWarehouseRc,
      tPerformances,
      tPrep,
      tProduction,
    })
  }, [
    user?.permissions,
    user?.is_superuser,
    tNav,
    tInventory,
    tWarehouse,
    tWarehouseRc,
    tPerformances,
    tPrep,
    tProduction,
  ])

  return useMemo(
    () => matchNavSearchItems(allItems, query, locale),
    [allItems, query, locale],
  )
}
