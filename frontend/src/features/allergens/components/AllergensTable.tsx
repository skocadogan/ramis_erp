"use client"

import { memo } from "react"
import { Edit2, Trash2, Loader2, ShieldAlert, ArrowUpDown, ArrowUp, ArrowDown, Search, Filter, Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { VirtualTable } from "@/components/ui/virtual-table"
import type { Allergen } from "@/features/allergens/types"
import type { SortField, SortDir } from "@/features/allergens/hooks/useAllergens"

interface AllergensTableProps {
  allergens: Allergen[]
  totalCount: number
  canManage: boolean

  search: string
  onSearchChange: (value: string) => void

  sortField: SortField
  sortDir: SortDir
  onToggleSort: (field: SortField) => void

  filterActive: string
  onFilterActiveChange: (value: string) => void

  isLoading: boolean
  fetchNextPage?: () => void
  hasNextPage?: boolean
  isFetchingNextPage?: boolean

  onNew?: () => void
  onEdit?: (allergen: Allergen) => void
  onDelete?: (id: string) => void
}

function SortIcon({ field, currentField, currentDir }: { field: SortField; currentField: SortField; currentDir: SortDir }) {
  if (currentField !== field) return <ArrowUpDown size={12} className="text-muted-foreground/60" />
  return currentDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
}

export const AllergensTable = memo(function AllergensTable({
  allergens,
  totalCount,
  canManage,
  search,
  onSearchChange,
  sortField,
  sortDir,
  onToggleSort,
  filterActive,
  onFilterActiveChange,
  isLoading,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  onNew,
  onEdit,
  onDelete,
}: AllergensTableProps) {
  const t = useTranslations("allergens")
  const colSpan = canManage ? 5 : 4

  const sel =
    "border border-border rounded-md px-2.5 py-1.5 text-sm bg-card border-input text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20"

  const headerBlock = (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("page.title")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalCount > 0 ? t("page.paginationInfo", { total: totalCount, start: 1, end: allergens.length }) : t("page.subtitle")}
          </p>
        </div>
        {canManage && onNew && (
          <Button
            onClick={onNew}
            className="gap-2"
          >
            <Plus size={16} />
            {t("page.addNew")}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={t("page.searchPh")}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-4 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-muted border-input text-foreground"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-muted-foreground" />
          <select value={filterActive} onChange={(e) => onFilterActiveChange(e.target.value)} className={sel}>
            <option value="">{t("page.allStatuses")}</option>
            <option value="true">{t("table.active")}</option>
            <option value="false">{t("table.passive")}</option>
          </select>
        </div>
      </div>
    </>
  )

  if (!isLoading && allergens.length === 0) {
    return (
      <div className="flex flex-col h-full gap-4">
        {headerBlock}
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 px-4 text-muted-foreground">
          <ShieldAlert size={36} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">{t("table.empty")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {headerBlock}

      <div className="flex-1 min-h-0 rounded-lg border border-border">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
        ) : (
          <VirtualTable
            rows={allergens}
            rowHeight={44}
            overscan={10}
            fetchMore={fetchNextPage}
            hasMore={!!hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            className="max-h-[calc(100vh-14rem)]"
            tableClassName="w-full text-sm [&_tbody_tr]:border-b [&_tbody_tr]:border-border [&_tbody_tr]:transition-colors [&_tbody_tr]:hover:bg-muted/20 [&_thead]:bg-muted [&_thead]:text-muted-foreground [&_thead_tr]:bg-muted [&_thead_th]:bg-muted"
            header={
              <thead className="sticky top-0 z-10 border-b border-border bg-muted text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">
                    <button
                      onClick={() => onToggleSort("code")}
                      className="flex items-center gap-1 hover:text-foreground"
                    >
                      {t("table.colCode")}
                      <SortIcon field="code" currentField={sortField} currentDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-left px-4 py-2 font-medium">
                    <button
                      onClick={() => onToggleSort("name")}
                      className="flex items-center gap-1 hover:text-foreground"
                    >
                      {t("table.colName")}
                      <SortIcon field="name" currentField={sortField} currentDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-right px-4 py-2 font-medium">
                    <button
                      onClick={() => onToggleSort("prevalence_pct")}
                      className="flex items-center gap-1 hover:text-foreground ml-auto"
                    >
                      {t("table.colPrevalence")}
                      <SortIcon field="prevalence_pct" currentField={sortField} currentDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-right px-4 py-2 font-medium">
                    <button
                      onClick={() => onToggleSort("risk_score")}
                      className="flex items-center gap-1 hover:text-foreground ml-auto"
                    >
                      {t("table.colRisk")}
                      <SortIcon field="risk_score" currentField={sortField} currentDir={sortDir} />
                    </button>
                  </th>
                  {canManage && (
                    <th className="text-right px-4 py-2 font-medium">
                      {t("table.colActions")}
                    </th>
                  )}
                </tr>
              </thead>
            }
            loadingMore={
              <tr>
                <td colSpan={colSpan} className="py-3 text-center">
                  <Loader2 size={16} className="mx-auto animate-spin text-emerald-600" />
                </td>
              </tr>
            }
            renderRow={(row) => (
              <>
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{row.code}</td>
                <td className="px-4 py-2 text-sm font-medium text-foreground">{row.name}</td>
                <td className="px-4 py-2 text-right tabular-nums text-sm text-muted-foreground">
                  {Number(row.prevalence_pct).toFixed(2)}%
                </td>
                <td className="px-4 py-2 text-right">
                  <span className="inline-flex min-w-[1.75rem] justify-center rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                    {row.risk_score}
                  </span>
                </td>
                {canManage && (
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit?.(row)}
                        className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/20 hover:text-foreground"
                        title="Düzenle"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete?.(row.id)}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-rose-600"
                        title="Sil"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                )}
              </>
            )}
          />
        )}
      </div>
    </div>
  )
})
