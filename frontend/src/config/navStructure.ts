import type React from "react"
import {
  BarChart3,
  Users,
  MapPin,
  Lock,
  Package,
  ChefHat,
  UtensilsCrossed,
  Utensils,
  ShoppingBag,
  ArchiveRestore,
  Monitor,
  LayoutGrid,
  CalendarClock,
  TrendingUp,
  Settings2,
  Warehouse,
  LayoutDashboard,
  Wallet,
  FileText,
  Printer,
  ClipboardList,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react"
import { hasPermission, type ModuleKey, type OperationalShortcutKey } from "@/lib/constants"

export interface NavItem {
  labelKey: string
  icon: React.ElementType
  href: string
  matchPath?: string
  matchTab?: string
  moduleKey?: ModuleKey
  operationalKey?: OperationalShortcutKey
  badge?: number
}

interface NavSubGroup {
  labelKey: string
  items: NavItem[]
}

export interface NavGroup {
  labelKey: string
  icon: React.ElementType
  items: NavItem[]
  subGroups?: NavSubGroup[]
}

/** Sidebar menü ağacı — tek kaynak (AppSidebar + Hızlı Arama). */
export const NAV_STRUCTURE = {
  overview: {
    labelKey: "overview",
    icon: BarChart3,
    href: "/panel?tab=overview",
    matchPath: "/panel",
    matchTab: "overview",
    moduleKey: "overview",
  } as NavItem,

  definitions: {
    labelKey: "definitions",
    icon: Settings2,
    items: [
      { labelKey: "users", icon: Users, href: "/panel?tab=users", matchPath: "/panel", matchTab: "users", operationalKey: "users" },
      { labelKey: "rolesPermissions", icon: Lock, href: "/panel?tab=roles", matchPath: "/panel", matchTab: "roles", operationalKey: "roles" },
      { labelKey: "branches", icon: MapPin, href: "/panel?tab=branches", matchPath: "/panel", matchTab: "branches", operationalKey: "branches" },
      { labelKey: "posSettings", icon: Monitor, href: "/panel?tab=pos_settings", matchPath: "/panel", matchTab: "pos_settings", operationalKey: "pos_settings" },
      { labelKey: "kitchenStations", icon: ChefHat, href: "/panel?tab=stations", matchPath: "/panel", matchTab: "stations", operationalKey: "stations" },
      { labelKey: "printers", icon: Printer, href: "/panel?tab=printers", matchPath: "/panel", matchTab: "printers", operationalKey: "printing" },
      { labelKey: "cashierPins", icon: Lock, href: "/panel?tab=cashier_pins", matchPath: "/panel", matchTab: "cashier_pins", operationalKey: "cashier_pins" },
      { labelKey: "waiterAssignments", icon: Utensils, href: "/panel?tab=waiter_assignments", matchPath: "/panel", matchTab: "waiter_assignments", operationalKey: "waiter_assignments" },
      { labelKey: "cookAssignments", icon: ChefHat, href: "/panel?tab=cook_assignments", matchPath: "/panel", matchTab: "cook_assignments", operationalKey: "cook_assignments" },
      { labelKey: "managerAssignments", icon: Lock, href: "/panel?tab=manager_assignments", matchPath: "/panel", matchTab: "manager_assignments", operationalKey: "manager_assignments" },
      { labelKey: "reportTemplates", icon: FileText, href: "/panel?tab=reporting", matchPath: "/panel", matchTab: "reporting", operationalKey: "reporting" },
      { labelKey: "surveys", icon: ClipboardList, href: "/panel?tab=surveys", matchPath: "/panel", matchTab: "surveys", moduleKey: "surveys" },
      { labelKey: "allergens", icon: ShieldAlert, href: "/allergens", matchPath: "/allergens", moduleKey: "allergens" },
    ],
    subGroups: [
      {
        labelKey: "defSubgroupUsers",
        items: [
          { labelKey: "users", icon: Users, href: "/panel?tab=users", matchPath: "/panel", matchTab: "users", operationalKey: "users" },
          { labelKey: "rolesPermissions", icon: Lock, href: "/panel?tab=roles", matchPath: "/panel", matchTab: "roles", operationalKey: "roles" },
        ],
      },
      {
        labelKey: "defSubgroupStore",
        items: [
          { labelKey: "branches", icon: MapPin, href: "/panel?tab=branches", matchPath: "/panel", matchTab: "branches", operationalKey: "branches" },
          { labelKey: "posSettings", icon: Monitor, href: "/panel?tab=pos_settings", matchPath: "/panel", matchTab: "pos_settings", operationalKey: "pos_settings" },
          { labelKey: "kitchenStations", icon: ChefHat, href: "/panel?tab=stations", matchPath: "/panel", matchTab: "stations", operationalKey: "stations" },
          { labelKey: "printers", icon: Printer, href: "/panel?tab=printers", matchPath: "/panel", matchTab: "printers", operationalKey: "printing" },
          { labelKey: "cashierPins", icon: Lock, href: "/panel?tab=cashier_pins", matchPath: "/panel", matchTab: "cashier_pins", operationalKey: "cashier_pins" },
        ],
      },
      {
        labelKey: "defSubgroupStaff",
        items: [
          { labelKey: "waiterAssignments", icon: Utensils, href: "/panel?tab=waiter_assignments", matchPath: "/panel", matchTab: "waiter_assignments", operationalKey: "waiter_assignments" },
          { labelKey: "cookAssignments", icon: ChefHat, href: "/panel?tab=cook_assignments", matchPath: "/panel", matchTab: "cook_assignments", operationalKey: "cook_assignments" },
          { labelKey: "managerAssignments", icon: Lock, href: "/panel?tab=manager_assignments", matchPath: "/panel", matchTab: "manager_assignments", operationalKey: "manager_assignments" },
        ],
      },
      {
        labelKey: "defSubgroupReports",
        items: [
          { labelKey: "reportTemplates", icon: FileText, href: "/panel?tab=reporting", matchPath: "/panel", matchTab: "reporting", operationalKey: "reporting" },
          { labelKey: "surveys", icon: ClipboardList, href: "/panel?tab=surveys", matchPath: "/panel", matchTab: "surveys", moduleKey: "surveys" },
          { labelKey: "allergens", icon: ShieldAlert, href: "/allergens", matchPath: "/allergens", moduleKey: "allergens" },
        ],
      },
    ],
  } as NavGroup,

  restaurant: {
    labelKey: "restaurant",
    icon: Utensils,
    items: [
      { labelKey: "restaurantSummary", icon: LayoutDashboard, href: "/dashboard", matchPath: "/dashboard", moduleKey: "dashboard" },
      { labelKey: "tables", icon: LayoutGrid, href: "/tables", matchPath: "/tables", moduleKey: "tables" },
      { labelKey: "menuManagement", icon: UtensilsCrossed, href: "/menu-management", matchPath: "/menu-management", operationalKey: "menu" },
      { labelKey: "reservations", icon: CalendarClock, href: "/reservations", matchPath: "/reservations", moduleKey: "reservations" },
      { labelKey: "credit", icon: Wallet, href: "/credit", matchPath: "/credit", moduleKey: "credit" },
      { labelKey: "shiftCashier", icon: Wallet, href: "/shifts", matchPath: "/shifts", operationalKey: "shifts" },
      { labelKey: "sales", icon: TrendingUp, href: "/sales", matchPath: "/sales", moduleKey: "sales" },
      { labelKey: "customers", icon: Users, href: "/customers", matchPath: "/customers", moduleKey: "customers" },
      { labelKey: "invoices", icon: FileText, href: "/invoices", matchPath: "/invoices", moduleKey: "invoices" },
    ],
  } as NavGroup,

  stockWarehouse: {
    labelKey: "stockWarehouse",
    icon: Warehouse,
    items: [
      { labelKey: "inventoryManagement", icon: Package, href: "/inventory", matchPath: "/inventory", operationalKey: "inventory" },
      { labelKey: "warehouseManagement", icon: Warehouse, href: "/warehouse", matchPath: "/warehouse", operationalKey: "warehouse" },
    ],
  } as NavGroup,

  personnel: {
    labelKey: "personnel",
    icon: Users,
    items: [
      { labelKey: "performanceManagement", icon: BarChart3, href: "/performances", matchPath: "/performances", moduleKey: "performances" },
    ],
  } as NavGroup,

  kitchen: {
    labelKey: "kitchen",
    icon: ChefHat,
    items: [
      { labelKey: "recipes", icon: ChefHat, href: "/recipes", matchPath: "/recipes", operationalKey: "recipes" },
      { labelKey: "productionPlanning", icon: ClipboardList, href: "/production-planning", matchPath: "/production-planning", operationalKey: "production_planning" },
      { labelKey: "prepManagement", icon: ClipboardList, href: "/prep-management", matchPath: "/prep-management", moduleKey: "prep" },
    ],
  } as NavGroup,

  independent: [
    { labelKey: "kds", icon: Monitor, href: "/kds", matchPath: "/kds", moduleKey: "kds" },
    { labelKey: "pos", icon: ShoppingBag, href: "/pos", matchPath: "/pos", moduleKey: "pos" },
    { labelKey: "waiter", icon: Utensils, href: "/waiter", matchPath: "/waiter", moduleKey: "waiter" },
  ] as NavItem[],

  system: {
    labelKey: "system",
    icon: Settings2,
    items: [
      { labelKey: "auditLogs", icon: ShieldCheck, href: "/panel?tab=audit", matchPath: "/panel", matchTab: "audit", operationalKey: "audit" },
      { labelKey: "recycleBin", icon: ArchiveRestore, href: "/recycle-bin", matchPath: "/recycle-bin", operationalKey: "users" },
    ],
  } as NavGroup,
}

/** Sidebar ile aynı RBAC kontrolü. */
export function canAccessNavItem(
  item: Pick<NavItem, "moduleKey" | "operationalKey">,
  userPermissions: string[] | undefined,
  isSuperuser: boolean | undefined,
  hasModuleAccess: (p: string[] | undefined, s: boolean | undefined, m: ModuleKey | string) => boolean,
  hasOperationalManageAccess: (p: string[] | undefined, s: boolean | undefined, k: OperationalShortcutKey) => boolean,
): boolean {
  if (item.moduleKey === "surveys") {
    return hasPermission(userPermissions, isSuperuser, "surveys.manage_survey")
  }
  if (item.moduleKey) return hasModuleAccess(userPermissions, isSuperuser, item.moduleKey)
  if (item.operationalKey) return hasOperationalManageAccess(userPermissions, isSuperuser, item.operationalKey)
  return true
}

export interface SidebarNavSearchSource {
  id: string
  labelKey: string
  groupLabelKey: string
  href: string
  moduleKey?: ModuleKey
  operationalKey?: OperationalShortcutKey
}

/** Sidebar öğelerini arama için düzleştirir; href ile dedupe eder. */
export function collectSidebarNavSearchSources(): SidebarNavSearchSource[] {
  const seen = new Set<string>()
  const result: SidebarNavSearchSource[] = []

  const add = (item: NavItem, groupLabelKey: string) => {
    if (seen.has(item.href)) return
    seen.add(item.href)
    result.push({
      id: `sidebar:${item.href}`,
      labelKey: item.labelKey,
      groupLabelKey,
      href: item.href,
      moduleKey: item.moduleKey,
      operationalKey: item.operationalKey,
    })
  }

  add(NAV_STRUCTURE.overview, "overview")

  const definitions = NAV_STRUCTURE.definitions
  const defItems = definitions.subGroups
    ? definitions.subGroups.flatMap((sg) => sg.items)
    : definitions.items
  for (const item of defItems) {
    add(item, definitions.labelKey)
  }

  const groups: NavGroup[] = [
    NAV_STRUCTURE.restaurant,
    NAV_STRUCTURE.stockWarehouse,
    NAV_STRUCTURE.personnel,
    NAV_STRUCTURE.kitchen,
    NAV_STRUCTURE.system,
  ]
  for (const group of groups) {
    for (const item of group.items) {
      add(item, group.labelKey)
    }
  }

  for (const item of NAV_STRUCTURE.independent) {
    add(item, "independent")
  }

  return result
}
