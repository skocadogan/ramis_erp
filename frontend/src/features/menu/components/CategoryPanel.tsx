"use client"

import { useState, useMemo, useCallback } from "react"
import { Layers, Plus, Pencil, Trash2, ChevronRight, ChevronDown, Folder, FolderOpen } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { formatTagsForBranch, getTagsForBranch } from "@/features/menu/lib/menuTagFilter"
import type { Category, Product } from "@/features/menu/types"

interface Props {
  categories: Category[]
  products: Product[]
  selectedCategory: string | null
  canManage: boolean
  onSelect: (id: string | null) => void
  onAdd?: () => void
  onEdit?: (cat: Category) => void
  onDelete?: (cat: Category) => void
  onAddSubcategory?: (cat: Category) => void
  className?: string
  visibleCategoryIds?: Set<string> | null
  tagBranchId?: string | null
}

export default function CategoryPanel({
  categories, products, selectedCategory, canManage,
  onSelect, onAdd, onEdit, onDelete, onAddSubcategory, className,
  visibleCategoryIds = null,
  tagBranchId = null,
}: Props) {
  const t = useTranslations("menu_management")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpand = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Kategori başına toplam ürün sayısı (alt kategoriler dahil)
  const totalCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    const productCountByCategory: Record<string, number> = {}
    products.forEach(p => {
      productCountByCategory[p.category] = (productCountByCategory[p.category] || 0) + 1
    })

    const calculateTotal = (id: string): number => {
      if (counts[id] !== undefined) return counts[id]
      let total = productCountByCategory[id] || 0
      const children = categories.filter(c => c.parent === id)
      children.forEach(child => {
        total += calculateTotal(child.id)
      })
      counts[id] = total
      return total
    }

    categories.forEach(cat => calculateTotal(cat.id))
    return counts
  }, [categories, products])

  // Hiyerarşik görünür kategori listesi
  type VisibleCat = Category & { depth: number; hasChildren: boolean; total_count: number }

  const visibleCategories = useMemo((): VisibleCat[] => {
    const buildTree = (parentId: string | null = null, depth = 0): VisibleCat[] => {
      return categories
        .filter(item => (parentId ? item.parent === parentId : !item.parent))
        .filter(item => !visibleCategoryIds || visibleCategoryIds.has(item.id))
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
        .flatMap(item => {
          const hasChildren = categories.some(c => c.parent === item.id)
          const result: VisibleCat[] = [{
            ...item, depth, hasChildren,
            total_count: totalCounts[item.id] || 0,
          }]
          if (hasChildren && expandedIds.has(item.id)) {
            result.push(...buildTree(item.id, depth + 1))
          }
          return result
        })
    }
    return buildTree()
  }, [categories, expandedIds, totalCounts, visibleCategoryIds])

  const expandAll = useCallback(() => {
    setExpandedIds(new Set(categories.map(c => c.id)))
  }, [categories])

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set())
  }, [])

  return (
    <div className={cn("flex w-72 shrink-0 flex-col gap-2 overflow-hidden", className)}>
      {/* Başlık & araçlar */}
      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
          <Layers size={13} className="text-blue-600" />{t("categoryPanel.title")}
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={expandAll} className="text-2xs font-medium px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400" title={t("categoryPanel.expandAll")}>
            +
          </button>
          <button onClick={collapseAll} className="text-2xs font-medium px-2 py-1 rounded hover: bg-muted dark:text-muted-foreground" title={t("categoryPanel.collapseAll")}>
            -
          </button>
          {canManage && onAdd && (
            <button type="button" onClick={onAdd}
              className="text-muted-foreground hover:text-blue-600 transition-colors ml-0.5" aria-label={t("categoryPanel.addAria")}>
              <Plus size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Ağaç liste */}
      <div className="rounded-lg border border-border flex flex-col flex-1 overflow-hidden bg-card border-border">
        <div className="flex-1 overflow-y-auto no-scrollbar p-1.5">
          {/* "Tümü" butonu */}
          <button onClick={() => onSelect(null)}
            className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors mb-1
 ${!selectedCategory
 ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
 : " hover: dark:text-muted-foreground dark:hover:"}`}>
            {t("categoryPanel.allWithCount", { count: products.length })}
          </button>

          {visibleCategories.length === 0 && categories.length > 0 ? (
            <div className="text-center py-4 text-xs text-muted-foreground">{t("categoryPanel.noVisible")}</div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {visibleCategories.map(cat => (
                <CategoryTreeItem
                  key={cat.id}
                  cat={cat}
                  isSelected={selectedCategory === cat.id}
                  canManage={canManage}
                  onSelect={onSelect}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onAddSubcategory={onAddSubcategory}
                  onToggle={toggleExpand}
                  tagBranchId={tagBranchId}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface ItemProps {
  cat: Category & { depth: number; hasChildren: boolean; total_count: number }
  isSelected: boolean
  canManage: boolean
  onSelect: (id: string | null) => void
  onEdit?: (cat: Category) => void
  onDelete?: (cat: Category) => void
  onAddSubcategory?: (cat: Category) => void
  onToggle: (id: string, e: React.MouseEvent) => void
  tagBranchId?: string | null
}

function CategoryTreeItem({ cat, isSelected, canManage, onSelect, onEdit, onDelete, onAddSubcategory, onToggle, tagBranchId }: ItemProps) {
  const t = useTranslations("menu_management")
  const branchTags = getTagsForBranch(cat.tags, tagBranchId ?? null)
  const tagLabel = formatTagsForBranch(cat.tags, tagBranchId ?? null)

  return (
    <div className={`group rounded-md transition-colors ${isSelected ? "bg-blue-50 dark:bg-blue-900/30" : "hover: dark:hover:"}`}>
      <div className="flex items-center" style={{ paddingLeft: `${cat.depth * 1.25}rem` }}>
        {/* Genişlet/daralt ok */}
        <div className="w-5 h-5 flex items-center justify-center shrink-0">
          {cat.hasChildren ? (
            <button onClick={(e) => onToggle(cat.id, e)}
              className="p-0.5 rounded hover: dark:hover: text-muted-foreground transition-colors">
              {cat.hasChildren ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : (
            <div className="w-0.5 h-0.5 rounded-full bg-accent ml-1" />
          )}
        </div>

        {/* Kategori adı / seçim */}
        <button onClick={() => onSelect(cat.id)}
          className="flex-1 text-left px-1.5 py-1.5 text-sm font-medium transition-colors min-w-0 flex items-start gap-2">
          {cat.hasChildren ? (
            <FolderOpen size={14} className="text-amber-500 shrink-0 mt-0.5" />
          ) : (
            <Folder size={14} className="text-amber-400/70 shrink-0 mt-0.5" />
          )}
          <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: cat.color || '#3b82f6' }} />
          <div className="min-w-0 flex-1">
            <span className={`block truncate ${isSelected ? "text-blue-700 dark:text-blue-300" : "text-muted-foreground"}`}>
              {cat.name}
            </span>
            {branchTags.length > 0 && (
              <div className="mt-0.5 flex flex-col gap-0.5" title={tagLabel}>
                {branchTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="block truncate text-2xs font-medium text-violet-600 dark:text-violet-400"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className="text-xs text-muted-foreground shrink-0 tabular-nums mt-0.5">
            {cat.total_count}
          </span>
        </button>

        {/* Aksiyon butonları */}
        {canManage && (onEdit || onDelete || onAddSubcategory) && (
          <div className="flex items-center gap-0.5 pr-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {onAddSubcategory && (
              <button onClick={() => onAddSubcategory(cat)}
                className="p-1 rounded text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors"
                title={t("categoryPanel.addSubAria")}>
                <Plus size={11} />
              </button>
            )}
            {onEdit && (
              <button onClick={() => onEdit(cat)}
                className="p-1 rounded text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                aria-label={t("categoryPanel.editAria")}>
                <Pencil size={11} />
              </button>
            )}
            {onDelete && (
              <button onClick={() => onDelete(cat)}
                className="p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                aria-label={t("categoryPanel.deleteAria")}>
                <Trash2 size={11} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
