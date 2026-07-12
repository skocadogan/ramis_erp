"use client"

import { useTranslations } from "next-intl"
import { Edit2, Trash2, Plus } from "lucide-react"
import { StockUnit } from "@/features/inventory/types"
import { formatUnitMultiplier } from "@/lib/formatters"
import { Button } from "@/components/ui/button"

interface UnitsTableProps {
  units: StockUnit[]
  onEdit: (unit: StockUnit) => void
  onDelete: (id: string) => void
  onNew?: () => void
  isLoading?: boolean
}

export function UnitsTable({ units, onEdit, onDelete, onNew, isLoading }: UnitsTableProps) {
  const t = useTranslations("inventory.unitsTable")
  return (
    <div className="flex flex-col h-full min-h-0">
      {onNew && (
        <div className="flex justify-between items-center mb-4 px-1">
          <h3 className="font-ui-bold text-foreground">{t("title")}</h3>
          <Button size="sm" onClick={onNew} className="gap-2">
            <Plus className="h-4 w-4" /> {t("new")}
          </Button>
        </div>
      )}
      <div className="bg-white rounded-lg border border-border overflow-hidden dark:bg-slate-900 dark:border-slate-700">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-border dark:bg-slate-800 dark:border-slate-700">
            <tr>
              <th className="px-3 py-2 text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t("colName")}</th>
              <th className="px-3 py-2 text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t("colShort")}</th>
              <th className="px-3 py-2 text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t("colMultiplier")}</th>
              <th className="px-3 py-2 text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider text-right dark:text-muted-foreground">{t("colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {isLoading && units.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    <span className="text-sm text-muted-foreground font-ui-medium">{t("loading")}</span>
                  </div>
                </td>
              </tr>
            ) : units.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-xs font-ui-medium dark:text-muted-foreground">
                  {t("empty")}
                </td>
              </tr>
            ) : (
              units.map((unit) => (
                <tr key={unit.id} className="hover:bg-slate-50/50 transition-colors group dark:hover:bg-slate-800/50">
                  <td className="px-3 py-2">
                    <span className="text-sm font-ui-semibold text-foreground">{unit.name}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-ui-medium border border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800">
                      {unit.short_name}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {formatUnitMultiplier(unit.multiplier)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => onEdit(unit)}
                        className="p-1.5 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-all">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => onDelete(unit.id)}
                        className="p-1.5 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-md transition-all">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
