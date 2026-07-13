"use client"

import { useTranslations } from "next-intl"
import React, { useState } from "react"
import { Folder, FolderOpen, ChevronRight, ChevronDown, Layers, Settings2 } from "lucide-react"
import { RecipeCategory } from "../types"
import { cn } from "@/lib/utils"

interface RecipeCategoryTreeViewProps {
  categories: RecipeCategory[]
  selectedCategoryId: string | null
  onCategorySelect: (id: string | null) => void
  onManageCategories?: () => void
}

export function RecipeCategoryTreeView({
  categories,
  selectedCategoryId,
  onCategorySelect,
  onManageCategories
}: RecipeCategoryTreeViewProps) {
  const t = useTranslations("recipes.categoryTree")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = new Set(expandedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedIds(next)
  }

  const getVisibleCategories = (items: RecipeCategory[], parentId: string | null = null, depth = 0): (RecipeCategory & { depth: number; hasChildren: boolean })[] => {
    const filtered = items.filter(item => (parentId ? item.parent === parentId : !item.parent))
    const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name))

    return sorted.flatMap(item => {
      const childrenCount = items.filter(c => c.parent === item.id).length
      const hasChildren = childrenCount > 0
      const result = [{ ...item, depth, hasChildren }]
      const isExpanded = expandedIds.has(item.id)

      if (isExpanded && hasChildren) {
        result.push(...getVisibleCategories(items, item.id, depth + 1))
      }
      return result
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-slate-100 border-border flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Layers size={14} className="text-blue-600" />
          {t("title")}
        </h3>
        {onManageCategories && (
          <button
            onClick={onManageCategories}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-2xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 transition-colors group"
          >
            <Settings2 size={11} className="group-hover:rotate-45 transition-transform" />
            {t("manage")}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-2 custom-scrollbar">
        <div
          onClick={() => onCategorySelect(null)}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all mb-1",
            !selectedCategoryId
              ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-bold"
              : " hover: dark:text-muted-foreground dark:hover:/50"
          )}
        >
          <div className="w-4 h-4 flex items-center justify-center">
            <div className={cn("w-1.5 h-1.5 rounded-full", !selectedCategoryId ? "bg-blue-600" : "")} />
          </div>
          <span className="text-xs font-medium">{t("allRecipes")}</span>
        </div>

        {categories.length === 0 ? (
          <div className="py-8 text-center text-2xs text-muted-foreground italic">{t("noCategories")}</div>
        ) : (
          getVisibleCategories(categories).map(cat => (
            <div
              key={cat.id}
              onClick={() => onCategorySelect(cat.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all group mb-0.5",
                selectedCategoryId === cat.id
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-bold shadow-sm border border-blue-100 dark:border-blue-800/50"
                  : " hover: dark:text-muted-foreground dark:hover:/40"
              )}
              style={{ marginLeft: `${cat.depth * 0.75}rem` }}
            >
              <div
                className="w-4 h-4 flex items-center justify-center shrink-0"
                onClick={(e) => cat.hasChildren && toggleExpand(cat.id, e)}
              >
                {cat.hasChildren ? (
                  expandedIds.has(cat.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />
                ) : (
                  null
                )}
              </div>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {cat.hasChildren ? (
                  expandedIds.has(cat.id) ?
                    <FolderOpen size={14} className="text-amber-500 shrink-0" /> :
                    <Folder size={14} className="text-amber-500 shrink-0" />
                ) : (
                  <Folder size={14} className="text-amber-400 opacity-60 shrink-0" />
                )}
                <span className="text-xs truncate">{cat.name}</span>
              </div>
              {cat.recipes_count !== undefined && cat.recipes_count > 0 && (
                <span className={cn(
                  "text-2xs px-1.5 py-0.5 rounded-full font-medium",
                  selectedCategoryId === cat.id
                    ? "bg-blue-600 text-white"
                    : " text-muted-foreground bg-muted dark:text-muted-foreground"
                )}>
                  {cat.recipes_count}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
