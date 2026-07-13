"use client"

import React, { useMemo } from "react"
import { Warehouse, ShieldAlert } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
import type { TabType } from "@/features/inventory/types"
import { INVENTORY_TAB_META } from "@/config/moduleNav/inventoryNavConfig"

export type InventoryNavTab = {
  key: TabType
  label: string
  shortLabel: string
  icon: React.ElementType
  color: string
}

function useInventoryNavTabs(): InventoryNavTab[] {
  const t = useTranslations("inventory")
  return useMemo(
    () =>
      INVENTORY_TAB_META.map((tab) => ({
        ...tab,
        label: t(`nav.tabs.${tab.key}.label`),
        shortLabel: t(`nav.tabs.${tab.key}.shortLabel`),
      })),
    [t],
  )
}

type NavButtonProps = {
  tab: InventoryNavTab
  isActive: boolean
  onSelect: (key: TabType) => void
  variant: "horizontal" | "vertical"
  isMdUp: boolean
}

function InventoryNavButton({
  tab,
  isActive,
  onSelect,
  variant,
  isMdUp,
}: NavButtonProps) {
  const { key, label, shortLabel, icon: Icon, color } = tab
  const isVertical = variant === "vertical"

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
          "w-full justify-start px-3 py-1.5",
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

export type InventoryModuleNavProps = {
  activeTab: TabType
  onSelect: (key: TabType) => void
}

export function InventoryModuleNavHorizontal({
  activeTab,
  onSelect,
}: InventoryModuleNavProps) {
  const isMdUp = useIsMdUpForTooltip()
  const t = useTranslations("inventory")
  const navTabs = useInventoryNavTabs()

  const items: React.ReactNode[] = []
  navTabs.forEach((tab) => {
    items.push(
      <InventoryNavButton
        key={tab.key}
        tab={tab}
        isActive={activeTab === tab.key}
        onSelect={onSelect}
        variant="horizontal"
        isMdUp={isMdUp}
      />
    )
  })

  return (
    <TooltipProvider delay={300}>
      <nav className={horizontalNavContainer} aria-label={t("nav.aria")}>
        {items}
      </nav>
      <TabDivider variant="horizontal" />
      <HorizontalTooltipLink
        href="/allergens"
        icon={ShieldAlert}
        label={t("nav.linkAllergens.long")}
        shortLabel={t("nav.linkAllergens.short")}
      />
      <HorizontalTooltipLink
        href="/warehouse"
        icon={Warehouse}
        label={t("nav.linkWarehouse.long")}
        shortLabel={t("nav.linkWarehouse.short")}
      />
    </TooltipProvider>
  )
}

export function InventoryModuleNavVertical({
  activeTab,
  onSelect,
}: InventoryModuleNavProps) {
  const t = useTranslations("inventory")
  const navTabs = useInventoryNavTabs()
  const items: React.ReactNode[] = []
  navTabs.forEach((tab) => {
    items.push(
      <InventoryNavButton
        key={tab.key}
        tab={tab}
        isActive={activeTab === tab.key}
        onSelect={onSelect}
        variant="vertical"
        isMdUp
      />
    )
  })

  return (
    <aside
      className="hidden w-56 shrink-0 flex-col border-r border-border lg:flex"
      aria-label={t("nav.aria")}
    >
      <nav className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden px-3 py-4 scrollbar-thin">
        {items}
      </nav>
      <div className="p-3 border-t border-border space-y-1">
        <VerticalTooltipLink href="/allergens" icon={ShieldAlert} label={t("nav.linkAllergens.long")} />
        <VerticalTooltipLink href="/warehouse" icon={Warehouse} label={t("nav.linkWarehouse.long")} />
      </div>
    </aside>
  )
}
