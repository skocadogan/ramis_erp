"use client"

import { useEffect, useState, useMemo } from "react"
import { useLocale, useTranslations } from "next-intl"
import { isAxiosError } from "axios"
import { adminApi } from "@/features/admin/services/adminApi"
import type { UserDetail, PermissionCategory } from "@/types/user.types"
import { Loader2, Mail, MapPin, Shield, Clock, Calendar, User as UserIcon } from "lucide-react"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/formatters"

interface UserDetailModalProps {
  userId: string
  onClose: () => void
}

export function UserDetailModal({ userId, onClose }: UserDetailModalProps) {
  const t = useTranslations("users")
  const tAdmin = useTranslations("admin")
  const tDialog = useTranslations("common.dialog")
  const locale = useLocale()
  const [user, setUser] = useState<UserDetail | null>(null)
  const [permCategories, setPermCategories] = useState<PermissionCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const groupedUserPermissions = useMemo(() => {
    if (!user || !permCategories.length) return []
    return permCategories
      .map((cat) => ({
        ...cat,
        userCategoryPermissions: cat.permissions
          .filter((p) => user.all_permissions.includes(p.code))
          .sort((a, b) => a.name.localeCompare(b.name, locale)),
      }))
      .filter((cat) => cat.userCategoryPermissions.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name, locale))
  }, [user, permCategories, locale])

  useEffect(() => {
    let cancelled = false
    const fetchData = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const [userData, permData] = await Promise.all([
          adminApi.getUser(userId),
          adminApi.getPermissionCategories(),
        ])
        if (!cancelled) {
          setUser(userData)
          setPermCategories(permData)
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(
            isAxiosError(e)
              ? (e.response?.data as { error?: string } | undefined)?.error || t("detail.loadError")
              : t("detail.loadError")
          )
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    fetchData()
    return () => {
      cancelled = true
    }
  }, [userId, t])

  const formatUserTimestamp = (dateStr: string | null) => {
    if (!dateStr) return "-"
    return formatDate(dateStr, {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent layout="scroll" size="7xl">
        <DialogHeader>
          <DialogTitle>{t("detail.title")}</DialogTitle>
          <DialogDescription>{t("detail.description")}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {user && !isLoading && !error && (
            <div className="space-y-6">
              <div className="flex items-center gap-4 pb-2">
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10 text-xl font-ui-semibold text-primary">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-ui-semibold text-foreground">
                      {user.first_name || user.last_name
                        ? `${user.first_name} ${user.last_name}`.trim()
                        : user.username}
                    </h3>
                    {user.is_superuser && (
                      <Badge
                        variant="outline"
                        className="border-amber-200 bg-amber-50 text-2xs font-ui-medium tracking-wider text-amber-700 uppercase dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                      >
                        {t("isSuperuser")}
                      </Badge>
                    )}
                    {!user.is_active && (
                      <Badge
                        variant="destructive"
                        className="text-2xs font-ui-medium tracking-wider uppercase"
                      >
                        {tAdmin("common.passive")}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="rounded border border-border bg-background px-2 py-0.5 text-muted-foreground">
                      @{user.username}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-background p-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                <InfoRow icon={Mail} label={t("email")} value={user.email || "-"} />
                <InfoRow
                  icon={MapPin}
                  label={t("branch")}
                  value={user.branch_name || t("detail.unassignedBranch")}
                />
                <InfoRow
                  icon={UserIcon}
                  label={tAdmin("common.status")}
                  value={
                    <Badge variant={user.is_active ? "default" : "secondary"}>
                      {user.is_active ? tAdmin("common.active") : tAdmin("common.passive")}
                    </Badge>
                  }
                />
                <InfoRow
                  icon={Shield}
                  label={t("detail.accessLabel")}
                  value={
                    user.is_superuser
                      ? t("detail.accessSuperuser")
                      : user.is_staff
                        ? t("detail.accessStaff")
                        : t("detail.accessNormal")
                  }
                />
                <InfoRow
                  icon={Calendar}
                  label={t("detail.dateJoined")}
                  value={formatUserTimestamp(user.date_joined)}
                />
                <InfoRow
                  icon={Clock}
                  label={t("table.lastLogin")}
                  value={formatUserTimestamp(user.last_login)}
                />
              </div>

              <div className="border-t border-border pt-5">
                <h4 className="mb-2.5 flex items-center gap-2 text-xs font-ui-semibold uppercase tracking-wider text-muted-foreground">
                  <Shield size={14} className="text-muted-foreground" />
                  {t("table.roles")}
                </h4>
                {user.roles && user.roles.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {user.roles.map((role) => (
                      <Badge key={role.id} variant="secondary" className="px-2.5 py-1 text-sub font-ui-medium">
                        {role.name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm italic text-muted-foreground">{t("detail.noRoles")}</p>
                )}
              </div>

              {groupedUserPermissions.length > 0 && (
                <div className="border-t border-border pt-5">
                  <h4 className="mb-4 flex items-center gap-2 text-xs font-ui-semibold uppercase tracking-wider text-muted-foreground">
                    <Shield size={14} className="text-primary" />
                    {t("detail.modulePermissions", { count: user.all_permissions.length })}
                  </h4>
                  <div className="grid max-h-[400px] grid-cols-2 gap-3 overflow-y-auto pr-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {groupedUserPermissions.map((cat) => (
                      <div
                        key={cat.id}
                        className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3"
                      >
                        <h5 className="flex items-center justify-between text-sub font-ui-semibold uppercase tracking-tight text-foreground">
                          <span>{cat.name}</span>
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-ui-medium text-primary">
                            {cat.userCategoryPermissions.length}
                          </span>
                        </h5>
                        <div className="flex flex-wrap gap-1">
                          {cat.userCategoryPermissions.map((p) => (
                            <span
                              key={p.id}
                              className="inline-flex items-center rounded-md border border-border bg-background px-1.5 py-0.5 text-2xs font-ui-medium text-muted-foreground"
                            >
                              {p.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button onClick={onClose}>
            {tDialog("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-2xs font-ui-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className="mt-0.5 text-sm font-ui-medium text-foreground">{value}</div>
      </div>
    </div>
  )
}
