"use client"

import { useTranslations } from "next-intl"
import React, { useState } from "react"
import { Folder, FolderOpen, ChevronRight, ChevronDown, Plus, Edit, Trash2, Settings2 } from "lucide-react"
import { RecipeCategory } from "../types"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface RecipeCategoryManagementModalProps {
  open: boolean
  onClose: () => void
  categories: RecipeCategory[]
  onAddCategory: (parentId?: string) => void
  onEditCategory: (category: RecipeCategory) => void
  onDeleteCategory: (category: RecipeCategory) => void
}

export function RecipeCategoryManagementModal({
  open,
  onClose,
  categories,
  onAddCategory,
  onEditCategory,
  onDeleteCategory,
}: RecipeCategoryManagementModalProps) {
  const t = useTranslations("recipes.categoryManagement")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = new Set(expandedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedIds(next)
  }

  const getVisibleCategories = (
    items: RecipeCategory[],
    parentId: string | null = null,
    depth = 0,
  ): (RecipeCategory & { depth: number; hasChildren: boolean })[] => {
    const filtered = items.filter((item) => (parentId ? item.parent === parentId : !item.parent))
    const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name))

    return sorted.flatMap((item) => {
      const childrenCount = items.filter((c) => c.parent === item.id).length
      const hasChildren = childrenCount > 0
      const result = [{ ...item, depth, hasChildren }]
      const isExpanded = expandedIds.has(item.id)

      if (isExpanded && hasChildren) {
        result.push(...getVisibleCategories(items, item.id, depth + 1))
      }
      return result
    })
  }

  const visibleCategories = getVisibleCategories(categories)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent layout="scroll" size="lg" className="max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 size={16} className="text-blue-600" />
            {t("title")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-2.5">
          <span className="text-2xs font-ui-bold uppercase tracking-widest text-muted-foreground">
            {t("categoriesCount", { count: categories.length })}
          </span>
          <Button type="button" size="sm" onClick={() => onAddCategory()}>
            <Plus size={12} />
            {t("newRootCategory")}
          </Button>
        </div>

        <DialogBody className="min-h-0 flex-1 overflow-y-auto p-3">
          {categories.length === 0 ? (
            <div className="py-16 text-center">
              <Folder size={32} className="mx-auto mb-3 text-muted-foreground/30" />
              <h4 className="text-xs font-ui-semibold text-muted-foreground">{t("empty")}</h4>
            </div>
          ) : (
            <div>
              {visibleCategories.map((cat) => (
                <div
                  key={cat.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-background",
                  )}
                  style={{ marginLeft: `${cat.depth * 1.2}rem` }}
                >
                  <div
                    className="flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center text-muted-foreground/50 transition-colors hover:text-blue-500"
                    onClick={(e) => cat.hasChildren && toggleExpand(cat.id, e)}
                  >
                    {cat.hasChildren ? (
                      expandedIds.has(cat.id) ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )
                    ) : (
                      <div className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    {cat.hasChildren ? (
                      expandedIds.has(cat.id) ? (
                        <FolderOpen size={15} className="shrink-0 text-amber-400" />
                      ) : (
                        <Folder size={15} className="shrink-0 text-amber-400" />
                      )
                    ) : (
                      <Folder size={15} className="shrink-0 text-amber-300/60" />
                    )}
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate text-ui-sm font-ui-medium text-foreground">{cat.name}</span>
                      <span className="rounded bg-muted px-1 font-mono text-[9px] uppercase tracking-tighter text-muted-foreground">
                        {cat.code}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 opacity-20 transition-opacity group-hover:opacity-100">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onAddCategory(cat.id)}
                      title={t("addSubcategory")}
                    >
                      <Plus size={14} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onEditCategory(cat)}
                      title={t("edit")}
                    >
                      <Edit size={14} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onDeleteCategory(cat)}
                      title={t("delete")}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" onClick={onClose}>
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
