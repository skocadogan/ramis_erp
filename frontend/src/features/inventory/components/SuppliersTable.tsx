"use client"

import { useTranslations } from "next-intl"
import { BarChart3, Edit, Trash2, Plus } from "lucide-react"
import { Supplier } from "@/features/inventory/types"
import { Button } from "@/components/ui/button"

interface SuppliersTableProps {
  suppliers: Supplier[]
  openEditSupplier: (sup: Supplier) => void
  openDeleteDialog: (id: string) => void
  openPerformance: (sup: Supplier) => void
  onNew?: () => void
  isLoading?: boolean
}

export function SuppliersTable({
  suppliers,
  openEditSupplier,
  openDeleteDialog,
  openPerformance,
  onNew,
  isLoading
}: SuppliersTableProps) {
  const t = useTranslations("inventory.suppliersTable")
  return (
    <div className="flex flex-col h-full min-h-0">
      {onNew && (
        <div className="flex justify-between items-center mb-4 px-1">
          <h3 className="font-bold text-foreground">{t("title")}</h3>
          <Button size="sm" onClick={onNew} className="gap-2">
            <Plus className="h-4 w-4" /> {t("new")}
          </Button>
        </div>
      )}
      <div className="flex-1 overflow-auto rounded-lg border border-border bg-card border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted border-border">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t("colName")}</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t("colContact")}</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t("colTel")}</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t("colEmail")}</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t("colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && suppliers.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    <span className="text-sm text-muted-foreground font-medium">{t("loading")}</span>
                  </div>
                </td>
              </tr>
            ) : suppliers.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-muted-foreground dark:text-muted-foreground">
                  {t("empty")}
                </td>
              </tr>
            ) : (
              suppliers.map((sup) => (
                <tr key={sup.id} className="border-b hover:/50 transition-colors border-border dark:hover:/50">
                  <td className="px-3 py-2 font-medium text-foreground">{sup.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{sup.contact_person}</td>
                  <td className="px-3 py-2 font-mono text-xs dark:text-muted-foreground">{sup.phone}</td>
                  <td className="px-3 py-2 text-muted-foreground">{sup.email}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openPerformance(sup)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors"
                        title={t("performanceTitle")}
                      >
                        <BarChart3 size={15} />
                      </button>
                      <button
                        onClick={() => openEditSupplier(sup)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                      >
                        <Edit size={15} />
                      </button>
                      <button
                        onClick={() => openDeleteDialog(sup.id)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors"
                      >
                        <Trash2 size={15} />
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
