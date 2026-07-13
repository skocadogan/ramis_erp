"use client"

import React from "react"
import { PackageSearch } from "lucide-react"
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
  useIsMdUpForTooltip,
  TabDivider,
  sidebarNavItemBase,
  sidebarActiveBar,
  horizontalNavContainer,
  horizontalTabActive,
  horizontalTabInactive,
  verticalNavItemActive,
  verticalNavItemInactive,
  verticalIconInactive,
  HorizontalTooltipLink,
  VerticalTooltipLink,
} from "@/components/shared/ModuleNav"
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

type NavButtonProps = {
  tab: WarehouseNavTab
  isActive: boolean
  pendingCount: number
  onSelect: (key: WarehouseExtendedTab) => void
  variant: "horizontal" | "vertical"
  isMdUp: boolean
}

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
        "flex min-h-[18px] min-w-[14px] shrink-0 items-center justify-center rounded-full border-2 border-background bg-destructive px-1.5 text-2xs font-bold text-destructive-foreground",
        isVertical && "ml-auto",
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
          isActive ? verticalNavItemActive : verticalNavItemInactive,
        )
      : cn(
          "relative flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-ui font-medium transition-colors sm:gap-3",
          isActive ? horizontalTabActive : horizontalTabInactive,
        ),
  )

  const iconSize = isVertical ? 18 : 16
  const iconClass = isVertical
    ? cn(
        "shrink-0 transition-colors",
        isActive ? "text-primary" : verticalIconInactive,
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
      <TooltipContent side="bottom" sideOffset={6} className="max-w-xs text-xs font-normal">
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
      <nav className={horizontalNavContainer} aria-label={tNav("aria")}>
        {items}
        <TabDivider variant="horizontal" />
        <HorizontalTooltipLink
          href="/inventory"
          icon={PackageSearch}
          label={tNav("inventoryMgmt")}
          shortLabel={tNav("inventoryShort")}
        />
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
      className="hidden w-56 shrink-0 flex-col border-r border-border bg-card lg:flex"
      aria-label={tNav("aria")}
    >
      <nav className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden px-3 py-4 scrollbar-thin">
        {items}
      </nav>
      <div className="p-3 border-t border-border">
        <VerticalTooltipLink href="/inventory" icon={PackageSearch} label={tNav("inventoryMgmt")} />
      </div>
    </aside>
  )
}
