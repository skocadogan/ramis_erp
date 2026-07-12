"use client"

import { useCallback, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Check, ChevronDown, Hash, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MenuTag } from "@/features/menu/types"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface MenuTagSelectProps {
  value: string[]
  onChange: (ids: string[]) => void
  tags: MenuTag[]
  className?: string
  disabled?: boolean
}

export function MenuTagSelect({
  value,
  onChange,
  tags,
  className,
  disabled = false,
}: MenuTagSelectProps) {
  const t = useTranslations("menu_management")
  const [open, setOpen] = useState(false)

  const selectedTags = useMemo(
    () => tags.filter((tag) => value.includes(tag.id)),
    [tags, value],
  )

  const toggle = useCallback(
    (id: string) => {
      if (value.includes(id)) {
        onChange(value.filter((v) => v !== id))
      } else {
        onChange([...value, id])
      }
    },
    [value, onChange],
  )

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={disabled}
          className={cn(
            "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors outline-none",
            "focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            open && "ring-1 ring-ring",
          )}
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {selectedTags.length === 0 ? (
              <span className="text-muted-foreground">{t("menuTags.placeholder")}</span>
            ) : (
              selectedTags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-0.5 rounded-md bg-violet-50 px-1.5 py-0.5 text-xs font-ui-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                >
                  <Hash size={10} className="opacity-70" />
                  {tag.name.replace(/^#/, "")}
                </span>
              ))
            )}
          </div>
          <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(100vw-2rem,20rem)] p-0 bg-background">
          <div className="max-h-56 overflow-y-auto p-1">
            {tags.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">{t("menuTags.emptyManageHint")}</p>
            ) : (
              tags.map((tag) => {
                const selected = value.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggle(tag.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        selected
                          ? "border-violet-500 bg-violet-500 text-white"
                          : "border-border bg-background",
                      )}
                    >
                      {selected ? <Check size={10} /> : null}
                    </span>
                    <Hash size={12} className="text-violet-500 shrink-0" />
                    <span className="truncate font-ui-medium">{tag.name}</span>
                  </button>
                )
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      {selectedTags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {selectedTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggle(tag.id)}
              className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-2xs font-ui-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-200"
            >
              {tag.name}
              <X size={10} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
