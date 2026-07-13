"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { adminApi } from "@/features/admin/services/adminApi"
import type { User, Branch } from "@/types/user.types"
import { UserFormModal } from "./UserFormModal"
import { UserDetailModal } from "./UserDetailModal"
import {
  Plus, Search, Edit, Trash2, Loader2,
  Filter, ArrowUpDown, ArrowUp, ArrowDown, Eye,
} from "lucide-react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table"
import { formatDate } from "@/lib/formatters"
import { pageFromDrfNext } from "@/lib/pagination"
import { Button } from "@/components/ui/button"
const USER_PAGE_SIZE = 50

type SortField = "username" | "email" | "date_joined" | "last_login"
type SortDir = "asc" | "desc"

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ArrowUpDown size={12} className="text-muted-foreground" />
  return sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
}

export function UserList() {
  const t = useTranslations("users")
  const tAdmin = useTranslations("admin")
  const queryClient = useQueryClient()

  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [filterActive, setFilterActive] = useState<string>("")
  const [filterBranch, setFilterBranch] = useState<string>("")
  const [sortField, setSortField] = useState<SortField>("date_joined")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const [showUserForm, setShowUserForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [viewUserId, setViewUserId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  const { data: branches = [] } = useQuery({
    queryKey: ["admin", "branches"],
    queryFn: () => adminApi.getBranches(),
  })

  const { data: roles = [] } = useQuery({
    queryKey: ["admin", "roles"],
    queryFn: () => adminApi.getRoles(),
  })

  const usersQuery = useInfiniteQuery({
    queryKey: ["admin", "users", "infinite", debouncedSearch, filterActive, filterBranch, sortField, sortDir],
    queryFn: async ({ pageParam = 1 }) => {
      const params: Record<string, unknown> = {
        page: pageParam,
        page_size: USER_PAGE_SIZE,
        ordering: sortDir === "desc" ? `-${sortField}` : sortField,
      }
      if (debouncedSearch) params.search = debouncedSearch
      if (filterActive) params.is_active = filterActive
      if (filterBranch) params.branch = filterBranch
      return adminApi.getUsers(params)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => pageFromDrfNext(lastPage.next),
  })

  const users = useMemo(
    () => usersQuery.data?.pages.flatMap((p) => p.results) ?? [],
    [usersQuery.data?.pages],
  )
  const totalCount = usersQuery.data?.pages[0]?.count ?? 0

  const refetchUsers = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["admin", "users"] })
  }, [queryClient])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await adminApi.deleteUser(deleteTarget.id)
      setDeleteTarget(null)
      refetchUsers()
    } catch {
      console.error("Kullanıcı silinemedi")
    } finally {
      setIsDeleting(false)
    }
  }

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("asc") }
  }

  const sel = "border border-border rounded-md px-2.5 py-1.5 text-sm bg-card border-input text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
          <p className="text-sm text-muted-foreground mt-0.5 dark:text-muted-foreground">{t('description', { count: totalCount })}</p>
        </div>
        <Button onClick={() => { setEditingUser(null); setShowUserForm(true) }}
          className="gap-2">
          <Plus size={15} />{t('addNew')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder={t('searchPlaceholder')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-4 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-muted border-input text-foreground" />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-muted-foreground dark:text-muted-foreground" />
          <select value={filterActive} onChange={e => setFilterActive(e.target.value)} className={sel}>
            <option value="">{t('allStatuses')}</option>
            <option value="true">{tAdmin('common.active')}</option>
            <option value="false">{tAdmin('common.passive')}</option>
          </select>
        </div>
        <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className={sel}>
          <option value="">{t('allBranches')}</option>
          {branches.map((b: Branch) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      <div className="rounded-lg border border-border bg-card border-border">
        {usersQuery.isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
        ) : users.length === 0 ? (
          <div className="px-4 py-12 text-center text-muted-foreground dark:text-muted-foreground">{tAdmin('common.noMatch')}</div>
        ) : (
          <VirtualTable
            rows={users}
            rowHeight={64}
            overscan={10}
            fetchMore={usersQuery.fetchNextPage}
            hasMore={!!usersQuery.hasNextPage}
            isFetchingNextPage={usersQuery.isFetchingNextPage}
            className="max-h-[calc(100vh-16rem)]"
            tableClassName="w-full text-sm"
            header={
              <thead className={virtualTableStickyHeadClass}>
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">
                    <button onClick={() => toggleSort("username")} className="flex items-center gap-1 hover: dark:hover:">{t('table.user')} <SortIcon field="username" sortField={sortField} sortDir={sortDir} /></button>
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">
                    <button onClick={() => toggleSort("email")} className="flex items-center gap-1 hover: dark:hover:">{t('table.email')} <SortIcon field="email" sortField={sortField} sortDir={sortDir} /></button>
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('table.branch')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('table.roles')}</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('table.status')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">
                    <button onClick={() => toggleSort("last_login")} className="flex items-center gap-1 hover: dark:hover:">{t('table.lastLogin')} <SortIcon field="last_login" sortField={sortField} sortDir={sortDir} /></button>
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('table.actions')}</th>
                </tr>
              </thead>
            }
            loadingMore={
              <tr>
                <td colSpan={7} className="py-3 text-center">
                  <Loader2 size={16} className="mx-auto animate-spin text-muted-foreground" />
                </td>
              </tr>
            }
            renderRow={(u) => (
              <>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold bg-accent text-muted-foreground">
                      {u.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className="font-medium text-foreground text-foreground">{u.username}</span>
                      {u.is_superuser && <Badge variant="outline" className="ml-1 text-2xs border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">SU</Badge>}
                      {(u.first_name || u.last_name) && <p className="text-xs text-muted-foreground dark:text-muted-foreground">{u.first_name} {u.last_name}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3 text-muted-foreground text-muted-foreground">{u.branch_name || "-"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {u.role_names.length > 0 ? u.role_names.map(role => <Badge key={role} variant="secondary" className="text-2xs">{role}</Badge>) : <span className="text-muted-foreground text-xs dark:text-muted-foreground">-</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={u.is_active ? "default" : "secondary"}>{u.is_active ? tAdmin('common.active') : tAdmin('common.passive')}</Badge>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground text-muted-foreground">{u.last_login ? formatDate(u.last_login) : "-"}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setViewUserId(u.id)} className="p-1.5 rounded-md hover: text-muted-foreground hover: dark:hover:" title={tAdmin('common.edit')}><Eye size={14} /></button>
                    <button onClick={() => { setEditingUser(u); setShowUserForm(true) }} className="p-1.5 rounded-md hover: text-muted-foreground hover:text-blue-600 dark:hover:" title={tAdmin('common.edit')}><Edit size={14} /></button>
                    {!u.is_superuser && <button onClick={() => setDeleteTarget(u)} className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600 dark:hover:bg-red-900/30" title={tAdmin('common.delete')}><Trash2 size={14} /></button>}
                  </div>
                </td>
              </>
            )}
          />
        )}
      </div>

      {showUserForm && <UserFormModal user={editingUser} branches={branches} roles={roles} onClose={() => { setShowUserForm(false); setEditingUser(null) }} onSuccess={() => { setShowUserForm(false); setEditingUser(null); refetchUsers() }} />}
      {viewUserId && <UserDetailModal userId={viewUserId} onClose={() => setViewUserId(null)} />}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('modals.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('modals.deleteDesc', { name: deleteTarget?.username || "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className="bg-muted text-foreground">{tAdmin('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-rose-600 hover:bg-rose-700 text-white">{isDeleting ? t('messages.deleting') : tAdmin('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
