"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Users, Loader2, Trash2, UserPlus, MapPinned } from "lucide-react"
import { adminApi } from "../../services/adminApi"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { useModulePermissions } from "@/hooks/useModulePermissions"
import { ZoneManageModal } from "@/features/tables/components/ZoneManageModal"
import type { Branch, BranchUser, User } from "@/types/user.types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface BranchDetailModalProps {
  branch: Branch
  onClose: () => void
}

export function BranchDetailModal({ branch, onClose }: BranchDetailModalProps) {
  const t = useTranslations("branches")
  const tAdmin = useTranslations("admin")
  const { canManage } = useModulePermissions()
  const canManageZones = canManage("branches.manage_zone")
  const [users, setUsers] = useState<BranchUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAssign, setShowAssign] = useState(false)
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [isAssigning, setIsAssigning] = useState(false)
  const [zoneManageOpen, setZoneManageOpen] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)

  const fetchBranchUsers = useCallback(async () => {
    setIsLoading(true)
    try {
      setUsers(await adminApi.getBranchUsers(branch.id))
    } catch {
      /* liste yüklenemedi */
    } finally {
      setIsLoading(false)
    }
  }, [branch.id])

  useEffect(() => {
    void fetchBranchUsers()
  }, [fetchBranchUsers])

  const fetchAllUsers = async () => {
    try {
      const data = await adminApi.getUsers({ page_size: 1000 })
      setAllUsers(data.results)
    } catch {
      console.error("Kullanıcılar yüklenemedi")
    }
  }

  const handleOpenAssign = () => {
    void fetchAllUsers()
    setSelectedUserIds([])
    setShowAssign(true)
  }

  const handleAssign = async () => {
    if (selectedUserIds.length === 0) return
    setIsAssigning(true)
    try {
      await adminApi.assignUsersToBranch(branch.id, { user_ids: selectedUserIds })
      setShowAssign(false)
      void fetchBranchUsers()
    } catch {
      toast.error(t("detailModal.assignFailed"))
    } finally {
      setIsAssigning(false)
    }
  }

  const confirmRemoveUser = async () => {
    if (!removingUserId) return
    setIsRemoving(true)
    try {
      await adminApi.removeUserFromBranch(branch.id, removingUserId)
      setRemovingUserId(null)
      void fetchBranchUsers()
    } catch {
      toast.error(t("detailModal.removeUserFailed"))
    } finally {
      setIsRemoving(false)
    }
  }

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  const availableUsers = allUsers.filter((u) => !users.some((bu) => bu.id === u.id))

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
        <DialogContent layout="scroll" size="lg">
          <DialogHeader>
            <DialogTitle>{branch.name}</DialogTitle>
            <DialogDescription>
              <span className="font-mono font-medium text-primary">{branch.code}</span>
              {" — "}
              {t("detailModal.usersAssignedSummary", { count: users.length })}
            </DialogDescription>
            {canManageZones && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 w-fit"
                onClick={() => setZoneManageOpen(true)}
              >
                <MapPinned size={14} />
                {t("detailModal.zoneManagement")}
              </Button>
            )}
          </DialogHeader>

          <DialogBody>
            {showAssign ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{t("branchUserModal.title")}</h3>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowAssign(false)}>
                    {tAdmin("common.cancel")}
                  </Button>
                </div>
                <div className="max-h-[300px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {availableUsers.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      {t("detailModal.noAssignableUsers")}
                    </div>
                  ) : (
                    availableUsers.map((u) => (
                      <label
                        key={u.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-background",
                          selectedUserIds.includes(u.id) && "bg-primary/5"
                        )}
                      >
                        <Checkbox
                          checked={selectedUserIds.includes(u.id)}
                          onCheckedChange={() => toggleUserSelection(u.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium">{u.username}</span>
                          {u.branch_name && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({u.branch_name})
                            </span>
                          )}
                        </div>
                      </label>
                    ))
                  )}
                </div>
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => void handleAssign()}
                  disabled={isAssigning || selectedUserIds.length === 0}
                >
                  {isAssigning && <Loader2 size={14} className="animate-spin" />}
                  {isAssigning
                    ? t("detailModal.assigning")
                    : t("detailModal.assignUsersButton", { count: selectedUserIds.length })}
                </Button>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Users size={15} className="text-muted-foreground" />
                    {t("detailModal.assignedUsers")}
                  </h3>
                  <Button type="button" variant="outline" size="sm" onClick={handleOpenAssign}>
                    <UserPlus size={14} />
                    {t("detailModal.addUser")}
                  </Button>
                </div>
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : users.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    {t("detailModal.emptyNoUsers")}
                  </div>
                ) : (
                  <div className="divide-y divide-border rounded-lg border border-border">
                    {users.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between px-4 py-3 hover:bg-background"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-sm font-medium">{u.username}</span>
                            {(u.first_name || u.last_name) && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {u.first_name} {u.last_name}
                              </span>
                            )}
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {u.role_names.length > 0 ? (
                                u.role_names.map((r) => (
                                  <Badge key={r} variant="secondary" className="text-3xs">
                                    {r}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-2xs text-muted-foreground">
                                  {t("detailModal.noRole")}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setRemovingUserId(u.id)}
                          title={t("detailModal.removeUser")}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("detailModal.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {zoneManageOpen && (
        <ZoneManageModal
          branchId={branch.id}
          branchName={branch.name}
          branches={[branch]}
          canPickBranch={false}
          canManage={canManageZones}
          onClose={() => setZoneManageOpen(false)}
        />
      )}

      <AlertDialog
        open={!!removingUserId}
        onOpenChange={(open) => !open && setRemovingUserId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("detailModal.confirmRemoveUser")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tAdmin("common.deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>{tAdmin("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmRemoveUser()
              }}
              disabled={isRemoving}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isRemoving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              {tAdmin("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
