"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Plus, Search, Users, Edit, Trash2, RotateCcw, Eye } from "lucide-react"
import { BranchDetailModal } from "../modals/BranchDetailModal"
import { BranchEditModal } from "../modals/BranchEditModal"
import { DeleteConfirmModal } from "../modals/DeleteConfirmModal"
import { cn } from "@/lib/utils"
import type { Branch } from "@/types/user.types"

interface BranchesTabProps {
  branches: Branch[]
  deletedBranches: Branch[]
  /** Şube oluşturma / silme / silinenler sekmesi vb. */
  canManageBranches: boolean
  isAdmin: boolean
  searchTerm: string
  setSearchTerm: (s: string) => void
  onAdd: () => void
  onDelete: (id: string, name: string, force?: boolean) => void
  onRestore: (id: string, name: string) => void
  onRefresh: () => void
}

export function BranchesTab({ 
  branches,
  deletedBranches,
  canManageBranches,
  isAdmin,
  searchTerm,
  setSearchTerm,
  onAdd,
  onDelete,
  onRestore,
  onRefresh,
}: BranchesTabProps) {
  const t = useTranslations("branches")
  const tAdmin = useTranslations("admin")
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [deletingBranch, setDeletingBranch] = useState<{ id: string, name: string, isHard: boolean } | null>(null)

  const currentList = canManageBranches && showDeleted ? deletedBranches : branches
  const filtered = currentList.filter(b =>
    b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.code.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-ui-semibold text-foreground">
            {canManageBranches ? t('title') : t('titlePersonal')}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5 dark:text-muted-foreground">
            {canManageBranches
              ? t('description')
              : t('descriptionPersonal')}
          </p>
        </div>
        {canManageBranches ? (
          <button onClick={onAdd}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-sm font-ui-medium text-white hover:bg-blue-700 transition-all">
            <Plus size={15} /> {t('addNew')}
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder={tAdmin('common.search')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-4 py-1.5 bg-white border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" />
        </div>

        {canManageBranches ? (
          <div className="flex items-center bg-slate-100 p-1 rounded-lg dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setShowDeleted(false)}
              className={cn(
                "px-3 py-1 text-xs font-ui-medium rounded-md transition-all",
                !showDeleted ? "bg-white shadow-sm text-blue-600 dark:bg-slate-700 dark:text-blue-400" : "text-muted-foreground hover:text-slate-700"
              )}
            >
              {t('activeBranches', { count: branches.length })}
            </button>
            <button
              type="button"
              onClick={() => setShowDeleted(true)}
              className={cn(
                "px-3 py-1 text-xs font-ui-medium rounded-md transition-all flex items-center gap-1",
                showDeleted ? "bg-white shadow-sm text-red-600 dark:bg-slate-700 dark:text-red-400" : "text-muted-foreground hover:text-slate-700"
              )}
            >
              {t('deletedBranches', { count: deletedBranches.length })}
            </button>
          </div>
        ) : null}
      </div>

      <div className="bg-white rounded-lg border border-border overflow-auto dark:bg-slate-900 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-border dark:bg-slate-800 dark:border-slate-700">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('name')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('code')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('phone')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('address')}</th>
              {canManageBranches ? (
                <th className="text-left px-4 py-2.5 text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('users')}</th>
              ) : null}
              {canManageBranches ? (
                <th className="text-right px-4 py-2.5 text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{tAdmin('common.actions')}</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={canManageBranches ? 6 : 4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {currentList.length === 0
                    ? !canManageBranches
                      ? t('empty.personal')
                      : showDeleted
                        ? t('empty.deleted')
                        : t('empty.active')
                    : t('empty.noMatch')}
                </td>
              </tr>
            ) : (
            filtered.map(b => (
              <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50/50 dark:border-slate-700 dark:hover:bg-slate-800/50">
                <td className="px-4 py-3 font-ui-medium text-foreground">{b.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{b.code}</td>
                <td className="px-4 py-3 text-muted-foreground">{b.phone || "-"}</td>
                <td className="px-4 py-3 text-slate-600 text-xs dark:text-muted-foreground">{b.address || "-"}</td>
                {canManageBranches ? (
                <>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Users size={14} className="text-muted-foreground dark:text-muted-foreground" />
                    <span className="font-ui-semibold text-foreground">{b.users_count || 0}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {!showDeleted ? (
                      <>
                        <button type="button" onClick={() => setEditingBranch(b)} className="p-1.5 rounded-md hover:bg-slate-100 text-muted-foreground hover:text-blue-600 transition dark:hover:bg-slate-800" title={tAdmin('common.edit')}>
                          <Edit size={14} />
                        </button>
                        {isAdmin && (
                          <button 
                            type="button"
                            onClick={() => setDeletingBranch({ id: b.id, name: b.name, isHard: false })} 
                            className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-600 transition dark:hover:bg-red-900/20" 
                            title={tAdmin('common.delete')}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {isAdmin && (
                          <>
                            <button 
                              type="button"
                              onClick={() => onRestore(b.id, b.name)} 
                              className="p-1.5 rounded-md hover:bg-green-50 text-muted-foreground hover:text-green-600 transition dark:hover:bg-green-900/20" 
                              title={tAdmin('common.restore')}
                            >
                              <RotateCcw size={14} />
                            </button>
                            <button 
                              type="button"
                              onClick={() => setDeletingBranch({ id: b.id, name: b.name, isHard: true })} 
                              className="p-1.5 rounded-md hover:bg-red-100 text-red-500 hover:text-red-700 transition dark:hover:bg-red-900/40" 
                              title={t('hardDelete')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedBranch(b)}
                      className="p-1.5 rounded-md hover:bg-slate-100 text-muted-foreground hover:text-blue-600 transition dark:hover:bg-slate-800"
                      title={t('details')}
                    >
                      <Eye size={14} />
                    </button>
                  </div>
                </td>
                </>
                ) : null}
              </tr>
            ))
            )}
          </tbody>
        </table>
      </div>
      {selectedBranch && <BranchDetailModal branch={selectedBranch} onClose={() => setSelectedBranch(null)} />}
      {editingBranch && <BranchEditModal branch={editingBranch} onClose={() => setEditingBranch(null)} onSuccess={() => { setEditingBranch(null); onRefresh() }} />}
      
      <DeleteConfirmModal
        isOpen={!!deletingBranch}
        onClose={() => setDeletingBranch(null)}
        onConfirm={() => {
          if (deletingBranch) {
            onDelete(deletingBranch.id, deletingBranch.name, deletingBranch.isHard)
            setDeletingBranch(null)
          }
        }}
        isHardDelete={deletingBranch?.isHard}
        title={deletingBranch?.isHard ? t('modals.hardDeleteTitle') : t('modals.deleteTitle')}
        description={
          deletingBranch?.isHard
            ? t('modals.hardDeleteDesc', { name: deletingBranch?.name || "" })
            : t('modals.deleteDesc', { name: deletingBranch?.name || "" })
        }
        confirmText={deletingBranch?.isHard ? t('modals.hardDeleteConfirm') : t('modals.deleteConfirm')}
      />
    </div>
  )
}
