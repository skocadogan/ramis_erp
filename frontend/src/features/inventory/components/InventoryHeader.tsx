"use client"

import React from "react"
import { 
  ChevronDown, 
  PackagePlus, 
  ArrowLeftRight, 
  Boxes, 
  FileSpreadsheet, 
  AlertTriangle 
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

interface InventoryHeaderProps {
  criticalItemsCount: number
  onNewItem: () => void
  onNewMovement: () => void
  onBulkStockEntry: () => void
  onBulkMinimumUpdate: () => void
  onBulkCriticalEntry: () => void
  compact?: boolean
}

export function InventoryHeader({
  criticalItemsCount,
  onNewItem,
  onNewMovement,
  onBulkStockEntry,
  onBulkMinimumUpdate,
  onBulkCriticalEntry,
  compact = false,
}: InventoryHeaderProps) {
  const t = useTranslations("inventory")
  return (
    <div
      className={cn(
        "flex items-center gap-2 shrink-0",
        !compact && "mb-4 flex-wrap justify-end",
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            buttonVariants({ variant: "outline", size: compact ? "sm" : "default" }),
            "gap-1.5 shrink-0 border-border",
            compact && "h-9 px-2.5 text-xs",
          )}
        >
          {t("header.actions")}
          <ChevronDown className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 p-2 shadow-md border-border">
          <DropdownMenuItem onClick={onNewItem} className="py-2.5">
            <PackagePlus className="mr-3 h-4 w-4 text-blue-500" />
            {t("header.addStockItem")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onNewMovement} className="py-2.5">
            <ArrowLeftRight className="mr-3 h-4 w-4 text-emerald-500" />
            {t("header.addMovement")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onBulkStockEntry} className="py-2.5">
            <Boxes className="mr-3 h-4 w-4 text-amber-500" />
            {t("header.bulkStockEntry")}
          </DropdownMenuItem>
          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
          <DropdownMenuItem onClick={onBulkMinimumUpdate} className="py-2.5">
            <FileSpreadsheet className="mr-3 h-4 w-4 text-indigo-500" />
            {t("header.bulkMinUpdate")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {criticalItemsCount > 0 && (
        <Button
          variant="outline"
          size={compact ? "sm" : "default"}
          onClick={onBulkCriticalEntry}
          className={cn(
            "relative shrink-0 border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-300 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60 transition-all shadow-sm",
            compact ? "h-9 gap-1.5 px-2.5 text-xs" : "gap-2",
          )}
        >
          <AlertTriangle className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          <span className={compact ? "hidden sm:inline" : undefined}>{t("header.criticalStockEntry")}</span>
          <span
            className={cn(
              "inline-flex items-center justify-center rounded-full bg-rose-600 font-ui-bold text-white",
              compact ? "h-4 min-w-4 px-1 text-2xs" : "ml-1 h-5 min-w-5 px-1 text-2xs",
            )}
          >
            {criticalItemsCount}
          </span>
        </Button>
      )}
    </div>
  )
}
