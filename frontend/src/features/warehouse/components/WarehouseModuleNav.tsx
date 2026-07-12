"use client"

import React, { useEffect, useState } from "react"
import { PackageSearch } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAuthStore } from "@/store/useAuthStore"
import {
  filterWarehouseTabsByPermission,
  type WarehouseExtendedTab,
} from "@/config/moduleNav/warehouseNavConfig"

export type { WarehouseExtendedTab }

export type WarehouseNavTab = {
  key: WarehouseExtendedTab
  label: string
  shortLabel: string
  icon: React.ElementType
  color: string
}

function useWarehouseNavTabs(): WarehouseNavTab[] {
  const t = useTranslations("warehouse.nav.tabs")
  const tRc = useTranslations("warehouse_return_cancel.nav")
  const user = useAuthStore((s) => s.user)
  return filterWarehouseTabsByPermission(user?.permissions, user?.is_superuser).map((m) => ({
    ...m,
    label: m.key === "return_cancel_reports" ? tRc("tabLabel") : t(`${m.key}.label`),
    shortLabel: m.key === "return_cancel_reports" ? tRc("tabShort") : t(`${m.key}.short`),
  }))
}

function useIsMdUpForTooltip() {
  const [isMdUp, setIsMdUp] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    const sync = () => setIsMdUp(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return isMdUp
}

function TabDivider({ variant }: { variant: "horizontal" | "vertical" }) {
  if (variant === "vertical") {
    return (
      <div
        className="my-1 h-px w-full shrink-0 bg-muted"
        aria-hidden
      />
    )
  }
  return (
    <div
      className="mx-2 h-7 w-px shrink-0 bg-slate-200 dark:bg-slate-600"
      aria-hidden
    />
  )
}

type NavButtonProps = {
  tab: WarehouseNavTab
  isActive: boolean
  pendingCount: number
  onSelect: (key: WarehouseExtendedTab) => void
  variant: "horizontal" | "vertical"
  isMdUp: boolean
}

const sidebarNavItemBase =
  "relative flex shrink-0 items-center gap-3 rounded-xl text-xs font-ui-medium transition-all group outline-none"
const sidebarActiveBar =
  "absolute left-1.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"

function WarehouseNavButton({
  tab,
  isActive,
  pendingCount,
  onSelect,
  variant,
  isMdUp,
}: NavButtonProps) {
  const { key, label, shortLabel, icon: Icon, color } = tab
  const isVertical = variant === "vertical"
  const showBadge = key === "deficiency_reports" && pendingCount > 0

  const badge = showBadge ? (
    <span
      className={cn(
        "flex min-h-[18px] min-w-[14px] shrink-0 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1.5 text-2xs font-ui-bold text-white dark:border-[#020817]",
        isVertical && "ml-auto"
      )}
    >
      {pendingCount}
    </span>
  ) : null

  const labelBlock = isVertical ? (
    <span className="min-w-0 flex-1 truncate text-left">{label}</span>
  ) : (
    <>
      <span className="md:hidden">{shortLabel}</span>
      <span className="hidden md:inline">{label}</span>
    </>
  )

  const buttonClass = cn(
    isVertical
      ? cn(
          sidebarNavItemBase,
          "w-full justify-start px-3 py-2",
          isActive
            ? "bg-blue-50 font-ui-semibold text-blue-600 dark:bg-blue-600/10 dark:text-blue-400"
            : "text-muted-foreground hover:bg-slate-100 hover:text-slate-900 dark:text-muted-foreground dark:hover:bg-slate-800/30 dark:hover:text-slate-200"
        )
      : cn(
          "relative flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-ui font-ui-medium transition-colors sm:gap-3",
          isActive
            ? "border-blue-600 bg-blue-50/30 font-ui-semibold text-blue-600 dark:border-blue-400 dark:bg-blue-900/10 dark:text-blue-400"
            : "border-transparent text-muted-foreground hover:border-slate-300 hover:text-slate-700 dark:text-muted-foreground dark:hover:border-slate-600 dark:hover:text-slate-200"
        )
  )

  const iconSize = isVertical ? 18 : 16
  const iconClass = isVertical
    ? cn(
        "shrink-0 transition-colors",
        isActive
          ? "text-blue-500"
          : "text-muted-foreground group-hover:text-slate-600 dark:text-muted-foreground dark:group-hover:text-slate-300"
      )
    : cn("shrink-0", isActive ? color : "text-muted-foreground")

  const inner = (
    <>
      {isVertical && isActive ? <span className={sidebarActiveBar} aria-hidden /> : null}
      <Icon size={iconSize} className={iconClass} aria-hidden />
      {labelBlock}
      {badge}
    </>
  )

  if (isVertical || isMdUp) {
    return (
      <button
        type="button"
        aria-label={label}
        aria-current={isActive ? "page" : undefined}
        onClick={() => onSelect(key)}
        className={buttonClass}
      >
        {inner}
      </button>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onSelect(key)}
            className={buttonClass}
          >
            {inner}
          </button>
        }
      />
      <TooltipContent side="bottom" sideOffset={6} className="max-w-xs text-xs font-ui-normal">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export type WarehouseModuleNavProps = {
  activeTab: WarehouseExtendedTab
  onSelect: (key: WarehouseExtendedTab) => void
  pendingCount: number
}

export function WarehouseModuleNavHorizontal({
  activeTab,
  onSelect,
  pendingCount,
}: WarehouseModuleNavProps) {
  const isMdUp = useIsMdUpForTooltip()
  const tabs = useWarehouseNavTabs()

  const items: React.ReactNode[] = []
  tabs.forEach((tab, i) => {
    if (i === 1 || i === 5) {
      items.push(<TabDivider key={`d-${i}`} variant="horizontal" />)
    }
    items.push(
      <WarehouseNavButton
        key={tab.key}
        tab={tab}
        isActive={activeTab === tab.key}
        pendingCount={pendingCount}
        onSelect={onSelect}
        variant="horizontal"
        isMdUp={isMdUp}
      />
    )
  })

  const tNav = useTranslations("warehouse.nav")

  return (
    <TooltipProvider delay={300}>
      <nav
        className={cn(
          "flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto overflow-y-hidden pb-px [-webkit-overflow-scrolling:touch]",
          "scrollbar-thin"
        )}
        aria-label={tNav("aria")}
      >
        {items}
        <TabDivider variant="horizontal" />
        <Link
          href="/inventory"
          className="relative flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2 text-ui font-ui-medium transition-colors sm:gap-3 text-muted-foreground hover:border-slate-300 hover:text-slate-700 dark:text-muted-foreground dark:hover:border-slate-600 dark:hover:text-slate-200"
        >
          <PackageSearch size={16} className="shrink-0 text-muted-foreground" aria-hidden />
          <span className="md:hidden">{tNav("inventoryShort")}</span>
          <span className="hidden md:inline">{tNav("inventoryMgmt")}</span>
        </Link>
      </nav>
    </TooltipProvider>
  )
}

export function WarehouseModuleNavVertical({
  activeTab,
  onSelect,
  pendingCount,
}: WarehouseModuleNavProps) {
  const tabs = useWarehouseNavTabs()
  const tNav = useTranslations("warehouse.nav")

  const items: React.ReactNode[] = []
  tabs.forEach((tab, i) => {
    if (i === 1 || i === 5) {
      items.push(<TabDivider key={`dv-${i}`} variant="vertical" />)
    }
    items.push(
      <WarehouseNavButton
        key={tab.key}
        tab={tab}
        isActive={activeTab === tab.key}
        pendingCount={pendingCount}
        onSelect={onSelect}
        variant="vertical"
        isMdUp
      />
    )
  })

  return (
    <aside
      className={cn(
        "hidden w-56 shrink-0 flex-col border-r border-border bg-white dark:border-slate-900 dark:bg-[#020817]",
        "lg:flex"
      )}
      aria-label={tNav("aria")}
    >
      <nav className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden px-3 py-4 scrollbar-thin">
        {items}
      </nav>
      <div className="p-3 border-t border-border">
        <Link
          href="/inventory"
          className="relative flex shrink-0 items-center gap-3 rounded-xl text-xs font-ui-medium transition-all group outline-none w-full justify-start px-3 py-2 text-muted-foreground hover:bg-slate-100 hover:text-slate-900 dark:text-muted-foreground dark:hover:bg-slate-800/30 dark:hover:text-slate-200"
        >
          <PackageSearch size={18} className="shrink-0 transition-colors text-muted-foreground group-hover:text-slate-600 dark:text-muted-foreground dark:group-hover:text-slate-300" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">{tNav("inventoryMgmt")}</span>
        </Link>
      </div>
    </aside>
  )
}
