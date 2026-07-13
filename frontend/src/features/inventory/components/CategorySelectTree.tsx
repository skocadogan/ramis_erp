"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { ChevronDown, ChevronRight, Folder, FolderOpen, Search, Check } from "lucide-react"
import { StockCategory } from "@/features/inventory/types"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface CategorySelectTreeProps {
  categories: StockCategory[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function CategorySelectTree({
  categories,
  value,
  onChange,
  placeholder,
  className,
}: CategorySelectTreeProps) {
  const t = useTranslations("inventory")
  const displayPlaceholder = placeholder ?? t("itemForm.categoryPh")
  const [open, setOpen] = React.useState(false)
  const listId = React.useId()
  const [searchTerm, setSearchTerm] = React.useState("")
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())

  const selectedCategory = categories.find((c) => c.id === value)

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const next = new Set(expandedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedIds(next)
  }

  const buildTree = (
    items: StockCategory[],
    parentId: string | null = null,
    depth = 0
  ): (StockCategory & { depth: number; hasChildren: boolean })[] => {
    const term = searchTerm.toLowerCase()

    const checkMatch = (item: StockCategory): boolean => {
      if (item.name.toLowerCase().includes(term) || item.code.toLowerCase().includes(term)) return true
      const children = items.filter((c) => c.parent === item.id)
      return children.some(checkMatch)
    }

    const filtered = items.filter((item) => (parentId ? item.parent === parentId : !item.parent))
    const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name))

    return sorted.flatMap((item) => {
      const children = items.filter((c) => c.parent === item.id)
      const hasChildren = children.length > 0
      const isVisible = term === "" || checkMatch(item)

      if (!isVisible) return []

      const result = [{ ...item, depth, hasChildren }]
      const isExpanded = (term !== "" && checkMatch(item)) || expandedIds.has(item.id)

      if (isExpanded && hasChildren) {
        result.push(...buildTree(items, item.id, depth + 1))
      }
      return result
    })
  }

  const visibleCategories = buildTree(categories)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props) => (
          <button
            {...props}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2  border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-muted border-input text-foreground",
              className
            )}
          >
            <span className={cn("truncate", !selectedCategory && "text-muted-foreground")}>
              {selectedCategory ? `${selectedCategory.name} (${selectedCategory.code})` : displayPlaceholder}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        )}
      />
      <PopoverContent className="w-[var(--base-popover-trigger-width)] p-0" align="start">
        <div className="flex flex-col h-72">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={t("categoryTree.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-xs border-none shadow-none focus-visible:ring-0"
              />
            </div>
          </div>
          <div id={listId} className="flex-1 overflow-auto p-1" role="listbox">
            <div
              onClick={() => {
                onChange("")
                setOpen(false)
              }}
              className={cn(
                "flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer hover: dark:hover: transition-all group mb-1",
                !value && "  border border-border bg-muted text-foreground"
              )}
            >
              <div className="w-5 h-5 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full" />
              </div>
              <span className="text-sm italic text-muted-foreground">{t("categoryTree.rootCategory")}</span>
              {!value && <Check className="h-3.5 w-3.5 ml-auto text-blue-600" />}
            </div>

            {visibleCategories.length === 0 && searchTerm !== "" ? (
              <div className="py-6 text-center text-xs text-muted-foreground">{t("categoryTree.emptyCategories")}</div>
            ) : (
              visibleCategories.map((cat) => (
                <div
                  key={cat.id}
                  onClick={() => {
                    onChange(cat.id)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex items-center gap-1 px-2 py-2 rounded-md cursor-pointer hover: dark:hover: transition-all group",
                    value === cat.id && "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-semibold"
                  )}
                  style={{ paddingLeft: `${cat.depth * 1.5 + 0.75}rem` }}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-5 h-5 flex items-center justify-center">
                      {cat.hasChildren ? (
                        <button
                          onClick={(e) => toggleExpand(cat.id, e)}
                          className="p-1 hover: dark:hover: rounded-md text-muted-foreground transition-colors"
                        >
                          {expandedIds.has(cat.id) ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ) : (
                        <div className="w-1.5 h-1.5 rounded-full ml-1 bg-accent" />
                      )}
                    </div>
                    {cat.hasChildren ? (
                      expandedIds.has(cat.id) ? (
                        <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
                      ) : (
                        <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                      )
                    ) : (
                      <Folder className="h-4 w-4 text-amber-400 opacity-60 shrink-0" />
                    )}
                    <span className="text-sm truncate">{cat.name}</span>
                    <span className="text-2xs text-muted-foreground font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      {cat.code}
                    </span>
                  </div>
                  {value === cat.id && (
                    <div className="flex items-center justify-center size-5 rounded-full bg-blue-600">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
