import { hasModuleAccess, hasOperationalManageAccess } from "@/lib/constants"
import {
  canAccessNavItem,
  collectSidebarNavSearchSources,
  type SidebarNavSearchSource,
} from "@/config/navStructure"
import { INVENTORY_NAV_SEARCH } from "@/config/moduleNav/inventoryNavConfig"
import {
  WAREHOUSE_NAV_SEARCH,
  filterWarehouseTabsByPermission,
} from "@/config/moduleNav/warehouseNavConfig"
import { PERFORMANCES_NAV_SEARCH } from "@/config/moduleNav/performancesNavConfig"
import { PREP_NAV_SEARCH } from "@/config/moduleNav/prepNavConfig"
import { PRODUCTION_NAV_SEARCH } from "@/config/moduleNav/productionNavConfig"
import type { ModuleKey, OperationalShortcutKey } from "@/lib/constants"

export const MIN_NAV_QUERY_LENGTH = 2

export type NavSearchEntryDef = {
  id: string
  href: string
  titleKey: string
  titleNs: "common.nav" | "inventory" | "warehouse.nav.tabs" | "warehouse_return_cancel.nav" | "performances" | "prep" | "production"
  subtitleKey: string
  subtitleNs: "common.nav"
  keywordKeys?: { key: string; ns: NavSearchEntryDef["titleNs"] }[]
  moduleKey?: ModuleKey
  operationalKey?: OperationalShortcutKey
}

function canAccessEntry(
  entry: Pick<NavSearchEntryDef, "moduleKey" | "operationalKey">,
  userPermissions: string[] | undefined,
  isSuperuser: boolean | undefined,
): boolean {
  return canAccessNavItem(
    entry,
    userPermissions,
    isSuperuser,
    hasModuleAccess,
    hasOperationalManageAccess,
  )
}

function collectModuleTabEntries(): NavSearchEntryDef[] {
  const entries: NavSearchEntryDef[] = []

  for (const tab of INVENTORY_NAV_SEARCH.tabs) {
    entries.push({
      id: `inventory:${tab.key}`,
      href: tab.href,
      titleKey: tab.labelKey,
      titleNs: "inventory",
      subtitleKey: INVENTORY_NAV_SEARCH.parentLabelKey,
      subtitleNs: "common.nav",
      keywordKeys: tab.shortLabelKey
        ? [{ key: tab.shortLabelKey, ns: "inventory" }]
        : undefined,
      operationalKey: INVENTORY_NAV_SEARCH.operationalKey,
    })
  }

  for (const tabMeta of filterWarehouseTabsByPermission(undefined, true)) {
    const tabKey = tabMeta.key
    const isReturnCancel = tabKey === "return_cancel_reports"
    entries.push({
      id: `warehouse:${tabKey}`,
      href: `/warehouse?tab=${tabKey}`,
      titleKey: isReturnCancel ? "tabLabel" : `${tabKey}.label`,
      titleNs: isReturnCancel ? "warehouse_return_cancel.nav" : "warehouse.nav.tabs",
      subtitleKey: WAREHOUSE_NAV_SEARCH.parentLabelKey,
      subtitleNs: "common.nav",
      keywordKeys: isReturnCancel
        ? [{ key: "tabShort", ns: "warehouse_return_cancel.nav" }]
        : [{ key: `${tabKey}.short`, ns: "warehouse.nav.tabs" }],
      operationalKey: WAREHOUSE_NAV_SEARCH.operationalKey,
    })
  }

  for (const tab of PERFORMANCES_NAV_SEARCH.tabs) {
    entries.push({
      id: `performances:${tab.key}`,
      href: tab.href,
      titleKey: tab.labelKey,
      titleNs: "performances",
      subtitleKey: PERFORMANCES_NAV_SEARCH.parentLabelKey,
      subtitleNs: "common.nav",
      moduleKey: PERFORMANCES_NAV_SEARCH.moduleKey,
    })
  }

  for (const tab of PREP_NAV_SEARCH.tabs) {
    entries.push({
      id: `prep:${tab.key}`,
      href: tab.href,
      titleKey: tab.labelKey,
      titleNs: "prep",
      subtitleKey: PREP_NAV_SEARCH.parentLabelKey,
      subtitleNs: "common.nav",
      moduleKey: PREP_NAV_SEARCH.moduleKey,
    })
  }

  for (const tab of PRODUCTION_NAV_SEARCH.tabs) {
    entries.push({
      id: `production:${tab.key}`,
      href: tab.href,
      titleKey: tab.labelKey,
      titleNs: "production",
      subtitleKey: PRODUCTION_NAV_SEARCH.parentLabelKey,
      subtitleNs: "common.nav",
      operationalKey: PRODUCTION_NAV_SEARCH.operationalKey,
    })
  }

  return entries
}

function sidebarSourceToEntry(source: SidebarNavSearchSource): NavSearchEntryDef {
  return {
    id: source.id,
    href: source.href,
    titleKey: source.labelKey,
    titleNs: "common.nav",
    subtitleKey: source.groupLabelKey === "independent" ? source.labelKey : source.groupLabelKey,
    subtitleNs: "common.nav",
    moduleKey: source.moduleKey,
    operationalKey: source.operationalKey,
  }
}

/** RBAC filtreli ham navigasyon arama girdileri. */
export function collectNavSearchEntryDefs(
  userPermissions: string[] | undefined,
  isSuperuser: boolean | undefined,
): NavSearchEntryDef[] {
  const sidebar = collectSidebarNavSearchSources().map(sidebarSourceToEntry)
  const tabs = collectModuleTabEntries()

  const warehouseTabIds = new Set(
    filterWarehouseTabsByPermission(userPermissions, isSuperuser).map((t) => `warehouse:${t.key}`),
  )

  const all = [...sidebar, ...tabs]

  return all.filter((entry) => {
    if (!canAccessEntry(entry, userPermissions, isSuperuser)) return false
    if (entry.id.startsWith("warehouse:") && !warehouseTabIds.has(entry.id)) return false
    return true
  })
}

export type ResolvedNavSearchItem = {
  id: string
  title: string
  subtitle: string
  href: string
  searchText: string
}

type TranslateFn = (key: string) => string

const NS_TRANSLATORS: Record<
  NavSearchEntryDef["titleNs"],
  (translators: NavSearchTranslators) => TranslateFn
> = {
  "common.nav": (t) => (key) => t.tNav(key),
  inventory: (t) => (key) => t.tInventory(key),
  "warehouse.nav.tabs": (t) => (key) => t.tWarehouse(key),
  "warehouse_return_cancel.nav": (t) => (key) => t.tWarehouseRc(key),
  performances: (t) => (key) => t.tPerformances(key),
  prep: (t) => (key) => t.tPrep(key),
  production: (t) => (key) => t.tProduction(key),
}

export type NavSearchTranslators = {
  tNav: (key: string) => string
  tInventory: (key: string) => string
  tWarehouse: (key: string) => string
  tWarehouseRc: (key: string) => string
  tPerformances: (key: string) => string
  tPrep: (key: string) => string
  tProduction: (key: string) => string
}

function resolveEntry(
  entry: NavSearchEntryDef,
  translators: NavSearchTranslators,
): ResolvedNavSearchItem {
  const titleT = NS_TRANSLATORS[entry.titleNs](translators)
  const subtitleT = NS_TRANSLATORS[entry.subtitleNs](translators)
  const title = titleT(entry.titleKey)
  const subtitle = subtitleT(entry.subtitleKey)
  const keywordParts = (entry.keywordKeys ?? []).map((kw) =>
    NS_TRANSLATORS[kw.ns](translators)(kw.key),
  )
  const searchText = [title, subtitle, ...keywordParts].join(" ")
  return { id: entry.id, title, subtitle, href: entry.href, searchText }
}

export function resolveNavSearchItems(
  defs: NavSearchEntryDef[],
  translators: NavSearchTranslators,
): ResolvedNavSearchItem[] {
  return defs.map((d) => resolveEntry(d, translators))
}

/** Locale-aware metin eşleştirmesi (min 2 karakter). */
export function matchNavSearchItems(
  items: ResolvedNavSearchItem[],
  query: string,
  locale: string,
): ResolvedNavSearchItem[] {
  const trimmed = query.trim()
  if (trimmed.length < MIN_NAV_QUERY_LENGTH) return []
  const q = trimmed.toLocaleLowerCase(locale)
  return items.filter((item) => item.searchText.toLocaleLowerCase(locale).includes(q))
}
