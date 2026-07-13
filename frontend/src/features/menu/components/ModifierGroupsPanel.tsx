"use client"

import { ListTree, Plus, Pencil, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ModifierGroup, MenuModifier } from "@/features/menu/types"
import { formatAmount } from "@/lib/formatters"
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts"

interface Props {
  groups: ModifierGroup[]
  selectedGroupId: string | null
  canManage: boolean
  isSubmitting: boolean
  modifierForm: { name: string; price_adjustment: string }
  onSelectGroup: (id: string) => void
  onAddGroup: () => void
  onEditGroup: (group: ModifierGroup) => void
  onDeleteGroup: (group: ModifierGroup) => void
  onModifierFormChange: (patch: Partial<{ name: string; price_adjustment: string }>) => void
  onAddModifier: () => void
  onDeleteModifier: (modifier: MenuModifier) => void
}

export default function ModifierGroupsPanel({
  groups,
  selectedGroupId,
  canManage,
  isSubmitting,
  modifierForm,
  onSelectGroup,
  onAddGroup,
  onEditGroup,
  onDeleteGroup,
  onModifierFormChange,
  onAddModifier,
  onDeleteModifier,
}: Props) {
  const t = useTranslations("menu_management.modifierGroups")
  const canViewAmounts = useCanViewAmounts()
  const selected = groups.find((g) => g.id === selectedGroupId) ?? null

  return (
    <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
      <div className="w-60 shrink-0 flex flex-col rounded-lg border border-border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-3 py-2 border-border">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <ListTree size={14} className="text-blue-600" />
            {t("groupsTitle")}
          </h2>
          {canManage && (
            <button
              type="button"
              onClick={onAddGroup}
              className="text-muted-foreground hover:text-blue-600"
              aria-label={t("addGroup")}
            >
              <Plus size={15} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {groups.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">{t("emptyGroups")}</p>
          ) : (
            groups.map((g) => {
              const active = g.id === selectedGroupId
              return (
                <div
                  key={g.id}
                  className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${
 active
 ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
 : " hover: text-muted-foreground dark:hover:"
 }`}
                >
                  <button type="button" className="flex-1 text-left truncate" onClick={() => onSelectGroup(g.id)}>
                    {g.name}
                    {g.is_required && (
                      <span className="ml-1 text-2xs uppercase text-amber-600">{t("requiredBadge")}</span>
                    )}
                  </button>
                  {canManage && (
                    <div className="flex shrink-0 gap-0.5">
                      <button type="button" onClick={() => onEditGroup(g)} className="p-1 text-muted-foreground hover:text-blue-600">
                        <Pencil size={12} />
                      </button>
                      <button type="button" onClick={() => onDeleteGroup(g)} className="p-1 text-muted-foreground hover:text-red-600">
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
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">{t("selectGroupHint")}</div>
        ) : (
          <>
            <div className="border-b border-border px-4 py-3 border-border">
              <h3 className="text-sm font-semibold text-foreground">{selected.name}</h3>
              <p className="text-xs text-muted-foreground">
                {selected.is_multiple ? t("multipleHint") : t("singleHint")}
                {selected.is_required ? ` · ${t("requiredHint")}` : ""}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {(selected.modifiers ?? []).map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 border-border"
                >
                  <span className="text-sm font-medium">{m.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {formatAmount(m.price_adjustment, canViewAmounts)}
                    </span>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => onDeleteModifier(m)}
                        disabled={isSubmitting}
                        className="text-muted-foreground hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {canManage && (
                <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4 border-border">
                  <div className="flex flex-col gap-1">
                    <label className="text-2xs font-medium text-muted-foreground">{t("modifierName")}</label>
                    <input
                      value={modifierForm.name}
                      onChange={(e) => onModifierFormChange({ name: e.target.value })}
                      className="rounded-md border border-border px-2 py-1.5 text-sm border-border bg-muted"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-2xs font-medium text-muted-foreground">{t("modifierPrice")}</label>
                    <input
                      value={modifierForm.price_adjustment}
                      onChange={(e) => onModifierFormChange({ price_adjustment: e.target.value })}
                      className="w-24 rounded-md border border-border px-2 py-1.5 text-sm border-border bg-muted"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={isSubmitting || !modifierForm.name.trim()}
                    onClick={onAddModifier}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {t("addModifier")}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
