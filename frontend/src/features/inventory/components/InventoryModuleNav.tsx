"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Warehouse, ShieldAlert } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
  tab: InventoryNavTab
  isActive: boolean
  onSelect: (key: TabType) => void
  variant: "horizontal" | "vertical"
  isMdUp: boolean
}

const sidebarNavItemBase =
  "relative flex shrink-0 items-center gap-3 rounded-xl text-xs font-ui-medium transition-all group outline-none"
const sidebarActiveBar =
  "absolute left-1.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"

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
      <nav
        className={cn(
          "flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto overflow-y-hidden pb-px [-webkit-overflow-scrolling:touch]",
          "scrollbar-thin"
        )}
        aria-label={t("nav.aria")}
      >
        {items}
      </nav>
      <TabDivider variant="horizontal" />
      <Link
        href="/allergens"
        className="relative flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2 text-ui font-ui-medium transition-colors sm:gap-3 text-muted-foreground hover:border-slate-300 hover:text-slate-700 dark:text-muted-foreground dark:hover:border-slate-600 dark:hover:text-slate-200"
      >
        <ShieldAlert size={16} className="shrink-0 text-muted-foreground" aria-hidden />
        <span className="md:hidden">{t("nav.linkAllergens.short")}</span>
        <span className="hidden md:inline">{t("nav.linkAllergens.long")}</span>
      </Link>
      <Link
        href="/warehouse"
        className="relative flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2 text-ui font-ui-medium transition-colors sm:gap-3 text-muted-foreground hover:border-slate-300 hover:text-slate-700 dark:text-muted-foreground dark:hover:border-slate-600 dark:hover:text-slate-200"
      >
        <Warehouse size={16} className="shrink-0 text-muted-foreground" aria-hidden />
        <span className="md:hidden">{t("nav.linkWarehouse.short")}</span>
        <span className="hidden md:inline">{t("nav.linkWarehouse.long")}</span>
      </Link>
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
      className={cn(
        "hidden w-56 shrink-0 flex-col border-r border-border bg-white dark:border-slate-900 dark:bg-[#020817]",
        "lg:flex"
      )}
      aria-label={t("nav.aria")}
    >
      <nav className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden px-3 py-4 scrollbar-thin">
        {items}
      </nav>
      <div className="p-3 border-t border-border space-y-1">
        <Link
          href="/allergens"
          className="relative flex shrink-0 items-center gap-3 rounded-xl text-xs font-ui-medium transition-all group outline-none w-full justify-start px-3 py-1.5 text-muted-foreground hover:bg-slate-100 hover:text-slate-900 dark:text-muted-foreground dark:hover:bg-slate-800/30 dark:hover:text-slate-200"
        >
          <ShieldAlert size={18} className="shrink-0 transition-colors text-muted-foreground group-hover:text-slate-600 dark:text-muted-foreground dark:group-hover:text-slate-300" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">{t("nav.linkAllergens.long")}</span>
        </Link>
        <Link
          href="/warehouse"
          className="relative flex shrink-0 items-center gap-3 rounded-xl text-xs font-ui-medium transition-all group outline-none w-full justify-start px-3 py-1.5 text-muted-foreground hover:bg-slate-100 hover:text-slate-900 dark:text-muted-foreground dark:hover:bg-slate-800/30 dark:hover:text-slate-200"
        >
          <Warehouse size={18} className="shrink-0 transition-colors text-muted-foreground group-hover:text-slate-600 dark:text-muted-foreground dark:group-hover:text-slate-300" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">{t("nav.linkWarehouse.long")}</span>
        </Link>
      </div>
    </aside>
  )
}
