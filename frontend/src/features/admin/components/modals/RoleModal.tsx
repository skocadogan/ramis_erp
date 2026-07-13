"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, ChevronDown, Search } from "lucide-react"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

interface Role {
  id: number
  name: string
  description: string | null
  parent_role: number | null
  permissions: number[]
  permission_codes: string[]
  is_active: boolean
}
interface PermissionCategory {
  id: number
  name: string
  code: string
  description: string | null
  permissions: {
    id: number
    name: string
    code: string
    description: string | null
    category: number
    category_name: string
  }[]
}
interface RoleForm {
  name: string
  description: string
  parent_role: number | null
  permission_ids: number[]
}
interface RoleModalProps {
  editingRole: Role | null
  roleForm: RoleForm
  setRoleForm: (f: RoleForm) => void
  roles: Role[]
  permCategories: PermissionCategory[]
  isSubmitting: boolean
  onSubmit: () => void
  onClose: () => void
}

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"

export function RoleModal({
  editingRole,
  roleForm,
  setRoleForm,
  roles,
  permCategories,
  isSubmitting,
  onSubmit,
  onClose,
}: RoleModalProps) {
  const t = useTranslations("admin")
  const [permSearch, setPermSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [expandedCats, setExpandedCats] = useState<Set<number>>(new Set())

  const filteredCategories = useMemo(() => {
    const q = permSearch.trim().toLowerCase()
    return permCategories
      .filter((cat) => (categoryFilter === "all" ? true : String(cat.id) === categoryFilter))
      .map((cat) => {
        if (!q) return cat
        const perms = cat.permissions.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q) ||
            (p.description && p.description.toLowerCase().includes(q))
        )
        return { ...cat, permissions: perms }
      })
      .filter((cat) => cat.permissions.length > 0)
  }, [permCategories, permSearch, categoryFilter])

  useEffect(() => {
    setExpandedCats(new Set(filteredCategories.map((c) => c.id)))
  }, [filteredCategories])

  const totalPerms = permCategories.reduce((sum, c) => sum + c.permissions.length, 0)
  const selectedCount = roleForm.permission_ids.length
  const hasActiveFilters = permSearch.trim() !== "" || categoryFilter !== "all"

  const togglePerm = (permId: number) => {
    if (roleForm.permission_ids.includes(permId)) {
      setRoleForm({
        ...roleForm,
        permission_ids: roleForm.permission_ids.filter((id) => id !== permId),
      })
    } else {
      setRoleForm({ ...roleForm, permission_ids: [...roleForm.permission_ids, permId] })
    }
  }

  const toggleCategory = (cat: PermissionCategory) => {
    const catPermIds = cat.permissions.map((p) => p.id)
    const allSelected = catPermIds.every((id) => roleForm.permission_ids.includes(id))
    if (allSelected) {
      setRoleForm({
        ...roleForm,
        permission_ids: roleForm.permission_ids.filter((id) => !catPermIds.includes(id)),
      })
    } else {
      const newIds = new Set([...roleForm.permission_ids, ...catPermIds])
      setRoleForm({ ...roleForm, permission_ids: Array.from(newIds) })
    }
  }

  const toggleExpand = (catId: number) => {
    setExpandedCats((prev) => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent layout="scroll" size="4xl">
        <DialogHeader>
          <DialogTitle>{editingRole ? t("roles.edit") : t("roles.addNew")}</DialogTitle>
          <DialogDescription>
            {t("roles.permissionCountSummary", { selected: selectedCount, total: totalPerms })}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4 overflow-hidden">
          <div className="shrink-0 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{t("roles.name")}</Label>
                <Input
                  value={roleForm.name}
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  placeholder={t("roles.namePlaceholder")}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("roles.parentRole")}</Label>
                <select
                  value={roleForm.parent_role || ""}
                  onChange={(e) =>
                    setRoleForm({
                      ...roleForm,
                      parent_role: e.target.value ? parseInt(e.target.value, 10) : null,
                    })
                  }
                  className={selectClass}
                >
                  <option value="">{t("roles.parentRoleNone")}</option>
                  {roles
                    .filter((r) => !editingRole || r.id !== editingRole.id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>{t("roles.descriptionLabel")}</Label>
              <Textarea
                value={roleForm.description}
                onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                rows={2}
                placeholder={t("roles.descriptionPlaceholder")}
                className="min-h-0 resize-none"
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 items-center justify-between">
              <Label>{t("roles.permissions")}</Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-1.5 py-0.5 text-2xs"
                  onClick={() =>
                    setRoleForm({
                      ...roleForm,
                      permission_ids: permCategories.flatMap((c) =>
                        c.permissions.map((p) => p.id)
                      ),
                    })
                  }
                >
                  {t("roles.selectAllPerms")}
                </Button>
                <span className="text-muted-foreground/40">|</span>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-1.5 py-0.5 text-2xs text-muted-foreground"
                  onClick={() => setRoleForm({ ...roleForm, permission_ids: [] })}
                >
                  {t("roles.clearPerms")}
                </Button>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={permSearch}
                  onChange={(e) => setPermSearch(e.target.value)}
                  placeholder={t("roles.permissionSearchPlaceholder")}
                  className="pl-8"
                  autoComplete="off"
                />
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:min-w-[12rem]">
                <label htmlFor="role-modal-cat-filter" className="sr-only">
                  {t("roles.categoryFilterLabel")}
                </label>
                <select
                  id="role-modal-cat-filter"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className={selectClass}
                >
                  <option value="all">{t("roles.allCategories")}</option>
                  {permCategories.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto shrink-0 px-0 text-sub"
                  onClick={() => {
                    setPermSearch("")
                    setCategoryFilter("all")
                  }}
                >
                  {t("roles.resetFilters")}
                </Button>
              )}
            </div>

            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-border bg-background"
              role="region"
              aria-label={t("roles.permissionListAriaLabel")}
            >
              {filteredCategories.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("roles.noPermissionsMatchFilter")}
                </p>
              ) : (
                <div className="divide-y divide-border overflow-hidden">
                  {filteredCategories.map((cat) => {
                    const catPermIds = cat.permissions.map((p) => p.id)
                    const selectedInCat = catPermIds.filter((id) =>
                      roleForm.permission_ids.includes(id)
                    ).length
                    const allSelected = selectedInCat === catPermIds.length
                    const noneSelected = selectedInCat === 0
                    const isExpanded = expandedCats.has(cat.id)

                    return (
                      <div key={cat.id}>
                        <div className="flex w-full items-center justify-between px-4 py-2.5 transition-colors hover:bg-accent">
                          <button
                            type="button"
                            onClick={() => toggleExpand(cat.id)}
                            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                          >
                            <ChevronDown
                              size={14}
                              className={cn(
                                "shrink-0 text-muted-foreground transition-transform",
                                !isExpanded && "-rotate-90"
                              )}
                            />
                            <span className="text-ui-sm font-medium text-foreground">
                              {cat.name}
                            </span>
                            <span
                              className={cn(
                                "rounded-full px-1.5 py-0.5 text-2xs font-medium",
                                noneSelected && "bg-muted text-muted-foreground",
                                !noneSelected &&
                                  allSelected &&
                                  "bg-primary/10 text-primary",
                                !noneSelected &&
                                  !allSelected &&
                                  "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                              )}
                            >
                              {selectedInCat}/{catPermIds.length}
                            </span>
                          </button>
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto shrink-0 px-2 py-1 text-2xs"
                            onClick={() => toggleCategory(cat)}
                          >
                            {allSelected
                              ? t("roles.categoryToggleRemove")
                              : t("roles.categoryToggleAll")}
                          </Button>
                        </div>

                        {isExpanded && (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-4 pt-1 pb-3">
                            {cat.permissions.map((perm) => {
                              const isSelected = roleForm.permission_ids.includes(perm.id)
                              const permFieldId = `role-perm-${perm.id}`
                              return (
                                <label
                                  key={perm.id}
                                  htmlFor={permFieldId}
                                  className={cn(
                                    "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors",
                                    isSelected
                                      ? "border border-primary bg-primary/5 ring-1 ring-primary/20"
                                      : "hover:bg-accent"
                                  )}
                                >
                                  <Checkbox
                                    id={permFieldId}
                                    checked={isSelected}
                                    onCheckedChange={() => togglePerm(perm.id)}
                                  />
                                  <span className="text-xs leading-tight text-foreground">
                                    {perm.name}
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogBody>

        <DialogFooter className="sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {editingRole
              ? t("roles.footerEditing", { name: editingRole.name })
              : t("roles.footerCreating")}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting || !roleForm.name.trim()}
            >
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              {isSubmitting
                ? t("common.saving")
                : editingRole
                  ? t("common.update")
                  : t("common.create")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
