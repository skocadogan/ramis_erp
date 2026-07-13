"use client"

import { useTranslations } from "next-intl"
import React, { useState } from "react"
import { Users, Clock, Trash2, ChevronDown, Calculator } from "lucide-react"
import {
  TooltipProvider,
} from "@/components/ui/tooltip"
import type { Recipe } from "../types"
import { formatAmount, formatQuantity } from "@/lib/formatters"
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts"
import { AsyncPdfExportButton } from "@/components/AsyncPdfExportButton"

interface RecipeCardProps {
  recipe: Recipe
  onEdit?: () => void
  onDelete?: () => void
}

export function RecipeCard({ recipe, onEdit, onDelete }: RecipeCardProps) {
  const t = useTranslations("recipes.card")
  const [isIngredientsExpanded, setIsIngredientsExpanded] = useState(false)
  const [isCardExpanded, setIsCardExpanded] = useState(false)
  const canViewAmounts = useCanViewAmounts()

  return (
    <TooltipProvider delay={300}>
    <div className="rounded-xl border border-border shadow-sm overflow-hidden flex flex-col bg-card border-border transition-all hover:shadow-md group">
      {/* Top Section: Header & Metadata */}
      <div className="p-4 flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 flex items-start gap-2">
            <button
              onClick={() => setIsCardExpanded(!isCardExpanded)}
              className="mt-0.5 p-1 text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-all shrink-0"
              title={isCardExpanded ? t("collapse") : t("expand")}
            >
              <ChevronDown
                size={18}
                className={`transition-transform duration-300 ${isCardExpanded ? "rotate-180" : ""}`}
              />
            </button>
            <div className="min-w-0 cursor-pointer" onClick={() => setIsCardExpanded(!isCardExpanded)}>
              <h3 className="font-bold text-foreground truncate text-base leading-tight" title={recipe.name}>
                {recipe.name}
              </h3>
              <p className="text-ui-sm text-muted-foreground/70 font-medium truncate mt-0.5">
                {recipe.product_name || t("standaloneRecipe")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <AsyncPdfExportButton
              reportSlug="recipe-detail"
              params={{ recipe_id: recipe.id }}
              filename={`${recipe.name.toLowerCase().replace(/ /g, "-")}.pdf`}
              size="icon"
              className="p-0 h-auto w-auto text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 rounded-md transition-colors"
            />
            {onDelete && (
              <button
                onClick={onDelete}
                className="p-1.5 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-500 rounded-md transition-colors"
                title={t("delete")}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Content */}
        {isCardExpanded && (
          <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            {/* Specs: Times & Servings */}
            <div className="grid grid-cols-2 gap-3">
              <div className="/50 bg-card/30 p-2.5 rounded-xl border /80 border-border/50">
                <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
                  <Clock size={14} className="text-blue-500" /> {t("times")}
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-ui-sm">
                    <span className="text-muted-foreground">{t("prep")}</span>
                    <span className="font-bold text-foreground">{t("minutesUnit", { n: recipe.prep_time_minutes })}</span>
                  </div>
                  <div className="flex justify-between text-ui-sm">
                    <span className="text-muted-foreground">{t("cook")}</span>
                    <span className="font-bold text-foreground">{t("minutesUnit", { n: recipe.cook_time_minutes })}</span>
                  </div>
                </div>
              </div>

              <div className="/50 bg-card/30 p-2.5 rounded-xl border /80 border-border/50">
                <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
                  <Users size={14} className="text-amber-500" /> {t("portion")}
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-ui-sm">
                    <span className="text-muted-foreground">{t("qty")}</span>
                    <span className="font-bold text-foreground">{t("piecesUnit", { count: recipe.servings })}</span>
                  </div>
                  {recipe.serving_quantity && (
                    <div className="flex justify-between text-ui-sm text-blue-600 dark:text-blue-400 font-semibold">
                      <span>{t("onePortionShort")}</span>
                      <span>{formatQuantity(recipe.serving_quantity)} {recipe.serving_unit}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Recipe Times (Per serving) */}
            {(recipe.prep_time_per_serving > 0 || recipe.cook_time_per_serving > 0) && (
              <div className="flex items-center gap-3 px-1 border-y py-2 border-border/50">
                <span className="text-sub text-muted-foreground font-medium">{t("perServingShort")}</span>
                <div className="flex gap-2">
                  {recipe.prep_time_per_serving > 0 && (
                    <span className="text-2xs font-bold bg-blue-50/80 text-blue-700 px-2 py-0.5 rounded-full dark:bg-blue-900/30 dark:text-blue-400">
                      {t("perServingPrep", { minutes: recipe.prep_time_per_serving })}
                    </span>
                  )}
                  {recipe.cook_time_per_serving > 0 && (
                    <span className="text-2xs font-bold bg-amber-50/80 text-amber-700 px-2 py-0.5 rounded-full dark:bg-amber-900/30 dark:text-amber-400">
                      {t("perServingCook", { minutes: recipe.cook_time_per_serving })}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Cost Section */}
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between text-sub px-1">
                <span className="text-muted-foreground">{t("totalRecipeCost")}</span>
                <span className="font-bold text-foreground">
                  {formatAmount(recipe.total_cost || "0", canViewAmounts)}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-600 dark:bg-blue-600 rounded-xl shadow-sm">
                <div className="flex items-center gap-2 font-bold text-white/90">
                  <Calculator size={15} />
                  <span className="text-xs">{t("costPerServing")}</span>
                </div>
                <span className="text-base font-bold text-white tracking-tight">
                  {formatAmount(recipe.cost_per_serving || "0", canViewAmounts)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions Footer */}
      {isCardExpanded && (
        <div className="flex border-t border-border divide-x divide-border shrink-0 animate-in fade-in duration-500">
          {onEdit && (
            <button
              onClick={onEdit}
              className="flex-1 py-2.5 text-xs font-bold hover: hover:text-blue-600 transition-colors dark:text-muted-foreground dark:hover: dark:hover:text-blue-400"
            >
              {t("edit")}
            </button>
          )}
          <button
            onClick={() => setIsIngredientsExpanded(!isIngredientsExpanded)}
            className={`flex-1 py-2.5 text-xs font-bold transition-colors
 ${isIngredientsExpanded
 ? 'bg-blue-700 text-white'
 : 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'
 }`}
          >
            {isIngredientsExpanded ? t("hide") : t("ingredientsCount", { count: recipe.ingredients?.length || 0 })}
          </button>
        </div>
      )}

      {isCardExpanded && isIngredientsExpanded && recipe.ingredients && (
        <div className="border-t p-4 bg-muted border-border animate-in zoom-in-95 duration-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2">{t("colIngredient")}</th>
                <th className="pb-2 text-right">{t("colQty")}</th>
                <th className="pb-2 text-right">{t("colCost")}</th>
              </tr>
            </thead>
            <tbody>
              {recipe.ingredients.map(ing => (
                <tr key={ing.id} className="border-t border-border">
                  <td className="py-1.5 font-medium text-foreground">
                    {ing.ingredient_type === "sub_recipe"
                      ? `${ing.sub_recipe_name} (${t("subRecipeBadge")})`
                      : ing.stock_item_name}
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground">
                    {formatQuantity(ing.quantity)} {ing.unit}
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground">
                    {formatAmount(ing.line_cost || "0", canViewAmounts)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </TooltipProvider>
  )
}
