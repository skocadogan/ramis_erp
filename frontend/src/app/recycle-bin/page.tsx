"use client"

import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { useTranslations, useLocale } from "next-intl"
import { ArchiveRestore, Trash2, ShieldAlert, Loader2, RefreshCcw, Search, Database } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { tr, enUS } from "date-fns/locale"

import { AppShell } from "@/components/shell/AppShell"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { useAuthStore } from "@/store/useAuthStore"
import { toastApiError } from "@/lib/operationalToast"
import { cn } from "@/lib/utils"
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table"

import { recycleBinApi, parseRecycleBinDeleteError, type RecycleBinSummary, type RecycleBinItem } from "@/features/recycle-bin/services/recycleBinApi"
import { DeleteConfirmModal } from "@/features/admin/components/modals/DeleteConfirmModal"
import { ForceDeleteConfirmModal } from "@/features/recycle-bin/components/ForceDeleteConfirmModal"

function RecycleBinContent() {
  const t = useTranslations("recycle_bin")
  const locale = useLocale()
  const dateLocale = locale === "tr" ? tr : enUS

  const user = useAuthStore((s) => s.user)


  const [selectedModel, setSelectedModel] = useState<RecycleBinSummary | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [itemToHardDelete, setItemToHardDelete] = useState<RecycleBinItem | null>(null)
  const [itemToForceDelete, setItemToForceDelete] = useState<RecycleBinItem | null>(null)
  const [forceDeleteDependencies, setForceDeleteDependencies] = useState<string[]>([])
  const [isForcePreviewLoading, setIsForcePreviewLoading] = useState(false)
  const [isRestoreAllOpen, setIsRestoreAllOpen] = useState(false)
  const [isEmptyBinOpen, setIsEmptyBinOpen] = useState(false)

  const openForceDeleteFlow = async (item: RecycleBinItem, initialDeps?: string[]) => {
    setItemToForceDelete(item)
    if (initialDeps && initialDeps.length > 0) {
      setForceDeleteDependencies(initialDeps)
      return
    }
    setForceDeleteDependencies([])
    setIsForcePreviewLoading(true)
    try {
      const preview = await recycleBinApi.previewForceDelete(item.app_label, item.model_name, item.id)
      setForceDeleteDependencies(preview.dependencies ?? [])
    } catch (e) {
      const parsed = parseRecycleBinDeleteError(e, t("toast.forceDeletePreviewFailed"))
      toast.error(parsed.message)
      setItemToForceDelete(null)
    } finally {
      setIsForcePreviewLoading(false)
    }
  }

  const summaryQuery = useQuery({
    queryKey: ["recycle-bin", "summary"],
    queryFn: () => recycleBinApi.getSummary(),
    enabled: !!user?.is_superuser,
  })

  const summaries = summaryQuery.data ?? []

  const itemsQuery = useQuery({
    queryKey: ["recycle-bin", "items", selectedModel?.app_label, selectedModel?.model_name, searchTerm],
    queryFn: () => recycleBinApi.getItems(selectedModel!.app_label, selectedModel!.model_name, searchTerm),
    enabled: !!user?.is_superuser && !!selectedModel,
  })

  const restoreMutation = useMutation({
    mutationFn: (item: RecycleBinItem) => recycleBinApi.restore(item.app_label, item.model_name, item.id),
    onSuccess: (data) => {
      toast.success(data.message || t("toast.restored"))
      itemsQuery.refetch()
      summaryQuery.refetch()
    },
    onError: (e) => {
      toastApiError(e, t("toast.restoreFailed"))
    },
  })

  const hardDeleteMutation = useMutation({
    mutationFn: (item: RecycleBinItem) => recycleBinApi.hardDelete(item.app_label, item.model_name, item.id),
    onSuccess: (data) => {
      toast.success(data.message || t("toast.hardDeleted"))
      setItemToHardDelete(null)
      itemsQuery.refetch()
      summaryQuery.refetch()
    },
    onError: (e, item) => {
      const parsed = parseRecycleBinDeleteError(e, t("toast.hardDeleteFailed"))
      toast.error(parsed.message)
      setItemToHardDelete(null)
      if (parsed.can_force_delete) {
        void openForceDeleteFlow(item, parsed.dependencies)
      }
    },
  })

  const forceDeleteMutation = useMutation({
    mutationFn: (item: RecycleBinItem) =>
      recycleBinApi.forceHardDelete(item.app_label, item.model_name, item.id),
    onSuccess: (data) => {
      toast.success(data.message || t("toast.forceHardDeleted"))
      setItemToForceDelete(null)
      setForceDeleteDependencies([])
      itemsQuery.refetch()
      summaryQuery.refetch()
    },
    onError: (e) => {
      toastApiError(e, t("toast.forceHardDeleteFailed"))
    },
  })

  const restoreAllMutation = useMutation({
    mutationFn: () => recycleBinApi.restoreAll(selectedModel!.app_label, selectedModel!.model_name),
    onSuccess: (data) => {
      toast.success(data.message || t("toast.allRestored"))
      setIsRestoreAllOpen(false)
      itemsQuery.refetch()
      summaryQuery.refetch()
    },
    onError: (e) => {
      toastApiError(e, t("toast.restoreAllFailed"))
    },
  })

  const emptyBinMutation = useMutation({
    mutationFn: () => recycleBinApi.emptyBin(selectedModel!.app_label, selectedModel!.model_name),
    onSuccess: (data) => {
      toast.success(data.message || t("toast.binEmptied"))
      setIsEmptyBinOpen(false)
      itemsQuery.refetch()
      summaryQuery.refetch()
    },
    onError: (e) => {
      toastApiError(e, t("toast.emptyFailed"))
    },
  })

  if (!user?.is_superuser) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <ShieldAlert className="h-16 w-16 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-foreground">{t("unauthorized.title")}</h2>
          <p className="text-muted-foreground max-w-md mx-auto mt-2">{t("unauthorized.description")}</p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex h-full bg-background overflow-hidden">
        <div className="w-64 border-r border-border border-border flex flex-col shrink-0">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Database size={16} className="text-indigo-500" />
              {t("sidebar.categories")}
            </h2>
            <button
              onClick={() => summaryQuery.refetch()}
              className="p-1 rounded hover:bg-slate-100 text-muted-foreground dark:hover:bg-slate-800"
              title={t("sidebar.refreshTitle")}
              type="button"
            >
              <RefreshCcw size={14} className={summaryQuery.isFetching ? "animate-spin text-blue-500" : ""} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {summaryQuery.isLoading ? (
              <div className="p-4 flex justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : summaries.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">{t("emptySummary")}</div>
            ) : (
              summaries.map((s) => (
                <button
                  key={`${s.app_label}-${s.model_name}`}
                  type="button"
                  onClick={() => {
                    setSelectedModel(s)
                    setSearchTerm("")
                  }}
                  className={cn(
                    "w-full text-left flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors",
                    selectedModel?.app_label === s.app_label && selectedModel?.model_name === s.model_name
                      ? "bg-indigo-50 text-indigo-700 font-medium dark:bg-indigo-900/30 dark:text-indigo-400"
                      : "text-slate-600 hover:bg-slate-100 dark:text-muted-foreground dark:hover:bg-slate-800",
                  )}
                >
                  <span className="truncate">{s.verbose_name}</span>
                  <span className="bg-slate-200 text-slate-600 bg-muted dark:text-muted-foreground text-2xs px-1.5 py-0.5 rounded-full font-bold">
                    {s.count}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="p-4 sm:p-6 border-b border-border shadow-sm z-10 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <ArchiveRestore className="text-blue-600 dark:text-blue-500" />
                {t("header.title")}
              </h2>
              <p className="text-sm text-muted-foreground mt-1 dark:text-muted-foreground">{t("header.subtitle")}</p>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4 sm:p-6">
            {!selectedModel ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <ArchiveRestore className="h-12 w-12 opacity-20 mb-3" />
                <p>{t("selectCategoryHint")}</p>
              </div>
            ) : (
              <div className="rounded-t-lg border text-sm border-border rounded-lg shadow-sm bg-card border-border flex flex-col h-full max-h-[800px]">
                <div className="p-3 border-b rounded-t-lg flex flex-wrap gap-3 justify-between items-center bg-muted/50 border-border">
                  <div className="flex items-center gap-4">
                    <h3 className="font-semibold text-foreground">
                      {t("toolbar.deletedRecords", { model: selectedModel.verbose_name })}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsRestoreAllOpen(true)}
                        disabled={restoreAllMutation.isPending || itemsQuery.data?.length === 0}
                        className="text-sub font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 transition-colors disabled:opacity-50"
                      >
                        <RefreshCcw size={12} className={restoreAllMutation.isPending ? "animate-spin" : ""} />
                        {t("toolbar.restoreAll")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEmptyBinOpen(true)}
                        disabled={emptyBinMutation.isPending || itemsQuery.data?.length === 0}
                        className="text-sub font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 bg-rose-50 px-2 py-1 rounded border border-rose-100 transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={12} className={emptyBinMutation.isPending ? "animate-spin" : ""} />
                        {t("toolbar.emptyBin")}
                      </button>
                    </div>
                  </div>
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder={t("toolbar.searchPlaceholder")}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-sm bg-card border border-border rounded-md focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex-1 min-h-0">
                  {itemsQuery.isLoading ? (
                    <div className="p-8 flex justify-center">
                      <Loader2 className="animate-spin text-blue-500" />
                    </div>
                  ) : itemsQuery.data?.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">{t("noSearchResults")}</div>
                  ) : (
                    <VirtualTable
                      rows={itemsQuery.data ?? []}
                      rowHeight={44}
                      overscan={10}
                      className="h-full"
                      tableClassName="w-full text-left border-collapse"
                      header={
                        <thead className={virtualTableStickyHeadClass}>
                          <tr>
                            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{t("table.id")}</th>
                            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{t("table.name")}</th>
                            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">{t("table.deletedAt")}</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">{t("table.actions")}</th>
                          </tr>
                        </thead>
                      }
                      renderRow={(item) => (
                        <>
                          <td className="px-4 py-2 font-mono text-sub text-muted-foreground">{item.id}</td>
                          <td className="px-4 py-2 font-medium text-foreground">{item.name}</td>
                          <td className="px-4 py-2 text-muted-foreground text-xs">
                            {item.deleted_at
                              ? format(new Date(item.deleted_at), "dd MMM yyyy, HH:mm", { locale: dateLocale })
                              : "-"}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => restoreMutation.mutate(item)}
                                disabled={
                                  restoreMutation.isPending ||
                                  hardDeleteMutation.isPending ||
                                  forceDeleteMutation.isPending
                                }
                                className="px-2 py-1 bg-green-50 text-green-600 rounded hover:bg-green-100 min-w-20 text-xs dark:bg-green-900/20 dark:text-green-500 dark:hover:bg-green-900/40 transition-colors"
                              >
                                {t("actions.restore")}
                              </button>
                              <button
                                type="button"
                                disabled={
                                  restoreMutation.isPending ||
                                  hardDeleteMutation.isPending ||
                                  forceDeleteMutation.isPending
                                }
                                onClick={() => setItemToHardDelete(item)}
                                className="px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 text-xs dark:bg-red-900/20 dark:text-red-500 dark:hover:bg-red-900/40 transition-colors"
                              >
                                {t("actions.hardDelete")}
                              </button>
                              <button
                                type="button"
                                disabled={
                                  restoreMutation.isPending ||
                                  hardDeleteMutation.isPending ||
                                  forceDeleteMutation.isPending
                                }
                                onClick={() => void openForceDeleteFlow(item)}
                                className="px-2 py-1 bg-orange-50 text-orange-700 rounded hover:bg-orange-100 text-xs border border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-900/40 transition-colors"
                              >
                                {t("actions.forceDelete")}
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <DeleteConfirmModal
        isOpen={!!itemToHardDelete}
        onClose={() => setItemToHardDelete(null)}
        onConfirm={() => itemToHardDelete && hardDeleteMutation.mutate(itemToHardDelete)}
        isHardDelete={true}
        title={t("modal.hardDelete.title")}
        description={t("modal.hardDelete.description", {
          name: itemToHardDelete?.name ?? "",
          model: selectedModel?.verbose_name ?? "",
        })}
        confirmText={t("modal.hardDelete.confirm")}
        cancelText={t("modal.cancel")}
        isLoading={hardDeleteMutation.isPending}
      />

      <DeleteConfirmModal
        isOpen={isRestoreAllOpen}
        onClose={() => setIsRestoreAllOpen(false)}
        onConfirm={() => restoreAllMutation.mutate()}
        title={t("modal.restoreAll.title")}
        description={t("modal.restoreAll.description", { model: selectedModel?.verbose_name ?? "" })}
        confirmText={t("modal.restoreAll.confirm")}
        cancelText={t("modal.cancel")}
        isHardDelete={false}
        isLoading={restoreAllMutation.isPending}
      />

      <DeleteConfirmModal
        isOpen={isEmptyBinOpen}
        onClose={() => setIsEmptyBinOpen(false)}
        onConfirm={() => emptyBinMutation.mutate()}
        title={t("modal.emptyBin.title")}
        description={t("modal.emptyBin.description", { model: selectedModel?.verbose_name ?? "" })}
        confirmText={t("modal.emptyBin.confirm")}
        cancelText={t("modal.cancel")}
        isHardDelete={true}
        isLoading={emptyBinMutation.isPending}
      />

      <ForceDeleteConfirmModal
        isOpen={!!itemToForceDelete}
        onClose={() => {
          if (forceDeleteMutation.isPending) return
          setItemToForceDelete(null)
          setForceDeleteDependencies([])
        }}
        onConfirm={() => itemToForceDelete && forceDeleteMutation.mutate(itemToForceDelete)}
        itemName={itemToForceDelete?.name ?? ""}
        modelName={selectedModel?.verbose_name ?? ""}
        dependencies={forceDeleteDependencies}
        isLoading={forceDeleteMutation.isPending}
        isLoadingPreview={isForcePreviewLoading}
      />
    </AppShell>
  )
}

export default function RecycleBinPage() {
  return (
    <AuthGuard module="auth_only">
      <RecycleBinContent />
    </AuthGuard>
  )
}
