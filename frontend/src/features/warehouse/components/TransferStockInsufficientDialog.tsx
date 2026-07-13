"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { formatQuantityWithUnit } from "@/lib/formatters"
import { useTranslations } from "next-intl"

export type TransferInsufficientLine = {
  stock_item_id: string
  stock_item_name: string
  requested_quantity: string
  available_quantity: string
  unit: string
  detail?: string
}

interface TransferStockInsufficientDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  insufficientItems: TransferInsufficientLine[]
  variant: "partial" | "info"
  feasibleCount?: number
  onConfirmPartial?: () => void
  confirmLabel?: string
  isLoading?: boolean
}

export function TransferStockInsufficientDialog({
  open,
  onOpenChange,
  title,
  description,
  insufficientItems,
  variant,
  feasibleCount = 0,
  onConfirmPartial,
  confirmLabel,
  isLoading,
}: TransferStockInsufficientDialogProps) {
  const t = useTranslations("warehouse.transferInsufficient")
  const resolvedConfirm = confirmLabel ?? t("confirmPartialDefault")
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <div className="text-sm space-y-2">
          <p className="font-medium text-foreground">{t("intro")}</p>
          <ul className="rounded-md border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 divide-y divide-amber-100 dark:divide-amber-900/40">
            {insufficientItems.map((row, idx) => (
              <li key={`${row.stock_item_id}-${idx}`} className="px-3 py-2.5">
                <div className="font-medium text-foreground">{row.stock_item_name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t("requested")}: {formatQuantityWithUnit(row.requested_quantity, row.unit)}
                  {" · "}
                  {t("available")}: {formatQuantityWithUnit(row.available_quantity, row.unit)}
                </div>
                {row.detail ? (
                  <div className="text-xs text-amber-800 dark:text-amber-200 mt-1">{row.detail}</div>
                ) : null}
              </li>
            ))}
          </ul>
          {variant === "partial" && feasibleCount > 0 ? (
            <p className="text-muted-foreground text-xs pt-1">
              {t("partialHint", { count: feasibleCount })}
            </p>
          ) : null}
        </div>
        <AlertDialogFooter>
          {variant === "partial" && feasibleCount > 0 && onConfirmPartial ? (
            <>
              <AlertDialogCancel disabled={isLoading}>{t("cancel")}</AlertDialogCancel>
              <Button type="button" onClick={() => onConfirmPartial()} disabled={isLoading}>
                {isLoading ? t("creating") : resolvedConfirm}
              </Button>
            </>
          ) : (
            <AlertDialogAction onClick={() => onOpenChange(false)}>{t("ok")}</AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
