"use client"

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react"
import {
  hasModuleAccess,
  hasOperationalManageAccess,
} from "@/lib/constants"
import {
  NAV_STRUCTURE,
  canAccessNavItem,
  type NavItem,
  type NavGroup,
} from "@/config/navStructure"
import { cn } from "@/lib/utils"
import { useSidebarStore } from "@/store/useSidebarStore"
import { useShallow } from "zustand/react/shallow"
import { useTheme } from "@/components/shell/ThemeProvider"
import { usePendingDeficiencyCount } from "@/features/warehouse/hooks/usePendingDeficiencyCount"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"

interface AppSidebarProps {
  collapsed: boolean
  onCollapse: () => void
  userPermissions?: string[]
  is_superuser?: boolean
  lowStockCount?: number
}

export function AppSidebar({ collapsed, onCollapse, userPermissions, is_superuser, lowStockCount = 0 }: AppSidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get("tab")
  const tNav = useTranslations("common.nav")

  const { openGroups, toggleGroup: storeToggleGroup, setGroupOpen } = useSidebarStore(
    useShallow((s) => ({
      openGroups: s.openGroups,
      toggleGroup: s.toggleGroup,
      setGroupOpen: s.setGroupOpen,
    })),
  )
  const { density } = useTheme()
  const pendingDeficiencyCount = usePendingDeficiencyCount(userPermissions, is_superuser)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isActive = useCallback((item: NavItem) => {
    if (item.matchPath === "/panel" && item.matchTab) {
      if (pathname !== "/panel") return false
      if (!currentTab && item.matchTab === "overview") return true
      return currentTab === item.matchTab
    }
    return pathname === item.matchPath
  }, [pathname, currentTab])

  // Auto-expand group if item inside is active
  useEffect(() => {
    if (collapsed) return

    const checkActiveGroup = (groupId: string, items: NavItem[]) => {
      if (items.some((item) => isActive(item))) {
        setGroupOpen(groupId, true)
      }
    }

    checkActiveGroup("definitions", NAV_STRUCTURE.definitions.items)
    checkActiveGroup("restaurant", NAV_STRUCTURE.restaurant.items)
    checkActiveGroup("stockWarehouse", NAV_STRUCTURE.stockWarehouse.items)
    checkActiveGroup("personnel", NAV_STRUCTURE.personnel.items)
    checkActiveGroup("kitchen", NAV_STRUCTURE.kitchen.items)
    checkActiveGroup("system", NAV_STRUCTURE.system.items)
  }, [pathname, currentTab, collapsed, setGroupOpen, isActive])

  const toggleGroup = (groupId: string) => {
    if (collapsed) {
      onCollapse()
      setGroupOpen(groupId, true)
    } else {
      storeToggleGroup(groupId)
    }
  }

  const canAccess = (item: NavItem) =>
    canAccessNavItem(item, userPermissions, is_superuser, hasModuleAccess, hasOperationalManageAccess)

  const getLabel = (key: string) => tNav(key as Parameters<typeof tNav>[0])

  const renderSingleItem = (item: NavItem, isSubItem = false) => {
    if (!canAccess(item)) return null

    const active = isActive(item)
    const Icon = item.icon
    const showLowStockBadge = item.matchPath === "/inventory" && lowStockCount > 0
    const showDeficiencyBadge = item.matchPath === "/warehouse" && pendingDeficiencyCount > 0
    const showBadge = showLowStockBadge || showDeficiencyBadge
    const badgeCount = showLowStockBadge ? lowStockCount : pendingDeficiencyCount
    const label = getLabel(item.labelKey)

    const itemContent = (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "relative flex items-center rounded-xl text-ui-sm font-medium transition-colors group shrink-0",
          density === "compact" ? "gap-2" : (density === "spacious" ? "gap-4" : "gap-3"),
          collapsed
            ? cn("justify-center px-0", density === "compact" ? "py-1.5" : (density === "spacious" ? "py-3" : "py-2"))
            : cn("px-2", density === "compact" ? "py-1" : (density === "spacious" ? "py-2.5" : "py-1.5")),
          isSubItem && !collapsed ? (density === "compact" ? "pl-5 text-xs" : (density === "spacious" ? "pl-8 text-ui-sm" : "pl-6 text-xs")) : "",
          active
            ? "bg-primary/15 text-primary font-semibold"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        {active && !collapsed && (
          <span className="absolute start-1.5 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-primary shadow-glow" />
        )}
        <Icon
          size={isSubItem ? 16 : 18}
          className={cn(
            "shrink-0 transition-colors",
            active ? "text-primary" : "text-muted-foreground/60 group-hover:text-foreground"
          )}
        />
        {!collapsed && <span className="truncate">{label}</span>}

        {showBadge && (
          <span className={cn(
            collapsed ? "absolute -top-1 -end-1" : "ms-auto",
            "bg-red-500 text-white text-2xs font-bold px-1.5 py-0.5 min-w-[18px] h-4.5 rounded-full flex items-center justify-center border-2 border-white dark:border-border"
          )}>
            {badgeCount}
          </span>
        )}
      </Link>
    )

    if (collapsed && !isSubItem) {
      return (
        <Tooltip key={item.href}>
          <TooltipTrigger render={itemContent} delay={50} />
          <TooltipContent side="right" sideOffset={18} className="font-semibold text-xs ms-1 bg-foreground text-background border-border">
            {label}
          </TooltipContent>
        </Tooltip>
      )
    }

    return itemContent
  }

  const renderGroup = (id: string, group: NavGroup) => {
    const visibleItems = group.items.filter(canAccess)
    if (visibleItems.length === 0) return null

    const isOpen = openGroups[id]
    const isAnyActive = visibleItems.some(isActive)
    const Icon = group.icon
    const groupLabel = getLabel(group.labelKey)

    const triggerButton = (
      <button
        onClick={() => toggleGroup(id)}
        className={cn(
          "w-full relative flex items-center rounded-xl text-ui font-medium transition-colors shrink-0 outline-none",
          density === "compact" ? "gap-2" : (density === "spacious" ? "gap-4" : "gap-3"),
          collapsed
            ? cn("justify-center px-0", density === "compact" ? "py-2" : (density === "spacious" ? "py-3.5" : "py-2.5"))
            : cn("px-3", density === "compact" ? "py-1.5" : (density === "spacious" ? "py-3" : "py-2")),
            "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        <Icon
          size={18}
          className={cn(
            "shrink-0 transition-colors",
            isAnyActive ? "text-primary" : "text-muted-foreground/60 group-hover:text-foreground"
          )}
        />
        {!collapsed && (
          <>
            <span className={cn("truncate flex-1 text-start", isAnyActive ? "text-foreground" : "")}>{groupLabel}</span>
            <ChevronDown
              size={14}
              className={cn("transition-transform duration-300 text-muted-foreground", isOpen ? "rotate-180" : "")}
            />
          </>
        )}
      </button>
    )

    if (collapsed) {
      return (
        <div key={id} className="relative space-y-1">
          <HoverCard>
            <HoverCardTrigger render={triggerButton} delay={50} closeDelay={100} />
            <HoverCardContent
              side="right"
              align="start"
              sideOffset={14}
              className="w-[220px] p-0 ms-1 bg-card border-border rounded-xl overflow-hidden"
            >
              <div className="px-4 py-3 pb-2 text-sub font-bold text-muted-foreground uppercase tracking-widest border-b border-border">
                {groupLabel}
              </div>
              <div className="p-2 space-y-1">
                {group.subGroups ? (
                  group.subGroups.map((sg) => {
                    const sgVisible = sg.items.filter(canAccess)
                    if (sgVisible.length === 0) return null
                    return (
                      <div key={sg.labelKey}>
                        <div className="px-3 pt-1.5 pb-0.5 text-3xs font-bold uppercase text-muted-foreground/50 tracking-widest">
                          {getLabel(sg.labelKey)}
                        </div>
                        {sgVisible.map(subItem => {
                          const subActive = isActive(subItem)
                          const SubIcon = subItem.icon
                          return (
                            <Link
                              key={subItem.href}
                              href={subItem.href}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                                subActive
                                  ? "bg-primary/10 text-primary font-semibold"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
                              )}
                            >
                              <SubIcon size={14} className={cn(subActive ? "text-primary" : "text-muted-foreground")} />
                              <span>{getLabel(subItem.labelKey)}</span>
                            </Link>
                          )
                        })}
                      </div>
                    )
                  })
                ) : (
                  visibleItems.map(subItem => {
                    const subActive = isActive(subItem)
                    const SubIcon = subItem.icon
                    return (
                      <Link
                        key={subItem.href}
                        href={subItem.href}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                          subActive
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        <SubIcon size={14} className={cn(subActive ? "text-primary" : "text-muted-foreground")} />
                        <span>{getLabel(subItem.labelKey)}</span>
                      </Link>
                    )
                  })
                )}
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
      )
    }

    return (
      <div key={id} className="relative space-y-1">
        {triggerButton}
        <div className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-in-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}>
          <div className="overflow-hidden min-h-0">
            <div className="mt-1 space-y-1">
              {group.subGroups ? (
                group.subGroups.map((sg) => {
                  const sgVisible = sg.items.filter(canAccess)
                  if (sgVisible.length === 0) return null
                  return (
                    <div key={sg.labelKey}>
                      <div className="px-2 pt-2 pb-1 text-2xs font-bold uppercase text-muted-foreground/50 tracking-widest">
                        {getLabel(sg.labelKey)}
                      </div>
                      <div className="space-y-0.5">
                        {sgVisible.map(item => renderSingleItem(item, true))}
                      </div>
                    </div>
                  )
                })
              ) : (
                visibleItems.map(item => renderSingleItem(item, true))
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <aside className={cn(
      "shrink-0 flex flex-col bg-background border-e border-border",
      mounted ? "transition-all duration-300" : "transition-none",
      collapsed ? "w-20" : "w-64"
    )}>
      <TooltipProvider delay={50}>
        <div className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar",
          density === "compact" ? "py-3" : (density === "spacious" ? "py-8" : "py-6")
        )}>
          <nav className={cn(
            "px-3",
            density === "compact" ? "space-y-0.5" : (density === "spacious" ? "space-y-2" : "space-y-1.5")
          )}>
            {renderSingleItem(NAV_STRUCTURE.overview)}
            <hr className="border-border/50" />
            {renderGroup("definitions", NAV_STRUCTURE.definitions)}
            {renderGroup("restaurant", NAV_STRUCTURE.restaurant)}
            {renderGroup("stockWarehouse", NAV_STRUCTURE.stockWarehouse)}
            {renderGroup("personnel", NAV_STRUCTURE.personnel)}
            {renderGroup("kitchen", NAV_STRUCTURE.kitchen)}

            <div className={density === "compact" ? "py-0.5" : "py-1"} />
            {renderGroup("system", NAV_STRUCTURE.system)}

            <div className={cn(
              "border-t border-border",
              density === "compact" ? "mt-2 pt-1" : (density === "spacious" ? "mt-6 pt-4" : "mt-4 pt-2")
            )}>
              {NAV_STRUCTURE.independent.map(item => renderSingleItem(item))}
            </div>
          </nav>
        </div>

        {/* Collapse Toggle */}
        <div className={cn(
          "border-t border-border bg-muted/30",
          density === "compact" ? "p-2" : (density === "spacious" ? "p-6" : "p-4")
        )}>
          <button
            onClick={onCollapse}
            className={cn(
              "flex h-10 w-full items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
              density === "compact" ? "gap-2" : (density === "spacious" ? "gap-4" : "gap-3"),
              collapsed ? "justify-center px-0" : cn(density === "compact" ? "px-2" : "px-4")
            )}
          >
            {collapsed ? (
              <ChevronRight size={20} />
            ) : (
              <>
                <ChevronLeft size={20} />
                <span className="text-sm font-medium">{tNav("collapse")}</span>
              </>
            )}
          </button>
        </div>
      </TooltipProvider>

    </aside>
  )
}
