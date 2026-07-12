"use client"

import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"
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
import { allergensApi } from "@/features/allergens/services/allergensApi"
import type { Allergen } from "@/features/allergens/types"

interface AllergenReferenceModalProps {
  open: boolean
  onClose: () => void
  /** Harici liste verilirse API çağrısı yapılmaz */
  allergens?: Allergen[]
  showPrevalence?: boolean
}

export function AllergenReferenceModal({
  open,
  onClose,
  allergens: externalAllergens,
  showPrevalence = true,
}: AllergenReferenceModalProps) {
  const t = useTranslations("allergens.referenceModal")

  const { data: fetched = [], isLoading } = useQuery({
    queryKey: ["allergens", "reference"],
    queryFn: () => allergensApi.listAll(),
    enabled: open && !externalAllergens,
    staleTime: 60_000,
  })

  const rows = externalAllergens ?? fetched
  const colSpan = showPrevalence ? 4 : 3

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent layout="scroll" size="3xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        <DialogBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-border bg-background">
                <tr>
                  <th className="px-4 py-2.5 font-semibold text-foreground">{t("colCode")}</th>
                  <th className="px-4 py-2.5 font-semibold text-foreground">{t("colName")}</th>
                  {showPrevalence && (
                    <th className="px-4 py-2.5 text-right font-semibold text-foreground">
                      {t("colPrevalence")}
                    </th>
                  )}
                  <th className="px-4 py-2.5 text-right font-semibold text-foreground">{t("colRisk")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && !externalAllergens ? (
                  <tr>
                    <td colSpan={colSpan} className="px-4 py-10 text-center text-muted-foreground">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                      {t("loading")}
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="px-4 py-10 text-center text-muted-foreground">
                      {t("empty")}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-background">
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground">{row.code}</td>
                      <td className="px-4 py-2.5 text-foreground">{row.name}</td>
                      {showPrevalence && (
                        <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                          {Number(row.prevalence_pct).toFixed(2)}%
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-right">
                        <span className="inline-flex min-w-[1.75rem] justify-center rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                          {row.risk_score}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("closeAria")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
