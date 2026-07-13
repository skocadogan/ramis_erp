"use client"

import { useTranslations } from "next-intl"
import { Plus, Edit, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
interface Role {
  id: number; name: string; description: string | null; parent_role: number | null
  permissions: number[]; permission_codes: string[]; is_active: boolean
}

interface PermissionRow {
  id: number
  name: string
  code: string
}

interface PermissionCategory {
  id: number; name: string; code: string; description: string | null; permissions: PermissionRow[]
}

interface RolesTabProps {
  roles: Role[]; permCategories: PermissionCategory[]
  onAddRole: () => void; onEditRole: (role: Role) => void; onDeleteRole: (roleId: number) => void
}

export function RolesTab({ roles, permCategories, onAddRole, onEditRole, onDeleteRole }: RolesTabProps) {
  const t = useTranslations("admin")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('roles.title')}</h2>
          <p className="text-sm text-muted-foreground mt-0.5 dark:text-muted-foreground">{t('roles.description')}</p>
        </div>
        <Button onClick={onAddRole}
          className="gap-2">
          <Plus size={15} /> {t('roles.addNew')}
        </Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ maxHeight: "calc(100vh - 220px)" }}>
        <div className="rounded-lg border bg-card border-border flex flex-col min-h-0">
          <div className="rounded-t-lg px-4 py-3 border-b border-border bg-background shrink-0">
            <h3 className="text-ui-sm font-semibold text-foreground">{t('roles.rolesCount', { count: roles.length })}</h3>
          </div>
          <div className="divide-y overflow-y-auto flex-1 min-h-0">
            {roles.map(role => (
              <div key={role.id} className="px-4 py-3 flex items-center justify-between hover:/50 dark:hover:/50">
                <div>
                  <span className="text-ui font-medium text-foreground text-foreground">{role.name}</span>
                  {role.description && <p className="text-xs text-muted-foreground mt-0.5 dark:text-muted-foreground">{role.description}</p>}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {permCategories
                      .flatMap(cat => cat.permissions)
                      .filter(perm => role.permission_codes.includes(perm.code))
                      .slice(0, 5)
                      .map(perm => (
                        <span key={perm.code} className="rounded-md border border-border px-1.5 py-0.5 text-xs bg-muted border-border dark:text-muted-foreground">{perm.name}</span>
                      ))}
                    {role.permission_codes.length > 5 && (
                      <span className="text-2xs font-medium text-muted-foreground dark:text-muted-foreground self-center ml-1">{t('roles.more', { count: role.permission_codes.length - 5 })}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => onEditRole(role)} className="p-1.5 rounded-md hover: text-muted-foreground hover:text-blue-600 dark:hover:" title={t('common.edit')}>
                    <Edit size={14} />
                  </button>
                  <button onClick={() => onDeleteRole(role.id)} className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600 dark:hover:bg-red-900/30" title={t('common.delete')}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-card border-border flex flex-col min-h-0">
          <div className="rounded-t-lg px-4 py-3 border-b border-border bg-background shrink-0">
            <h3 className="text-ui-sm font-semibold text-foreground">{t('roles.permCategories')}</h3>
          </div>
          <div className="divide-y overflow-y-auto flex-1 min-h-0">
            {permCategories.map(cat => (
              <div key={cat.id} className="px-4 py-3 hover:/30 dark:hover:/20 transition-colors">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-ui font-medium text-foreground text-foreground">{cat.name}</span>
                  <span className="rounded-full px-2 py-0.5 text-2xs font-medium text-muted-foreground bg-muted dark:text-muted-foreground">{cat.permissions.length}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {cat.permissions.map(perm => (
                    <span key={perm.id} className="rounded-md border border-border px-2 py-1 text-xs bg-muted border-border dark:text-muted-foreground" title={perm.code}>
                      {perm.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
