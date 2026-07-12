"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { ChefHat, Search, Eye } from "lucide-react"
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table"
import Link from "next/link"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { Recipe as RecipesRecipe } from "@/features/recipes/types"
import { formatAmount, formatNumber } from "@/lib/formatters"
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts"

export type Recipe = Pick<RecipesRecipe, "id" | "name" | "product_name" | "total_cost" | "ingredients">

interface RecipesTabProps {
  recipes: Recipe[]
  searchTerm: string
  setSearchTerm: (s: string) => void
  /** Reçete yönetimi (recipes.manage_recipe) — yoksa tam reçete sayfası linki gösterilmez */
  canManageRecipes?: boolean
}

export function RecipesTab({ recipes, searchTerm, setSearchTerm, canManageRecipes }: RecipesTabProps) {
  const t = useTranslations("admin")
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const canViewAmounts = useCanViewAmounts()
  const filtered = recipes.filter(r => r.name.toLowerCase().includes(searchTerm.toLowerCase()))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-ui-bold text-slate-900 dark:text-slate-100">{t('recipes.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('recipes.description')}</p>
        </div>
        {canManageRecipes && (
          <Link href="/recipes" className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-ui-medium text-white hover:bg-slate-800 shadow-sm transition-colors">
            <ChefHat size={16} />{t('recipes.goToPage')}
          </Link>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder={t('common.search')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" />
        </div>
      </div>

      <VirtualTable
        rows={filtered}
        rowHeight={48}
        overscan={8}
        className="max-h-[calc(100vh-14rem)] bg-white rounded-2xl border border-border shadow-sm dark:bg-slate-900 dark:border-slate-700"
        tableClassName="w-full text-sm"
        header={
          <thead className={virtualTableStickyHeadClass}>
            <tr>
              <th className="text-left px-4 py-3 font-ui-semibold text-slate-600 dark:text-muted-foreground">{t('recipes.table.recipe')}</th>
              <th className="text-left px-4 py-3 font-ui-semibold text-slate-600 dark:text-muted-foreground">{t('recipes.table.product')}</th>
              <th className="text-center px-4 py-3 font-ui-semibold text-slate-600 dark:text-muted-foreground">{t('recipes.table.ingredientCount')}</th>
              <th className="text-right px-4 py-3 font-ui-semibold text-slate-600 dark:text-muted-foreground">{t('recipes.table.cost')}</th>
            </tr>
          </thead>
        }
        emptyState={
          <div className="text-center py-12 text-muted-foreground">{t('common.noMatch')}</div>
        }
        renderRow={(r) => (
          <>
            <td className="px-4 py-3 font-ui-medium text-slate-800 dark:text-slate-200">
              <button onClick={() => setSelectedRecipe(r)} className="hover:text-blue-600 transition-colors flex items-center gap-1.5 focus:outline-none">
                <Eye size={14} className="text-muted-foreground" />
                {r.name}
              </button>
            </td>
            <td className="px-4 py-3 text-slate-600 dark:text-muted-foreground">{r.product_name || t('recipes.independent')}</td>
            <td className="px-4 py-3 text-center">
              <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-ui-semibold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">{r.ingredients?.length || 0}</span>
            </td>
            <td className="px-4 py-3 text-right font-ui-semibold text-slate-800 dark:text-slate-200">
              {formatAmount(r.total_cost || "0", canViewAmounts)}
            </td>
          </>
        )}
      />

      <Dialog open={!!selectedRecipe} onOpenChange={(v) => !v && setSelectedRecipe(null)}>
        <DialogContent className="max-w-2xl dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle>{selectedRecipe?.name} - {t('recipes.details')}</DialogTitle>
          </DialogHeader>
          {selectedRecipe && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100 dark:bg-slate-800 dark:border-slate-700">
                <div>
                  <span className="text-sm text-muted-foreground block">{t('recipes.menuProduct')}</span>
                  <span className="font-ui-semibold text-slate-800 dark:text-slate-200">{selectedRecipe.product_name || t('recipes.independent')}</span>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground block">{t('recipes.totalCost')}</span>
                  <span className="font-ui-bold text-slate-900 dark:text-white">
                    {formatAmount(selectedRecipe.total_cost || "0", canViewAmounts)}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-ui-semibold text-slate-800 mb-2 dark:text-slate-200">{t('recipes.ingredients')} ({selectedRecipe.ingredients?.length || 0})</h4>
                <div className="bg-white rounded-lg border border-border overflow-hidden max-h-60 overflow-y-auto dark:bg-slate-900 dark:border-slate-700">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-border dark:bg-slate-800 dark:border-slate-700">
                      <tr>
                        <th className="text-left px-4 py-2 font-ui-semibold text-slate-600 dark:text-muted-foreground">{t('recipes.table.ingredient')}</th>
                        <th className="text-right px-4 py-2 font-ui-semibold text-slate-600 dark:text-muted-foreground">{t('recipes.table.quantity')}</th>
                        <th className="text-right px-4 py-2 font-ui-semibold text-slate-600 dark:text-muted-foreground">{t('recipes.table.cost')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRecipe.ingredients?.map(ing => (
                        <tr key={ing.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-2 text-slate-800 dark:text-slate-200">{ing.stock_item_name}</td>
                          <td className="px-4 py-2 text-right text-slate-600 dark:text-muted-foreground">
                            {formatNumber(ing.quantity, 2)} {ing.unit}
                          </td>
                          <td className="px-4 py-2 text-right font-ui-medium text-slate-800 dark:text-slate-200">
                            {formatAmount(ing.line_cost || "0", canViewAmounts)}
                          </td>
                        </tr>
                      ))}
                      {(!selectedRecipe.ingredients || selectedRecipe.ingredients.length === 0) && (
                        <tr>
                          <td colSpan={3} className="px-4 py-4 text-center text-muted-foreground">{t('recipes.empty')}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
