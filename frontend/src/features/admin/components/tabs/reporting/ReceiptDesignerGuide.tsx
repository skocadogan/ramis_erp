"use client"

import {
  Info, Filter, Layout, Printer, AlertTriangle,
  ChevronRight, Database, Terminal, Smartphone
} from "lucide-react"
import { useTranslations } from "next-intl"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface ReceiptDesignerGuideProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const BLOCK_KEYS = ["text", "keyValue", "itemLoop", "branchInfo", "branchLogo", "hideEmpty"] as const

const FILTER_ITEMS = [
  { code: "currency", msgKey: "currency" as const },
  { code: "qty", msgKey: "qty" as const },
  { code: "date_tr", msgKey: "dateTr" as const },
  { code: "rate X", msgKey: "rate" as const },
  { code: "with_options", msgKey: "withOptions" as const },
  { code: "with_tax_rates", msgKey: "withTaxRates" as const },
]

const VAR_NAMES = [
  "branch_name", "branch_address", "branch_phone",
  "table_name", "waiter_name", "order_number", "sale_id",
  "customer_name", "station_name",
  "subtotal", "discount", "tax", "total",
  "payment_method", "payment_type",
  "created_at", "date", "time",
  "notes", "descriptions",
] as const

const ITEM_LOOP_FIELDS = [
  "name", "qty", "price", "total", "unit", "tax_rate",
  "modifiers", "modifier_names", "notes", "description",
] as const

const ITEM_LOOP_VARIABLES = ["items", "payments"] as const

const TIP_KEYS = ["alignCenter", "suffixCol", "tryLira", "splitPay", "descriptions", "withOptions", "withTaxRates"] as const

const sectionTitleClass =
  "text-sm font-semibold uppercase tracking-wide text-foreground"
const bodyTextClass = "text-sm leading-relaxed text-foreground/90"
const chipClass =
  "rounded-md border border-border bg-background px-2.5 py-2 font-mono text-xs text-foreground"

export function ReceiptDesignerGuide({ open, onOpenChange }: ReceiptDesignerGuideProps) {
  const t = useTranslations("admin")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent layout="scroll" size="5xl" className="max-w-[95vw]">
        <DialogHeader className="flex flex-row items-center gap-3 space-y-0 pr-10">
          <div className="flex shrink-0 items-center justify-center rounded-md bg-primary/10 p-2">
            <Printer size={20} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1 space-y-1 text-left">
            <DialogTitle className="text-lg leading-tight">{t("reporting.guide.title")}</DialogTitle>
            <DialogDescription className="text-left text-sm text-foreground/80">
              {t("reporting.guide.subtitle")}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="py-6 text-sm">
          <div className="grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-2">
            <div className="space-y-10">
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Layout className="h-4 w-4 text-foreground/70" />
                  <h4 className={sectionTitleClass}>
                    {t("reporting.guide.sections.blockTypes")}
                  </h4>
                </div>
                <div className="space-y-3.5">
                  {BLOCK_KEYS.map((key) => (
                    <div key={key} className="flex gap-3">
                      <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <div className="min-w-0">
                        <span className="font-semibold text-foreground">
                          {t(`reporting.guide.blocks.${key}.title`)}:
                        </span>{" "}
                        <span className={bodyTextClass}>
                          {t(`reporting.guide.blocks.${key}.desc`)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Filter className="h-4 w-4 text-foreground/70" />
                  <h4 className={sectionTitleClass}>
                    {t("reporting.guide.sections.filters")}
                  </h4>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {FILTER_ITEMS.map((f) => (
                    <div
                      key={f.code}
                      className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/40 px-3 py-2.5"
                    >
                      <code className="shrink-0 text-xs font-bold text-primary">| {f.code}</code>
                      <span className={`text-right ${bodyTextClass}`}>
                        {t(`reporting.guide.filters.${f.msgKey}`)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-border bg-muted/40 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-foreground/70" />
                  <h4 className={sectionTitleClass}>
                    {t("reporting.guide.sections.limits")}
                  </h4>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-foreground/80">{t("reporting.guide.limit58")}</span>
                    <span className="font-mono text-sm font-semibold text-foreground">
                      32 {t("reporting.guide.chars")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-foreground/80">{t("reporting.guide.limit80")}</span>
                    <span className="font-mono text-sm font-semibold text-foreground">
                      48 {t("reporting.guide.chars")}
                    </span>
                  </div>
                </div>
              </section>
            </div>

            <div className="space-y-10">
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Database className="h-4 w-4 text-foreground/70" />
                  <h4 className={sectionTitleClass}>
                    {t("reporting.guide.sections.variables")}
                  </h4>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {VAR_NAMES.map(v => (
                    <div key={v} className={chipClass}>
                      {"{{"} {v} {"}}"}
                    </div>
                  ))}
                </div>
                <div className="mt-6">
                  <h5 className={`mb-3 ${sectionTitleClass}`}>
                    {t("reporting.guide.sections.itemLoopFields")}
                  </h5>
                  <div className="grid grid-cols-2 gap-2">
                    {ITEM_LOOP_FIELDS.map(v => (
                      <div key={v} className={`${chipClass} bg-muted/40`}>
                        {v}
                      </div>
                    ))}
                  </div>
                  <p className={`mt-3 ${bodyTextClass}`}>
                    {t("reporting.guide.itemLoopVarsHint", {
                      items: ITEM_LOOP_VARIABLES[0],
                      payments: ITEM_LOOP_VARIABLES[1],
                    })}
                  </p>
                </div>
                <div className="mt-4 flex gap-3 rounded-md border border-primary/25 bg-primary/5 p-3.5">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className={bodyTextClass}>
                    <strong className="font-semibold text-foreground">
                      {t("reporting.guide.varHintTitle")}
                    </strong>{" "}
                    {t("reporting.guide.varHintBody")}
                  </p>
                </div>
              </section>

              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-foreground/70" />
                  <h4 className={sectionTitleClass}>
                    {t("reporting.guide.sections.rules")}
                  </h4>
                </div>
                <div className="space-y-2.5">
                  {TIP_KEYS.map((key) => (
                    <div key={key} className={`flex gap-2 ${bodyTextClass}`}>
                      <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" />
                      {t(`reporting.guide.tips.${key}`)}
                    </div>
                  ))}
                </div>
              </section>

              <div className="mt-6 flex gap-3 rounded-lg border border-amber-300/80 bg-amber-50 p-4 dark:border-amber-800/60 dark:bg-amber-950/30">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="text-sm leading-relaxed text-amber-950 dark:text-amber-100">
                  {t("reporting.guide.warnBox")}
                </p>
              </div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("reporting.guide.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
