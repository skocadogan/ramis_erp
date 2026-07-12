"use client"

import React, { useState } from "react"
import { useTranslations } from "next-intl"
import { Folder, FolderOpen, ChevronRight, ChevronDown, Search, Edit, Plus, Trash2 } from "lucide-react"
import { StockCategory, type TabType } from "@/features/inventory/types"
import { Button } from "@/components/ui/button"

interface CategoryTreeViewProps {
  categories: StockCategory[]
  searchTerm: string
  setSelectedCategoryId: (id: string | null) => void
  setActiveTab: (tab: TabType) => void
  openEditCategory: (cat: StockCategory) => void
  openAddSubcategory: (cat: StockCategory) => void
  openDeleteCategory: (cat: StockCategory) => void
  onNew?: () => void
  isLoading?: boolean
}

export function CategoryTreeView({
  categories, searchTerm, setSelectedCategoryId, setActiveTab, openEditCategory, openAddSubcategory, openDeleteCategory,   onNew, isLoading
}: CategoryTreeViewProps) {
  const t = useTranslations("inventory.categoryTree")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = new Set(expandedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedIds(next)
  }

  const totalCounts = React.useMemo(() => {
    const counts: Record<string, number> = {}

    const calculateTotal = (id: string): number => {
      if (counts[id] !== undefined) return counts[id]
      const cat = categories.find(c => c.id === id)
      if (!cat) return 0
      
      let total = Number(cat.items_count || 0)
      const children = categories.filter(c => c.parent === id)
      children.forEach(child => {
        total += calculateTotal(child.id)
      })
      counts[id] = total
      return total
    }

    categories.forEach(cat => calculateTotal(cat.id))
    return counts
  }, [categories])

  const getVisibleCategories = (items: StockCategory[], parentId: string | null = null, depth = 0): (StockCategory & { depth: number; hasChildren: boolean; total_count: number })[] => {
    const term = searchTerm.toLowerCase()

    const checkMatch = (item: StockCategory): boolean => {
      if (item.name.toLowerCase().includes(term) || item.code.toLowerCase().includes(term)) return true
      const children = items.filter(c => c.parent === item.id)
      return children.some(checkMatch)
    }

    const filtered = items.filter(item => (parentId ? item.parent === parentId : !item.parent))
    const sorted = [...filtered]
      .filter(item => term === "" || checkMatch(item))
      .sort((a, b) => a.name.localeCompare(b.name))

    return sorted.flatMap(item => {
      const childrenCount = items.filter(c => c.parent === item.id).length
      const hasChildren = childrenCount > 0
      const result = [{ ...item, depth, hasChildren, total_count: totalCounts[item.id] || 0 }]
      const isExpanded = (term !== "" && checkMatch(item)) || expandedIds.has(item.id)
      if (isExpanded && hasChildren) {
        result.push(...getVisibleCategories(items, item.id, depth + 1))
      }
      return result
    })
  }

  const toggleAll = (expand: boolean) => {
    if (expand) setExpandedIds(new Set(categories.map(c => c.id)))
    else setExpandedIds(new Set())
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {onNew && (
        <div className="flex justify-between items-center mb-4 px-1">
          <h3 className="font-ui-bold text-foreground">{t("title")}</h3>
          <Button size="sm" onClick={onNew} className="gap-2">
            <Plus className="h-4 w-4" /> {t("newCategory")}
          </Button>
        </div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-lg border border-border dark:bg-slate-900 dark:border-slate-700">
      <div className="p-3 border-b border-slate-100 flex gap-2 dark:border-slate-700">
        <button onClick={() => toggleAll(true)} className="text-xs font-ui-medium px-2.5 py-1.5 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50">
          {t("expandAll")}
        </button>
        <button onClick={() => toggleAll(false)} className="text-xs font-ui-medium px-2.5 py-1.5 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors dark:bg-slate-800 dark:text-muted-foreground dark:hover:bg-slate-700">
          {t("collapseAll")}
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-border dark:bg-slate-800 dark:border-slate-700">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t("colName")}</th>
              <th className="text-left px-3 py-2 text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t("colCodeCount")}</th>
              <th className="text-right px-3 py-2 text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t("colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && categories.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    <span className="text-sm text-muted-foreground font-ui-medium">{t("loading")}</span>
                  </div>
                </td>
              </tr>
            ) : categories.length === 0 ? (
              <tr><td colSpan={3} className="text-center py-12 text-muted-foreground dark:text-muted-foreground">{t("empty")}</td></tr>
            ) : (
              getVisibleCategories(categories).map(cat => (
                <tr key={cat.id} className="border-b border-slate-100 hover:bg-slate-50/50 group transition-colors dark:border-slate-700 dark:hover:bg-slate-800/50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1" style={{ marginLeft: `${cat.depth * 2}rem` }}>
                      <div className="w-6 h-6 flex items-center justify-center">
                        {cat.hasChildren ? (
                          <button onClick={(e) => toggleExpand(cat.id, e)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-muted-foreground transition-colors">
                            {expandedIds.has(cat.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        ) : (
                          <div></div>
                        )}
                      </div>
                      <div className={`flex items-center gap-2 ${cat.hasChildren ? "cursor-pointer" : ""}`}
                        onClick={(e: React.MouseEvent) => cat.hasChildren && toggleExpand(cat.id, e)}>
                        {cat.hasChildren ? (
                          expandedIds.has(cat.id) ?
                            <FolderOpen size={16} className="text-amber-500" /> :
                            <Folder size={16} className="text-amber-500" />
                        ) : (
                          <Folder size={16} className="text-amber-400 opacity-60" />
                        )}
                        <span className={`font-ui-medium ${cat.depth === 0 ? "text-foreground" : "text-foreground"}`}>
                          {cat.name}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-muted-foreground text-2xs font-mono border border-border uppercase dark:bg-slate-800 dark:text-muted-foreground dark:border-slate-600">
                        {cat.code}
                      </span>
                      <span className="text-sub font-ui-medium text-muted-foreground dark:text-muted-foreground">
                        {t("productCount", { count: cat.total_count })}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openAddSubcategory(cat)}
                        className="flex items-center gap-1 text-xs font-ui-medium text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 px-2 py-1 rounded-md transition-all dark:text-emerald-400"
                        title={t("addSubTitle")}>
                        <Plus size={13} /> {t("addSub")}
                      </button>
                      <button onClick={() => { setSelectedCategoryId(cat.id); setActiveTab("items"); }}
                        className="flex items-center gap-1 text-xs font-ui-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-1 rounded-md transition-all dark:text-blue-400">
                        <Search size={13} /> {t("detail")}
                      </button>
                      <button onClick={() => openEditCategory(cat)}
                        className="p-1.5 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-all">
                        <Edit size={15} />
                      </button>
                      <button onClick={() => openDeleteCategory(cat)}
                        className="p-1.5 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-md transition-all">
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
    </div>
  )
}
