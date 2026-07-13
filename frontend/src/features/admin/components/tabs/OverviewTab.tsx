"use client"

import {
  MapPin,
  Lock,
  Package,
  ChefHat,
  UtensilsCrossed,
  ShoppingBag,
  AlertTriangle,
  Users,
  Monitor,
  TrendingUp,
  BookOpen,
} from "lucide-react"
import { useTranslations } from "next-intl"
import type { ElementType } from "react"
import { hasModuleAccess, type ModuleKey } from "@/lib/constants"
import type { StockItem } from "@/features/admin/components/tabs/InventoryTab"
import type { AdminTab } from "@/features/admin/hooks/useAdminData"

/** Genel bakış kartlarının yönlendirdiği sekmeler */
type OverviewNavTab = Exclude<AdminTab, "overview">

interface OverviewStats {
  users: number
  stations: number
  branches: number
  roles: number
  stockItems: number
  lowStock: number
  recipes: number
  categories: number
  products: number
  pendingOrders: number
  totalOrders: number
  sales: number
}

interface OverviewTabProps {
  stats: OverviewStats
  stockItems: StockItem[]
  setActiveTab: (tab: AdminTab) => void
  userPermissions?: string[]
  is_superuser?: boolean
}

export function OverviewTab({ stats, stockItems, setActiveTab, userPermissions, is_superuser }: OverviewTabProps) {
  const t = useTranslations("admin")
  const canSee = (module: ModuleKey) => hasModuleAccess(userPermissions, is_superuser, module)

  const statCards: Array<{
    module: ModuleKey
    tab: OverviewNavTab
    icon: ElementType
    label: string
    /** Sayısal özet; null = gösterim "—" (ör. POS ayarları) */
    value: number | null
    iconBg: string
    alert?: string
  }> = [
    {
      module: "users",
      tab: "users",
      icon: Users,
      label: t('overview.stats.users'),
      value: stats.users,
      iconBg: "bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400",
    },
    {
      module: "branches",
      tab: "branches",
      icon: MapPin,
      label: t('overview.stats.branches'),
      value: stats.branches,
      iconBg: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
    },
    {
      module: "stations",
      tab: "stations",
      icon: ChefHat,
      label: t('overview.stats.stations'),
      value: stats.stations,
      iconBg: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400",
    },
    {
      module: "roles",
      tab: "roles",
      icon: Lock,
      label: t('overview.stats.roles'),
      value: stats.roles,
      iconBg: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
    },
    {
      module: "inventory",
      tab: "inventory",
      icon: Package,
      label: t('overview.stats.inventory'),
      value: stats.stockItems,
      iconBg: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
      alert: stats.lowStock > 0 ? t('overview.alerts.lowStock', { count: stats.lowStock }) : undefined,
    },
    {
      module: "recipes",
      tab: "recipes",
      icon: BookOpen,
      label: t('overview.stats.recipes'),
      value: stats.recipes,
      iconBg: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400",
    },
    {
      module: "menu",
      tab: "menu",
      icon: UtensilsCrossed,
      label: t('overview.stats.categories'),
      value: stats.categories,
      iconBg: "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400",
    },
    {
      module: "menu",
      tab: "menu",
      icon: UtensilsCrossed,
      label: t('overview.stats.products'),
      value: stats.products,
      iconBg: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400",
    },
    {
      module: "orders",
      tab: "orders",
      icon: ShoppingBag,
      label: t('overview.stats.pendingOrders'),
      value: stats.pendingOrders,
      iconBg: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
      alert: stats.pendingOrders > 0 ? t('overview.alerts.inProgress') : undefined,
    },
    {
      module: "sales",
      tab: "sales",
      icon: TrendingUp,
      label: t('overview.stats.sales'),
      value: stats.sales,
      iconBg: "bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400",
    },
    {
      module: "pos_settings",
      tab: "pos_settings",
      icon: Monitor,
      label: t('overview.stats.posDisplay'),
      value: null,
      iconBg: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400",
    },
  ]

  const visibleCards = statCards.filter((c) => canSee(c.module))
  const showLowStockPanel = canSee("inventory") && stats.lowStock > 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('overview.title')}</h2>
        <p className="text-sm text-muted-foreground mt-0.5 dark:text-muted-foreground">
          {t('overview.description')}
        </p>
      </div>

      {visibleCards.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-4 py-8 text-center bg-card border-border dark:text-muted-foreground">
          {t('overview.noAccess')}
        </p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {visibleCards.map((c) => (
            <button
              key={`${c.tab}-${c.module}-${c.label}`}
              type="button"
              onClick={() => setActiveTab(c.tab)}
              className="flex flex-col items-start gap-3 rounded-lg border border-border p-4 hover: transition-all text-left bg-card border-border dark:hover:"
            >
              <div className={`rounded-md p-2 ${c.iconBg}`}>
                <c.icon size={18} />
              </div>
              <div>
                <div className="text-xl font-semibold text-foreground">
                  {c.value === null ? "—" : c.value}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 dark:text-muted-foreground">{c.label}</div>
                {c.alert ? (
                  <div className="text-2xs font-medium text-red-600 mt-1 dark:text-red-400">{c.alert}</div>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}

      {showLowStockPanel ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 dark:bg-red-900/20 dark:border-red-800">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} className="text-red-600 dark:text-red-400" />
            <span className="text-sm font-semibold text-red-800 dark:text-red-300">{t('overview.alerts.lowStockWarning')}</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {stockItems
              .filter((s) => s.is_low_stock)
              .slice(0, 6)
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-sm bg-card"
                >
                  <span className="font-medium text-foreground">{item.name}</span>
                  <span className="text-red-600 font-semibold dark:text-red-400">
                    {item.current_quantity.toFixed(1)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
