"use client"

import React, { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { addDays, format, parseISO, isValid } from "date-fns"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { ProductionPlan } from "../types"

function defaultTargetDateFromPlan(plan: ProductionPlan | null): string {
  if (!plan?.plan_date) {
    return format(addDays(new Date(), 1), "yyyy-MM-dd")
  }
  try {
    const d = parseISO(plan.plan_date.length > 10 ? plan.plan_date : `${plan.plan_date}T12:00:00`)
    if (!isValid(d)) return format(addDays(new Date(), 1), "yyyy-MM-dd")
    return format(addDays(d, 1), "yyyy-MM-dd")
  } catch {
    return format(addDays(new Date(), 1), "yyyy-MM-dd")
  }
}

interface CopyPlanModalProps {
  isOpen: boolean
  onClose: () => void
  plan: ProductionPlan | null
  onCopy: (targetDate: string) => void
  isSubmitting: boolean
}

export function CopyPlanModal({ isOpen, onClose, plan, onCopy, isSubmitting }: CopyPlanModalProps) {
  const t = useTranslations("production.copyModal")
  const [targetDate, setTargetDate] = useState(() => defaultTargetDateFromPlan(null))

  useEffect(() => {
    if (isOpen) setTargetDate(defaultTargetDateFromPlan(plan))
  }, [isOpen, plan])

  const sourceDateLabel = plan?.plan_date
    ? (() => {
        try {
          const d = parseISO(plan.plan_date.length > 10 ? plan.plan_date : `${plan.plan_date}T12:00:00`)
          return isValid(d) ? format(d, "dd.MM.yyyy") : plan.plan_date
        } catch {
          return plan.plan_date
        }
      })()
    : t("emDash")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetDate) return
    onCopy(targetDate)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("descriptionStart")}
            <strong className="text-foreground">{plan?.branch_name || t("branchFallback")}</strong>
            {t("descriptionEnd")}
          </DialogDescription>
        </DialogHeader>

        <form id="copy-plan-form" onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="rounded-md border border-border bg-background px-3 py-2 text-sm">
            <div className="text-muted-foreground">{t("sourceDate")}</div>
            <div className="font-ui-medium text-foreground">{sourceDateLabel}</div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="copy-target-date">{t("targetDate")}</Label>
            <Input
              id="copy-target-date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">{t("hint")}</p>
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button type="submit" form="copy-plan-form" disabled={isSubmitting || !targetDate}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("copy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
