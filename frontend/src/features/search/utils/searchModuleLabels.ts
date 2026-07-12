/** Backend search registry modül key'leri — i18n ile senkron tutulmalı. */
export const SEARCH_MODULE_KEYS = [
  "menu_products",
  "menu_categories",
  "orders",
  "inventory_items",
  "inventory_suppliers",
  "branches",
  "tables",
  "users",
  "customers",
  "warehouses",
  "purchase_orders",
  "deficiency_reports",
  "goods_receivings",
  "transfers",
  "stock_countings",
  "reservations",
  "invoices",
  "recipes",
  "sales",
] as const

export type SearchModuleKey = (typeof SEARCH_MODULE_KEYS)[number]

type ModuleTranslator = {
  (key: string): string
  has?: (key: string) => boolean
}

function readModuleField(
  t: ModuleTranslator,
  moduleKey: string,
  field: "label" | "badge",
  fallback?: string,
): string | undefined {
  const path = `${moduleKey}.${field}`
  if (t.has && !t.has(path)) {
    return fallback
  }
  try {
    const value = t(path)
    if (!value || value === path || value === `globalSearch.modules.${path}`) {
      return fallback
    }
    return value
  } catch {
    return fallback
  }
}

export function getSearchModuleLabel(
  moduleKey: string,
  apiFallback: string,
  t: ModuleTranslator,
): string {
  return readModuleField(t, moduleKey, "label", apiFallback) ?? apiFallback
}

export function getSearchModuleBadge(
  moduleKey: string,
  t: ModuleTranslator,
): string | undefined {
  return readModuleField(t, moduleKey, "badge")
}
