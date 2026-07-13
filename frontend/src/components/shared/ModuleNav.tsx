"use client"

import React, { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export function useIsMdUpForTooltip(defaultValue = true) {
  const [isMdUp, setIsMdUp] = useState(defaultValue)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    const sync = () => setIsMdUp(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return isMdUp
}

export function TabDivider({ variant }: { variant: "horizontal" | "vertical" }) {
  if (variant === "vertical") {
    return <div className="my-1 h-px w-full shrink-0 bg-muted" aria-hidden />
  }
  return <div className="mx-2 h-7 w-px shrink-0 bg-accent" aria-hidden />
}

export const sidebarNavItemBase =
  "relative flex shrink-0 items-center gap-3 rounded-xl text-xs font-medium transition-all group outline-none"

export const sidebarActiveBar =
  "absolute left-1.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary shadow-glow"

export const horizontalTabInactive =
  "border-transparent text-muted-foreground hover:border-slate-300 hover:text-slate-700 dark:hover:border-slate-600 dark:hover:text-slate-200"

export const horizontalTabActive =
  "border-primary bg-primary/10 font-semibold text-primary"

export const verticalNavItemInactive =
  "text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted/30"

export const verticalNavItemActive =
  "bg-primary/10 font-semibold text-primary"

export const verticalIconInactive =
  "text-muted-foreground group-hover:text-slate-600 dark:group-hover:text-slate-300"

export const externalLinkHorizontal =
  "relative flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2 text-ui font-medium transition-colors sm:gap-3 " +
  horizontalTabInactive

export const externalLinkVertical =
  "relative flex shrink-0 items-center gap-3 rounded-xl text-xs font-medium transition-all group outline-none w-full justify-start px-3 py-2 " +
  verticalNavItemInactive

export const horizontalNavContainer =
  "flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto overflow-y-hidden pb-px [-webkit-overflow-scrolling:touch] scrollbar-thin"

export function HorizontalTooltipLink({
  href,
  icon: Icon,
  label,
  shortLabel,
  className,
}: {
  href: string
  icon: React.ElementType
  label: string
  shortLabel?: string
  className?: string
}) {
  return (
    <a
      href={href}
      className={cn(externalLinkHorizontal, className)}
    >
      <Icon size={16} className="shrink-0 text-muted-foreground" aria-hidden />
      {shortLabel && <span className="md:hidden">{shortLabel}</span>}
      <span className="hidden md:inline">{label}</span>
    </a>
  )
}

export function VerticalTooltipLink({
  href,
  icon: Icon,
  label,
  className,
}: {
  href: string
  icon: React.ElementType
  label: string
  className?: string
}) {
  return (
    <a
      href={href}
      className={cn(externalLinkVertical, className)}
    >
      <Icon size={18} className={cn("shrink-0 transition-colors", verticalIconInactive)} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
    </a>
  )
}
