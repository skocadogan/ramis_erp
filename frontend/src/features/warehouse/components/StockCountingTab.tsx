"use client"

import { useState } from "react"
import { Plus, Search, Eye, Play, CheckCircle, ClipboardCheck, Trash2, Loader2 } from "lucide-react"
import { useStockCountingsInfinite, useWarehouses } from "@/features/warehouse/hooks/useWarehouse"
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table"
import {
  useCreateStockCounting,
  useStartStockCounting,
  useFinishStockCounting,
  useApproveStockCounting,
  useDeleteStockCounting,
} from "@/features/warehouse/hooks/useWarehouseActions"
import { StatusBadge } from "./StatusBadge"
import type { StockCounting } from "@/features/warehouse/types"
import { StockCountingFormModal } from "./StockCountingFormModal"
import StockCountingDetailModal from "./StockCountingDetailModal"
import { ConfirmActionDialog } from "./ConfirmActionDialog"
import { toast } from "sonner"
import { useAuthStore } from "@/store/useAuthStore"
import {
  canDeleteStockCountingRecord,
  PERMISSION_WAREHOUSE_APPROVE_STOCK_COUNTING,
} from "@/lib/constants"
import { useModulePermissions } from "@/hooks/useModulePermissions"
import { useTranslations } from "next-intl"

export function StockCountingTab({ branchId }: { branchId?: string }) {
  const t = useTranslations("warehouse")
  const { canManage } = useModulePermissions()
  const canApproveStockCounting = canManage(PERMISSION_WAREHOUSE_APPROVE_STOCK_COUNTING)
  const user = useAuthStore((s) => s.user)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const { data: branchWarehouses = [] } = useWarehouses(branchId)
  const allowedWarehouseIds = new Set(branchWarehouses.map((w) => w.id))
  const {
    rows: countings,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useStockCountingsInfinite({ status: statusFilter || undefined, branch_id: branchId })
  const [showForm, setShowForm] = useState(false)
  const [selectedItem, setSelectedItem] = useState<StockCounting | null>(null)
  const [confirmApprove, setConfirmApprove] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const createMut = useCreateStockCounting()
  const startMut = useStartStockCounting()
  const finishMut = useFinishStockCounting()
  const approveMut = useApproveStockCounting()
  const deleteMut = useDeleteStockCounting()

  const filtered = countings
    .filter((c) => !branchId || allowedWarehouseIds.has(c.warehouse))
    .filter((c) => c.counting_number.toLowerCase().includes(search.toLowerCase()))

  const handleAction = async (action: string, id: string) => {
    switch (action) {
      case "start": await startMut.mutateAsync(id); break
      case "finish": await finishMut.mutateAsync(id); break
      case "approve":
        setConfirmApprove(id)
        break
    }
  }

  const confirmApproveAction = async () => {
    if (confirmApprove) {
      await approveMut.mutateAsync(confirmApprove)
      setConfirmApprove(null)
    }
  }

  const confirmDeleteAction = () => {
    const id = confirmDelete
    if (!id) return
    void deleteMut
      .mutateAsync(id)
      .then(() => {
        toast.success(t("stockCounting.deleted"))
        setSelectedItem((prev) => (prev?.id === id ? null : prev))
        setConfirmDelete(null)
      })
      .catch(() => toast.error(t("stockCounting.deleteFailed")))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input type="text" placeholder={t("stockCounting.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-card text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm outline-none">
          <option value="">{t("stockCounting.filterAllStatus")}</option>
          <option value="DRAFT">{t("stockCounting.statusDraft")}</option>
          <option value="IN_PROGRESS">{t("stockCounting.statusInProgress")}</option>
          <option value="COMPLETED">{t("stockCounting.statusCompleted")}</option>
          <option value="APPROVED">{t("stockCounting.statusApproved")}</option>
        </select>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 transition-colors shadow-sm ml-auto">
          <Plus size={16} /><span>{t("stockCounting.newCounting")}</span>
        </button>
      </div>

      <VirtualTable
        rows={filtered}
        rowHeight={52}
        overscan={8}
        fetchMore={() => void fetchNextPage()}
        hasMore={!!hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        className="max-h-[calc(100vh-14rem)] rounded-xl border border-border/80 bg-card/50"
        tableClassName="w-full text-sm"
        header={
          <thead className={virtualTableStickyHeadClass}>
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("stockCounting.colNumber")}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("stockCounting.colWarehouse")}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("stockCounting.colStatus")}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("stockCounting.colDate")}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("stockCounting.colCountedBy")}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("stockCounting.colApprovedBy")}</th>
              <th className="text-center px-4 py-3 font-semibold text-muted-foreground">{t("stockCounting.colActions")}</th>
            </tr>
          </thead>
        }
        emptyState={
          isLoading ? (
            <div className="text-center py-12 text-muted-foreground">{t("stockCounting.loading")}</div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">{t("stockCounting.empty")}</div>
          )
        }
        loadingMore={
          <tr>
            <td colSpan={7} className="text-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600 mx-auto" />
            </td>
          </tr>
        }
        renderRow={(c) => (
          <>
            <td className="px-4 py-3 font-mono text-xs text-rose-600 dark:text-rose-400">{c.counting_number}</td>
            <td className="px-4 py-3 font-medium text-foreground">{c.warehouse_name ?? "—"}</td>
            <td className="px-4 py-3"><StatusBadge domain="counting" status={c.status} /></td>
            <td className="px-4 py-3 text-muted-foreground text-xs">{c.counting_date}</td>
            <td className="px-4 py-3 text-muted-foreground">{c.counted_by_name ?? "—"}</td>
            <td className="px-4 py-3 text-muted-foreground">{c.approved_by_name ?? "—"}</td>
            <td className="px-4 py-3">
              <div className="flex items-center justify-center gap-1">
                <button onClick={() => setSelectedItem(c)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title={t("stockCounting.tooltipDetail")}>
                  <Eye size={14} />
                </button>
                {c.status === "DRAFT" && (
                  <button onClick={() => void handleAction("start", c.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title={t("stockCounting.tooltipStart")}>
                    <Play size={14} />
                  </button>
                )}
                {c.status === "IN_PROGRESS" && (
                  <button onClick={() => void handleAction("finish", c.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors" title={t("stockCounting.tooltipFinish")}>
                    <ClipboardCheck size={14} />
                  </button>
                )}
                {c.status === "COMPLETED" && canApproveStockCounting && (
                  <button onClick={() => void handleAction("approve", c.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors" title={t("stockCounting.tooltipApproveAction")}>
                    <CheckCircle size={14} />
                  </button>
                )}
                {canDeleteStockCountingRecord(c.status, user?.permissions, user?.is_superuser) && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(c.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title={t("stockCounting.deleteRowTitle")}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </td>
          </>
        )}
      />

      <StockCountingFormModal
          open={showForm}
          onSave={async (data) => { await createMut.mutateAsync(data); setShowForm(false) }}
          onClose={() => setShowForm(false)}
          isLoading={createMut.isPending}
        />

      <StockCountingDetailModal
          open={!!selectedItem}
          counting={selectedItem}
          onClose={() => setSelectedItem(null)}
          onCountingUpdated={setSelectedItem}
        />

      <ConfirmActionDialog
        open={!!confirmApprove}
        onOpenChange={(open) => !open && setConfirmApprove(null)}
        onConfirm={confirmApproveAction}
        title={t("stockCounting.approveTitle")}
        description={t("stockCounting.approveDescription")}
        confirmText={t("confirm.confirm")}
      />

      <ConfirmActionDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        onConfirm={confirmDeleteAction}
        title={t("stockCounting.deleteDialogTitle")}
        description={t("stockCounting.deleteDialogDescription")}
        confirmText={t("confirm.delete")}
        variant="destructive"
      />
    </div>
  )
}
