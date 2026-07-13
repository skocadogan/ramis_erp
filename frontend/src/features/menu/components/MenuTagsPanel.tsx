"use client"

import { Hash, Loader2, Pencil, Plus, Tag, Trash2, Building2 } from "lucide-react"
import { useTranslations } from "next-intl"
import type { MenuTag } from "@/features/menu/types"
import type { Branch } from "@/types/user.types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"

interface Props {
  tags: MenuTag[]
  branches: Branch[]
  branchId: string | null
  selectedTagId: string | null
  isLoading: boolean
  canManage: boolean
  isSubmitting: boolean
  onBranchChange: (branchId: string) => void
  onSelectTag: (id: string) => void
  onAddTag: () => void
  onEditTag: (tag: MenuTag) => void
  onDeleteTag: (tag: MenuTag) => void
}

export default function MenuTagsPanel({
  tags,
  branches,
  branchId,
  selectedTagId,
  isLoading,
  canManage,
  isSubmitting,
  onBranchChange,
  onSelectTag,
  onAddTag,
  onEditTag,
  onDeleteTag,
}: Props) {
  const t = useTranslations("menu_management.menuTagsTab")
  const selected = tags.find((tag) => tag.id === selectedTagId) ?? null
  const branchName = branches.find((b) => b.id === branchId)?.name

  return (
    <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
      <div className="w-72 shrink-0 flex flex-col rounded-lg border border-border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-3 py-2 space-y-2 border-border">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 text-muted-foreground">
              <Tag size={14} className="text-violet-600" />
              {t("listTitle")}
            </h2>
            {canManage && branchId && (
              <button
                type="button"
                onClick={onAddTag}
                className="text-muted-foreground hover:text-violet-600"
                aria-label={t("addTag")}
              >
                <Plus size={15} />
              </button>
            )}
          </div>
          {branches.length > 0 && (
            <Select value={branchId ?? ""} onValueChange={(v) => { if (v) onBranchChange(v) }}>
              <SelectTrigger size="sm" className="h-8 w-full">
                <Building2 size={13} className="text-muted-foreground shrink-0" />
                <span className="truncate text-sm">
                  {branchName ?? t("selectBranch")}
                </span>
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !branchId ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">{t("selectBranchHint")}</p>
          ) : tags.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">{t("empty")}</p>
          ) : (
            tags.map((tag) => {
              const active = tag.id === selectedTagId
              return (
                <div
                  key={tag.id}
                  className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${
                    active
                      ? "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                      : "text-slate-600 hover:bg-slate-100 text-muted-foreground dark:hover:bg-slate-800"
                  }`}
                >
                  <button type="button" className="flex flex-1 items-center gap-1.5 text-left truncate min-w-0" onClick={() => onSelectTag(tag.id)}>
                    <Hash size={12} className="shrink-0 text-violet-500" />
                    <span className="truncate">{tag.name}</span>
                  </button>
                  {canManage && (
                    <div className="flex shrink-0 gap-0.5">
                      <button type="button" onClick={() => onEditTag(tag)} className="p-1 text-muted-foreground hover:text-violet-600">
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteTag(tag)}
                        disabled={isSubmitting}
                        className="p-1 text-muted-foreground hover:text-red-600"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col rounded-lg border border-border border-border bg-card overflow-hidden">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {branchId ? t("selectTagHint") : t("selectBranchHint")}
          </div>
        ) : (
          <>
            <div className="border-b border-border px-4 py-4 border-border">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                    <Hash size={18} className="text-violet-500" />
                    {selected.name}
                  </h3>
                  {branchName && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("branchLabel")}: {branchName}
                    </p>
                  )}
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onEditTag(selected)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Pencil size={12} />
                      {t("edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteTag(selected)}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 size={12} />
                      {t("delete")}
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-sm text-muted-foreground">{t("detailHint")}</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
