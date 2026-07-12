"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { ChevronDown, ChevronRight, Folder, FolderOpen, Search, Check } from "lucide-react"
import { RecipeCategory } from "../types"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface RecipeCategorySelectTreeProps {
  categories: RecipeCategory[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function RecipeCategorySelectTree({
  categories,
  value,
  onChange,
  placeholder,
  className,
}: RecipeCategorySelectTreeProps) {
  const t = useTranslations("recipes.categorySelect")
  const resolvedPlaceholder = placeholder ?? t("placeholder")
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
    items: RecipeCategory[],
    parentId: string | null = null,
    depth = 0
  ): (RecipeCategory & { depth: number; hasChildren: boolean })[] => {
    const term = searchTerm.toLowerCase()

    const checkMatch = (item: RecipeCategory): boolean => {
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
              "flex w-full items-center justify-between rounded-lg border border-input bg-transparent px-3 py-2 text-left text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none",
              className
            )}
          >
            <span className={cn("truncate font-ui-semibold text-ui-sm text-foreground", !selectedCategory && "text-muted-foreground")}>
              {selectedCategory ? `${selectedCategory.name}` : resolvedPlaceholder}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        )}
      />
      <PopoverContent className="z-[60] w-[var(--base-popover-trigger-width)] overflow-hidden rounded-xl border-border bg-background p-0 shadow-lg" align="start">
        <div className="flex h-80 flex-col bg-background">
          <div className="border-b border-border bg-background p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 border-border bg-background pl-9 text-xs text-foreground focus-visible:ring-1 focus-visible:ring-blue-500/50"
              />
            </div>
          </div>
          <div id={listId} className="custom-scrollbar flex-1 overflow-auto bg-background p-2" role="listbox">
              <div
                onClick={() => {
                  onChange("")
                  setOpen(false)
                }}
                className={cn(
                  "group mb-1 flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-all hover:bg-foreground/5",
                  !value && "border-blue-100 bg-blue-50 text-blue-600 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400"
                )}
              >
                <div className="flex h-5 w-5 items-center justify-center">
                  <div className={cn("h-2 w-2 rounded-full", !value ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-muted-foreground/30")} />
                </div>
                <span className="text-xs font-ui-semibold text-muted-foreground">{t("allCategories")}</span>
              {!value && <Check className="h-4 w-4 ml-auto text-blue-500" />}
            </div>

            {visibleCategories.length === 0 && searchTerm !== "" ? (
              <div className="py-10 text-center text-xs text-muted-foreground italic">{t("noMatch")}</div>
            ) : (
              visibleCategories.map((cat) => (
                <div
                  key={cat.id}
                  onClick={() => {
                    onChange(cat.id)
                    setOpen(false)
                  }}
                  className={cn(
                    "group mb-0.5 flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-3 py-2 transition-all hover:bg-foreground/5",
                    value === cat.id && "border-blue-100 bg-blue-50 font-ui-bold text-blue-600 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400"
                  )}
                  style={{ paddingLeft: `${cat.depth * 1.5 + 0.75}rem` }}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3 text-muted-foreground group-hover:text-foreground">
                    <div className="flex h-5 w-5 items-center justify-center">
                      {cat.hasChildren ? (
                        <button
                          onClick={(e) => toggleExpand(cat.id, e)}
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-foreground/10"
                        >
                          {expandedIds.has(cat.id) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      ) : (
                        <div className="ml-1 h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                      )}
                    </div>
                    {cat.hasChildren ? (
                      expandedIds.has(cat.id) ? (
                        <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
                      ) : (
                        <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                      )
                    ) : (
                      <Folder className="h-4 w-4 shrink-0 text-muted-foreground opacity-40 transition-opacity group-hover:opacity-100" />
                    )}
                    <span className="truncate text-ui-sm tracking-tight text-foreground">{cat.name}</span>
                  </div>
                  {value === cat.id && (
                    <Check className="h-4 w-4 text-blue-600 dark:text-blue-500" />
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
