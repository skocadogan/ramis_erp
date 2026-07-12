"use client"

import { useMemo, useState } from "react"
import { 
  Search, 
  Eye, 
  CheckCircle, 
  XCircle, 
  ShoppingCart, 
  ArrowRightLeft,
  AlertCircle,
  Trash2,
  
  Loader2,
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { warehouseApi } from "@/features/warehouse/services/warehouseApi"
import { useDeficiencyReportsInfinite, useWarehouses, useSuppliers } from "@/features/warehouse/hooks/useWarehouse"
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table"
import { 
  useApproveDeficiencyReport, 
  useCancelDeficiencyReport,
  useCreatePOFromDeficiency,
  useCreateTransferFromDeficiency,
  useExecuteDeficiencyItemActions,
  usePreviewDeficiencyItemActions,
  useDeleteDeficiencyReport,
} from "@/features/warehouse/hooks/useWarehouseActions"
import { StatusBadge } from "./StatusBadge"
import { ConfirmActionDialog } from "./ConfirmActionDialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import type { DeficiencyReport } from "@/features/warehouse/types"
import { canDeleteDeficiencyReport, getDeficiencyReportLineCount } from "@/features/warehouse/utils/deficiencyReportLineCount"
import {
  shouldShowDeficiencyDetailButton,
  shouldShowDeficiencyTableActionsExceptDetail,
} from "@/features/warehouse/utils/deficiencyReportRowActions"
import { DeficiencyReportDetailModal } from "./DeficiencyReportDetailModal"
import { DeficiencyActionConfirmModal } from "./DeficiencyActionConfirmModal"
import { useTranslations } from "next-intl"
import type {
  DeficiencyActionPlanSummary,
  DeficiencyItemAction,
} from "@/features/warehouse/utils/deficiencyItemActions"

export function DeficiencyReportsTab({ branchId }: { branchId?: string }) {
  const t = useTranslations("warehouse")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const {
    rows: reports,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useDeficiencyReportsInfinite({ 
    status: statusFilter || undefined,
    branch_id: branchId,
  })
  
  const [selectedReport, setSelectedReport] = useState<DeficiencyReport | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  
  // Transformation Modals
  const [poModal, setPoModal] = useState<{ id: string } | null>(null)
  const [trModal, setTrModal] = useState<{ id: string } | null>(null)
  
  const approveMut = useApproveDeficiencyReport()
  const cancelMut = useCancelDeficiencyReport()
  const createPoMut = useCreatePOFromDeficiency()
  const createTrMut = useCreateTransferFromDeficiency()
  const previewActionsMut = usePreviewDeficiencyItemActions()
  const executeActionsMut = useExecuteDeficiencyItemActions()
  const deleteMut = useDeleteDeficiencyReport()

  const [actionSummary, setActionSummary] = useState<DeficiencyActionPlanSummary | null>(null)
  const [itemActionsQueuedIds, setItemActionsQueuedIds] = useState<Set<string>>(() => new Set())
  const [pendingItemActions, setPendingItemActions] = useState<Record<string, DeficiencyItemAction>>({})
  const [actionSupplierId, setActionSupplierId] = useState("")
  const [actionWarehouseId, setActionWarehouseId] = useState("")

  const { data: warehouses = [] } = useWarehouses()
  const { data: suppliers = [] } = useSuppliers()

  const { data: availabilityData = [], isLoading: isAvailabilityLoading } = useQuery({
    queryKey: ["deficiency-availability", selectedReport?.id],
    queryFn: async () => {
      if (!selectedReport) return []
      const res = await warehouseApi.getDeficiencyStockAvailability(selectedReport.id)
      return res.data
    },
    enabled: !!selectedReport && (selectedReport.status === "PENDING" || selectedReport.status === "APPROVED"),
    refetchOnMount: "always",
  })

  const filtered = reports.filter(
    (r) =>
      r.report_number.toLowerCase().includes(search.toLowerCase()) ||
      (r.kitchen_station_name ?? "").toLowerCase().includes(search.toLowerCase())
  )

  const pendingItemActionReportIds = useMemo(() => {
    const ids = new Set(itemActionsQueuedIds)
    if (actionSummary && selectedReport) ids.add(selectedReport.id)
    return ids
  }, [itemActionsQueuedIds, actionSummary, selectedReport])

  const rowActionOpts = useMemo(
    () => ({ pendingItemActionReportIds }),
    [pendingItemActionReportIds],
  )

  const handleApprove = async (id: string) => {
    try {
      await approveMut.mutateAsync(id)
      toast.success(t("deficiencyReports.approved"))
    } catch {
      toast.error(t("deficiencyReports.approveError"))
    }
  }

  const handleCancel = async () => {
    if (confirmCancel) {
      try {
        await cancelMut.mutateAsync(confirmCancel)
        toast.success(t("deficiencyReports.cancelled"))
        setConfirmCancel(null)
      } catch {
        toast.error(t("deficiencyReports.cancelError"))
      }
    }
  }

  const handleDelete = async () => {
    const id = confirmDelete
    if (!id) return
    try {
      await deleteMut.mutateAsync(id)
      toast.success(t("deficiencyReports.deleted"))
      setConfirmDelete(null)
      if (selectedReport?.id === id) setSelectedReport(null)
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } }
      toast.error(ax.response?.data?.error ?? t("deficiencyReports.deleteFailed"))
    }
  }

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault()
    const formEl = e.currentTarget as HTMLFormElement
    const supplier_id = (formEl.elements.namedItem("supplier_id") as HTMLSelectElement).value
    const warehouse_id = (formEl.elements.namedItem("warehouse_id") as HTMLSelectElement).value
    
    if (!supplier_id || !warehouse_id) return toast.error(t("deficiencyReports.fillAllFields"))
    
    try {
      await createPoMut.mutateAsync({ id: poModal!.id, supplier_id, warehouse_id })
      toast.success(t("deficiencyReports.poCreated"))
      setPoModal(null)
    } catch {
      toast.error(t("deficiencyReports.actionFailed"))
    }
  }

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    const formEl = e.currentTarget as HTMLFormElement
    const source_warehouse_id = (formEl.elements.namedItem("source_warehouse_id") as HTMLSelectElement).value
    
    if (!source_warehouse_id) return toast.error(t("deficiencyReports.selectSource"))
    
    try {
      await createTrMut.mutateAsync({ id: trModal!.id, source_warehouse_id })
      toast.success(t("deficiencyReports.transferRequested"))
      setTrModal(null)
    } catch {
      toast.error(t("deficiencyReports.actionFailed"))
    }
  }

  const handleStartItemActions = async (itemActions: Record<string, DeficiencyItemAction>) => {
    if (!selectedReport) return
    const items = Object.entries(itemActions).map(([item_id, action]) => ({ item_id, action }))
    try {
      const res = await previewActionsMut.mutateAsync({ id: selectedReport.id, items })
      setPendingItemActions(itemActions)
      setActionSummary(res.data as DeficiencyActionPlanSummary)
      setActionSupplierId("")
      setActionWarehouseId(selectedReport.target_warehouse ?? "")
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } }
      toast.error(ax.response?.data?.error ?? t("deficiencyReports.actionPreviewError"))
    }
  }

  const handleConfirmItemActions = async () => {
    if (!selectedReport || !actionSummary) return
    const items = Object.entries(pendingItemActions).map(([item_id, action]) => ({ item_id, action }))
    try {
      const reportId = selectedReport.id
      await executeActionsMut.mutateAsync({
        id: reportId,
        items,
        supplier_id: actionSummary.requires_purchase_config ? actionSupplierId : undefined,
        warehouse_id: actionSummary.requires_purchase_config ? actionWarehouseId : undefined,
      })
      setItemActionsQueuedIds((prev) => new Set(prev).add(reportId))
      toast.success(t("deficiencyReports.actionQueuedSuccess"))
      setActionSummary(null)
      setSelectedReport(null)
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } }
      toast.error(ax.response?.data?.error ?? t("deficiencyReports.actionExecuteError"))
    }
  }

  const actionLabel = (action: string) => {
    switch (action as DeficiencyItemAction) {
      case "PURCHASE_ALL":
        return t("deficiencyReports.actionPurchaseAll")
      case "PURCHASE_PARTIAL":
        return t("deficiencyReports.actionPurchasePartial")
      case "FULFILL_STOCK":
        return t("deficiencyReports.actionFulfillStock")
      case "REJECT":
        return t("deficiencyReports.actionReject")
      default:
        return action
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      {/* Filters */}
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            type="text"
            placeholder={t("deficiencyReports.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-card text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none shadow-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 rounded-xl border border-border bg-card text-sm outline-none focus:ring-2 focus:ring-amber-500/20 shadow-sm"
        >
          <option value="">{t("deficiencyReports.filterAll")}</option>
          <option value="PENDING">{t("deficiencyReports.filterPending")}</option>
          <option value="APPROVED">{t("deficiencyReports.filterApproved")}</option>
          <option value="PARTIALLY_COMMITTED">{t("deficiencyReports.filterPartialCommitted")}</option>
          <option value="COMMITTED">{t("deficiencyReports.filterCommitted")}</option>
          <option value="CANCELLED">{t("deficiencyReports.filterCancelled")}</option>
        </select>
      </div>

      {/* Table */}
      <VirtualTable
        rows={filtered}
        rowHeight={56}
        overscan={8}
        fetchMore={() => void fetchNextPage()}
        hasMore={!!hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        className="min-h-0 flex-1 rounded-2xl border border-border/80 dark:border-slate-800 bg-card/50 shadow-sm"
        tableClassName="w-full text-sm"
        header={
          <thead className={virtualTableStickyHeadClass}>
            <tr>
              <th className="text-left px-6 py-4 font-ui-bold text-muted-foreground uppercase tracking-wider text-2xs">{t("deficiencyReports.colReportNo")}</th>
              <th className="text-left px-6 py-4 font-ui-bold text-muted-foreground uppercase tracking-wider text-2xs">{t("deficiencyReports.colStation")}</th>
              <th className="text-left px-6 py-4 font-ui-bold text-muted-foreground uppercase tracking-wider text-2xs">{t("deficiencyReports.colStatus")}</th>
              <th className="text-left px-6 py-4 font-ui-bold text-muted-foreground uppercase tracking-wider text-2xs">{t("deficiencyReports.colDate")}</th>
              <th className="text-center px-6 py-4 font-ui-bold text-muted-foreground uppercase tracking-wider text-2xs">{t("deficiencyReports.colLines")}</th>
              <th className="text-right px-6 py-4 font-ui-bold text-muted-foreground uppercase tracking-wider text-2xs">{t("deficiencyReports.colActions")}</th>
            </tr>
          </thead>
        }
        emptyState={
          isLoading ? (
            <div className="text-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500 mx-auto mb-2" />
              <span className="text-muted-foreground font-ui-medium">{t("deficiencyReports.loading")}</span>
            </div>
          ) : (
            <div className="text-center py-20">
              <AlertCircle size={40} className="text-slate-200 mx-auto mb-2" />
              <span className="text-muted-foreground font-ui-medium">{t("deficiencyReports.empty")}</span>
            </div>
          )
        }
        loadingMore={
          <tr>
            <td colSpan={6} className="text-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-amber-500 mx-auto" />
            </td>
          </tr>
        }
        renderRow={(r) => {
          const showDetail = shouldShowDeficiencyDetailButton(r, rowActionOpts)
          const showOtherActions = shouldShowDeficiencyTableActionsExceptDetail(r, rowActionOpts)
          return (
            <>
              <td className="px-6 py-4 font-mono text-xs font-ui-bold text-amber-600 dark:text-amber-400">{r.report_number}</td>
              <td className="px-6 py-4">
                <div className="flex flex-col">
                  <span className="text-foreground">{r.kitchen_station_name}</span>
                  <span className="text-2xs text-muted-foreground font-ui-medium">{r.branch_name}</span>
                </div>
              </td>
              <td className="px-6 py-4"><StatusBadge domain="deficiency" status={r.status} /></td>
              <td className="px-6 py-4 text-muted-foreground text-xs font-ui-medium">
                {new Date(r.created_at).toLocaleDateString("tr-TR")}
              </td>
              <td className="px-6 py-4 text-center">
                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-muted text-2xs font-ui-bold text-slate-600 dark:text-slate-300">
                  {getDeficiencyReportLineCount(r)}
                </span>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center justify-end gap-1.5">
                  {showDetail && (
                    <button
                      onClick={() => setSelectedReport(r)}
                      className="p-2 rounded-xl text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      title={t("deficiencyReports.tooltipDetail")}
                    >
                      <Eye size={16} />
                    </button>
                  )}
                  {showOtherActions && r.status === "PENDING" && (
                    <>
                      <button
                        onClick={() => void handleApprove(r.id)}
                        className="p-2 rounded-xl text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                        title={t("deficiencyReports.tooltipApprove")}
                      >
                        <CheckCircle size={16} />
                      </button>
                      <button
                        onClick={() => setConfirmCancel(r.id)}
                        className="p-2 rounded-xl text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                        title={t("deficiencyReports.tooltipCancel")}
                      >
                        <XCircle size={16} />
                      </button>
                    </>
                  )}
                  {showOtherActions && (r.status === "APPROVED" || r.status === "PARTIALLY_COMMITTED") && (
                    <>
                      <button
                        onClick={() => setPoModal({ id: r.id })}
                        className="p-2 rounded-xl text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                        title={t("deficiencyReports.tooltipCreatePo")}
                      >
                        <ShoppingCart size={16} />
                      </button>
                      <button
                        onClick={() => setTrModal({ id: r.id })}
                        className="p-2 rounded-xl text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                        title={t("deficiencyReports.tooltipCreateTransfer")}
                      >
                        <ArrowRightLeft size={16} />
                      </button>
                    </>
                  )}
                  {showOtherActions && canDeleteDeficiencyReport(r) && (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(r.id)}
                      className="p-2 rounded-xl text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                      title={t("deficiencyReports.tooltipDelete")}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </td>
            </>
          )
        }}
      />

      {/* Details View */}
      <DeficiencyReportDetailModal
          open={!!selectedReport}
          report={selectedReport}
          availabilityData={availabilityData}
          isAvailabilityLoading={isAvailabilityLoading}
          deleteIsPending={deleteMut.isPending}
          executeIsPending={previewActionsMut.isPending || executeActionsMut.isPending}
          onClose={() => setSelectedReport(null)}
          onDelete={() => selectedReport && setConfirmDelete(selectedReport.id)}
          onStartActions={handleStartItemActions}
        />

      <DeficiencyActionConfirmModal
        open={!!actionSummary}
        summary={actionSummary}
        supplierId={actionSupplierId}
        setSupplierId={setActionSupplierId}
        warehouseId={actionWarehouseId}
        setWarehouseId={setActionWarehouseId}
        suppliers={suppliers}
        warehouses={warehouses}
        isPending={executeActionsMut.isPending}
        onClose={() => setActionSummary(null)}
        onConfirm={handleConfirmItemActions}
        actionLabel={actionLabel}
      />

      {/* PO Modal */}
      <Dialog open={!!poModal} onOpenChange={(open) => !open && setPoModal(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{t("deficiencyReports.poModalTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreatePO}>
            <DialogBody className="space-y-4">
              <div>
                <label className="block text-2xs font-ui-bold text-muted-foreground uppercase tracking-widest mb-1.5">{t("deficiencyReports.labelSupplier")}</label>
                <select name="supplier_id" required className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-amber-500/20">
                   <option value="">{t("purchaseOrders.selectPlaceholder")}</option>
                   {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-2xs font-ui-bold text-muted-foreground uppercase tracking-widest mb-1.5">{t("deficiencyReports.labelTargetWarehouse")}</label>
                <select name="warehouse_id" required className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-amber-500/20">
                   <option value="">{t("purchaseOrders.selectPlaceholder")}</option>
                   {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPoModal(null)}>
                {t("warehouseForm.cancel")}
              </Button>
              <Button type="submit" disabled={createPoMut.isPending}>
                {createPoMut.isPending ? t("deficiencyReports.creating") : t("deficiencyReports.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Transfer Modal */}
      <Dialog open={!!trModal} onOpenChange={(open) => !open && setTrModal(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{t("deficiencyReports.trModalTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateTransfer}>
            <DialogBody className="space-y-4">
              <div>
                <label className="block text-2xs font-ui-bold text-muted-foreground uppercase tracking-widest mb-1.5">{t("deficiencyReports.labelSourceWarehouse")}</label>
                <select name="source_warehouse_id" required className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-indigo-500/20">
                   <option value="">{t("purchaseOrders.selectPlaceholder")}</option>
                   {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/10 p-3 rounded-xl border border-blue-100 dark:border-blue-900/20 text-2xs text-blue-600 font-ui-medium">
                 {t("deficiencyReports.transferAutoTargetHint")}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTrModal(null)}>
                {t("warehouseForm.cancel")}
              </Button>
              <Button type="submit" disabled={createTrMut.isPending}>
                {createTrMut.isPending ? t("deficiencyReports.creating") : t("deficiencyReports.transferStart")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={!!confirmCancel}
        onOpenChange={(open) => !open && setConfirmCancel(null)}
        onConfirm={handleCancel}
        title={t("deficiencyReports.cancelReportTitle")}
        description={t("deficiencyReports.cancelReportDesc")}
        confirmText={t("deficiencyReports.cancelReportConfirm")}
        variant="destructive"
      />

      <ConfirmActionDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        onConfirm={handleDelete}
        title={t("deficiencyReports.deleteReportTitle")}
        description={t("deficiencyReports.deleteReportDesc")}
        confirmText={t("deficiencyReports.deleteReportConfirm")}
        variant="destructive"
      />
    </div>
  )
}
