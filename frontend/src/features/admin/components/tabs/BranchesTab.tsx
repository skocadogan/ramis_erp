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
          <h2 className="text-lg font-semibold text-foreground">
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
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-all">
            <Plus size={15} /> {t('addNew')}
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder={tAdmin('common.search')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-4 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-muted border-input text-foreground" />
        </div>

        {canManageBranches ? (
          <div className="flex items-center p-1 rounded-lg bg-muted">
            <button
              type="button"
              onClick={() => setShowDeleted(false)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-all",
                !showDeleted ? "shadow-sm text-blue-600 bg-accent dark:text-blue-400" : "text-muted-foreground hover:"
              )}
            >
              {t('activeBranches', { count: branches.length })}
            </button>
            <button
              type="button"
              onClick={() => setShowDeleted(true)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1",
                showDeleted ? "shadow-sm text-red-600 bg-accent dark:text-red-400" : "text-muted-foreground hover:"
              )}
            >
              {t('deletedBranches', { count: deletedBranches.length })}
            </button>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-border overflow-auto bg-card border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted border-border">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('name')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('code')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('phone')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('address')}</th>
              {canManageBranches ? (
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('users')}</th>
              ) : null}
              {canManageBranches ? (
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{tAdmin('common.actions')}</th>
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
              <tr key={b.id} className="border-b hover:/50 border-border dark:hover:/50">
                <td className="px-4 py-3 font-medium text-foreground">{b.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{b.code}</td>
                <td className="px-4 py-3 text-muted-foreground">{b.phone || "-"}</td>
                <td className="px-4 py-3 text-xs dark:text-muted-foreground">{b.address || "-"}</td>
                {canManageBranches ? (
                <>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Users size={14} className="text-muted-foreground dark:text-muted-foreground" />
                    <span className="font-semibold text-foreground">{b.users_count || 0}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {!showDeleted ? (
                      <>
                        <button type="button" onClick={() => setEditingBranch(b)} className="p-1.5 rounded-md hover: text-muted-foreground hover:text-blue-600 transition dark:hover:" title={tAdmin('common.edit')}>
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
                      className="p-1.5 rounded-md hover: text-muted-foreground hover:text-blue-600 transition dark:hover:"
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
