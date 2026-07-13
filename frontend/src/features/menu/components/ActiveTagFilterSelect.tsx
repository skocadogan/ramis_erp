"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Hash, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MenuCatalogSettings, MenuTag } from "@/features/menu/types"
import { NO_TAG_FILTER_VALUE, UNTAGGED_FILTER_VALUE } from "@/features/menu/lib/menuTagFilter"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface ActiveTagFilterSelectProps {
  tags: MenuTag[]
  catalogSettings: MenuCatalogSettings | null
  onSelect: (value: string) => void
  className?: string
  disabled?: boolean
}

function currentValue(settings: MenuCatalogSettings | null): string {
  if (!settings?.has_tags) return NO_TAG_FILTER_VALUE
  if (settings.filter_untagged) return UNTAGGED_FILTER_VALUE
  if (settings.active_tag_id) return settings.active_tag_id
  return NO_TAG_FILTER_VALUE
}

function resolveDisplayLabel(
  value: string,
  tags: MenuTag[],
  catalogSettings: MenuCatalogSettings | null,
  t: (key: string) => string,
): string {
  if (value === NO_TAG_FILTER_VALUE) return t("tagFilter.all")
  if (value === UNTAGGED_FILTER_VALUE) return t("tagFilter.untagged")
  const fromList = tags.find((tag) => tag.id === value)?.name
  if (fromList) return fromList
  if (catalogSettings?.active_tag_id === value && catalogSettings.active_tag_name) {
    return catalogSettings.active_tag_name
  }
  return t("tagFilter.placeholder")
}

export function ActiveTagFilterSelect({
  tags,
  catalogSettings,
  onSelect,
  className,
  disabled,
}: ActiveTagFilterSelectProps) {
  const t = useTranslations("menu_management")
  const [infoOpen, setInfoOpen] = useState(false)

  const tagsForSelect = useMemo(() => {
    const activeId = catalogSettings?.active_tag_id
    if (!activeId || tags.some((tag) => tag.id === activeId)) return tags
    if (!catalogSettings?.active_tag_name) return tags
    return [
      ...tags,
      {
        id: activeId,
        name: catalogSettings.active_tag_name,
        branch: catalogSettings.branch_id ?? undefined,
      },
    ]
  }, [tags, catalogSettings])

  if (!catalogSettings?.has_tags && tags.length === 0) {
    return null
  }

  const value = currentValue(catalogSettings)
  const displayLabel = resolveDisplayLabel(value, tagsForSelect, catalogSettings, t)

  return (
    <>
      <div className={cn("flex items-center gap-1.5 shrink-0", className)}>
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
          {t("tagFilter.activeMenuLabel")}
        </span>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-violet-600 focus:outline-none focus:ring-2 focus:ring-ring/40"
          aria-label={t("tagFilter.infoAria")}
        >
          <Info size={14} />
        </button>
        <Select
          value={value}
          onValueChange={(v) => { if (v) onSelect(v) }}
          disabled={disabled}
        >
          <SelectTrigger
            size="sm"
            className="h-8 min-w-[10rem] border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-200"
          >
            <Hash size={13} className="text-violet-500 shrink-0" />
            <span className="truncate text-sm">{displayLabel}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_TAG_FILTER_VALUE}>{t("tagFilter.all")}</SelectItem>
            <SelectItem value={UNTAGGED_FILTER_VALUE}>{t("tagFilter.untagged")}</SelectItem>
            {tagsForSelect.map((tag) => (
              <SelectItem key={tag.id} value={tag.id}>
                {tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent layout="scroll" size="md">
          <DialogHeader>
            <DialogTitle>{t("tagFilter.infoTitle")}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3 text-sm text-muted-foreground">
            <p>{t("tagFilter.infoParagraph1")}</p>
            <p>{t("tagFilter.infoParagraph2")}</p>
            <p>{t("tagFilter.infoParagraph3")}</p>
            <p>{t("tagFilter.infoParagraph4")}</p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => setInfoOpen(false)}>
              {t("tagFilter.infoClose")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
