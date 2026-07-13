"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"
import { BookOpen } from "lucide-react"
import { allergensApi } from "@/features/allergens/services/allergensApi"
import { AllergenReferenceModal } from "./AllergenReferenceModal"

interface AllergenMultiSelectProps {
  value: string[]
  onChange: (ids: string[]) => void
  className?: string
}

export function AllergenMultiSelect({ value, onChange, className }: AllergenMultiSelectProps) {
  const t = useTranslations("allergens.stockForm")
  const [showRef, setShowRef] = useState(false)

  const { data: allergens = [], isLoading } = useQuery({
    queryKey: ["allergens", "select"],
    queryFn: () => allergensApi.listAll(),
    staleTime: 60_000,
  })

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id))
    } else {
      onChange([...value, id])
    }
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="text-sm font-medium text-foreground">{t("label")}</label>
        <button
          type="button"
          onClick={() => setShowRef(true)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          <BookOpen size={12} />
          {t("reference")}
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{t("hint")}</p>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("none")}</p>
      ) : allergens.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("none")}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 flex-1 overflow-y-auto rounded-md border border-border p-2 /50 bg-muted/30">
          {[...allergens].sort((a, b) => a.name.localeCompare(b.name)).map((a) => {
            const selected = value.includes(a.id)
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => toggle(a.id)}
                className={`rounded-md px-2 py-1 text-xs font-medium border transition-colors ${
 selected
 ? "bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-100"
 : "border-border text-muted-foreground hover:border-amber-200 bg-card border-border"
 }`}
              >
                {a.name}
                <span className="ml-1 opacity-70">({a.risk_score})</span>
              </button>
            )
          })}
        </div>
      )}
      <AllergenReferenceModal open={showRef} onClose={() => setShowRef(false)} showPrevalence />
    </div>
  )
}
