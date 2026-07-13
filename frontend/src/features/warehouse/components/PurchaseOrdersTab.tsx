"use client"

import { lazy, Suspense, useState, useEffect } from "react"
import { Plus, Search, Eye, FileText, Send, CheckCircle, ShoppingCart, XCircle, Sparkles, AlertTriangle, ChevronRight, RefreshCw, Trash2, Pencil, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { isAxiosError } from "axios"
import { AsyncPdfExportButton } from "@/components/AsyncPdfExportButton"
import { usePurchaseOrdersInfinite, useWarehouses, useProcurementAlerts } from "@/features/warehouse/hooks/useWarehouse"
import {
  useCreatePurchaseOrder,
  useUpdatePurchaseOrder,
  usePreviewSuggestPurchaseOrders,
  useSuggestPurchaseOrders,
  useSubmitPurchaseOrder,
  useApprovePurchaseOrder,
  useMarkOrderedPurchaseOrder,
  useCancelPurchaseOrder,
  useRecalculatePurchaseOrderStatus,
  useDeletePurchaseOrder,
} from "@/features/warehouse/hooks/useWarehouseActions"
import { StatusBadge } from "./StatusBadge"
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
import type { PurchaseOrder } from "@/features/warehouse/types"
import { ConfirmActionDialog } from "./ConfirmActionDialog"
import { formatQuantityWithUnit, formatAmount } from "@/lib/formatters"
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts"
import { useModulePermissions } from "@/hooks/useModulePermissions"
import {
  PERMISSION_WAREHOUSE_APPROVE_PURCHASE_ORDER,
  PERMISSION_WAREHOUSE_PLACE_PURCHASE_ORDER,
  PERMISSION_WAREHOUSE_EDIT_PURCHASE_ORDER_POST_APPROVAL,
} from "@/lib/constants"
import { useTranslations } from "next-intl"
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table"

const PurchaseOrderFormModal = lazy(() =>
  import("./PurchaseOrderFormModal").then((m) => ({
    default: m.PurchaseOrderFormModal,
  }))
)

type SkippedItem = { id: string; name: string; quantity: string; minimum_quantity: string; unit: string }
type SuggestResult = { created_count: number; skipped_items: SkippedItem[] }
type SuggestStep = "form" | "resolve" | "result"
type SuggestSuggestion = {
  stock_item_id: string
  stock_item_name: string
  needed: string
  unit: string
  suppliers: { id: string; name: string }[]
  has_conflict: boolean
}
type SuggestPreview = {
  suggestions: SuggestSuggestion[]
  skipped_items: SkippedItem[]
  has_conflicts: boolean
}

export function PurchaseOrdersTab({
  branchId,
  initialOverdueFilter = false,
  onClearOverdueFilter,
}: {
  branchId?: string
  initialOverdueFilter?: boolean
  onClearOverdueFilter?: () => void
}) {
  const t = useTranslations("warehouse")
  const { canManage, isSuperuser } = useModulePermissions()
  const canApprovePurchaseOrder = canManage(PERMISSION_WAREHOUSE_APPROVE_PURCHASE_ORDER)
  const canPlacePurchaseOrder =
    isSuperuser || canManage(PERMISSION_WAREHOUSE_PLACE_PURCHASE_ORDER)
  const canManagePurchaseOrder = canManage("warehouse.manage_purchase_order")
  const canEditPostApprovalPurchaseOrder =
    isSuperuser || canManage(PERMISSION_WAREHOUSE_EDIT_PURCHASE_ORDER_POST_APPROVAL)

  const canShowPurchaseOrderEdit = (o: PurchaseOrder) => {
    if (o.status === "DRAFT") return canManagePurchaseOrder
    if (["PENDING", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED"].includes(o.status)) {
      return canEditPostApprovalPurchaseOrder
    }
    return false
  }
  const canViewAmounts = useCanViewAmounts()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [overdueFilter, setOverdueFilter] = useState(initialOverdueFilter)

  useEffect(() => {
    setOverdueFilter(initialOverdueFilter)
  }, [initialOverdueFilter])
  const { data: branchWarehouses = [] } = useWarehouses(branchId)
  const allowedWarehouseIds = new Set(branchWarehouses.map((w) => w.id))
  const { data: procurementAlerts } = useProcurementAlerts({ branch_id: branchId })
  const {
    rows: orders,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePurchaseOrdersInfinite({
    status: overdueFilter ? undefined : statusFilter || undefined,
    overdue: overdueFilter || undefined,
    branch_id: branchId,
  })
  const [showForm, setShowForm] = useState(false)
  /** Düzenleme modunda dolu; yeni siparişte null. */
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestStep, setSuggestStep] = useState<SuggestStep>("form")
  const [suggestWarehouseId, setSuggestWarehouseId] = useState<string>("")
  const [suggestPreview, setSuggestPreview] = useState<SuggestPreview | null>(null)
  const [preferredSuppliers, setPreferredSuppliers] = useState<Record<string, string>>({})
  const [suggestResult, setSuggestResult] = useState<SuggestResult | null>(null)

  const createMut = useCreatePurchaseOrder()
  const updateMut = useUpdatePurchaseOrder()
  const previewMut = usePreviewSuggestPurchaseOrders()
  const suggestMut = useSuggestPurchaseOrders()
  const submitMut = useSubmitPurchaseOrder()
  const approveMut = useApprovePurchaseOrder()
  const markOrderedMut = useMarkOrderedPurchaseOrder()
  const cancelMut = useCancelPurchaseOrder()
  const recalcMut = useRecalculatePurchaseOrderStatus()
  const deleteMut = useDeletePurchaseOrder()

  const filtered = orders
    .filter((o) => !branchId || allowedWarehouseIds.has(o.warehouse))
    .filter(
    (o) =>
      o.order_number.toLowerCase().includes(search.toLowerCase()) ||
      (o.supplier_name ?? "").toLowerCase().includes(search.toLowerCase())
    )

  const handleAction = async (action: string, id: string) => {
    switch (action) {
      case "submit": await submitMut.mutateAsync(id); break
      case "approve": await approveMut.mutateAsync(id); break
      case "mark_ordered": await markOrderedMut.mutateAsync(id); break
      case "cancel":
        setConfirmCancel(id)
        break
      case "delete":
        setConfirmDelete(id)
        break
    }
  }

  const confirmCancelAction = async () => {
    if (confirmCancel) {
      await cancelMut.mutateAsync(confirmCancel)
      setConfirmCancel(null)
    }
  }
 
  const confirmDeleteAction = async () => {
    if (confirmDelete) {
      try {
        await deleteMut.mutateAsync(confirmDelete)
        toast.success(t("purchaseOrdersTab.deletedSuccess"))
        setConfirmDelete(null)
      } catch (err: unknown) {
        const message = isAxiosError(err) ? String(err.response?.data?.error ?? "") : "";
        toast.error(message || t("purchaseOrdersTab.deleteFailed"))
      }
    }
  }

  const closeSuggestModal = () => {
    setSuggestOpen(false)
    setSuggestStep("form")
    setSuggestWarehouseId("")
    setSuggestPreview(null)
    setPreferredSuppliers({})
    setSuggestResult(null)
  }

  return (
    <div className="space-y-4">
      {(procurementAlerts?.overdue_orders_count ?? 0) > 0 ? (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <span>
              {t("purchaseOrdersTab.overdueBanner", {
                count: procurementAlerts?.overdue_orders_count ?? 0,
              })}
            </span>
          </div>
          {!overdueFilter ? (
            <button
              type="button"
              onClick={() => setOverdueFilter(true)}
              className="shrink-0 font-medium underline underline-offset-2"
            >
              {t("purchaseOrdersTab.showOverdueOnly")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setOverdueFilter(false)
                onClearOverdueFilter?.()
              }}
              className="shrink-0 font-medium underline underline-offset-2"
            >
              {t("purchaseOrdersTab.clearOverdueFilter")}
            </button>
          )}
        </div>
      ) : null}
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            type="text"
            placeholder={t("purchaseOrdersTab.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-card text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm outline-none"
        >
          <option value="">{t("purchaseOrdersTab.filterAll")}</option>
          <option value="DRAFT">{t("purchaseOrdersTab.filterDraft")}</option>
          <option value="PENDING">{t("purchaseOrdersTab.filterPending")}</option>
          <option value="APPROVED">{t("purchaseOrdersTab.filterApproved")}</option>
          <option value="ORDERED">{t("purchaseOrdersTab.filterOrdered")}</option>
          <option value="PARTIALLY_RECEIVED">{t("purchaseOrdersTab.filterPartial")}</option>
          <option value="RECEIVED">{t("purchaseOrdersTab.filterReceived")}</option>
          <option value="CANCELLED">{t("purchaseOrdersTab.filterCancelled")}</option>
        </select>
        <button
          onClick={() => {
            setEditingOrder(null)
            setShowForm(true)
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm ml-auto"
        >
          <Plus size={16} />
          <span>{t("purchaseOrdersTab.newOrder")}</span>
        </button>
        <button
          onClick={() => setSuggestOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors shadow-sm"
        >
          <Sparkles size={16} />
          <span>{t("purchaseOrdersTab.smartSuggest")}</span>
        </button>
      </div>

      {/* Table */}
      <VirtualTable
        rows={filtered}
        rowHeight={52}
        overscan={8}
        fetchMore={() => void fetchNextPage()}
        hasMore={!!hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        className="max-h-[calc(100vh-14rem)] rounded-xl border border-border/80 dark:border-slate-800 bg-card/50"
        tableClassName="w-full text-sm"
        header={
          <thead className={virtualTableStickyHeadClass}>
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("purchaseOrdersTab.colOrderNo")}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("purchaseOrdersTab.colSupplier")}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("purchaseOrdersTab.colWarehouse")}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("purchaseOrdersTab.colStatus")}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("purchaseOrdersTab.colDate")}</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">{t("purchaseOrdersTab.colAmount")}</th>
              <th className="text-center px-4 py-3 font-semibold text-muted-foreground">{t("purchaseOrdersTab.colActions")}</th>
            </tr>
          </thead>
        }
        emptyState={
          isLoading ? (
            <div className="text-center py-12 text-muted-foreground">{t("purchaseOrdersTab.loading")}</div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">{t("purchaseOrdersTab.empty")}</div>
          )
        }
        loadingMore={
          <tr>
            <td colSpan={7} className="text-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600 mx-auto" />
            </td>
          </tr>
        }
        renderRow={(o) => (
          <>
            <td className="px-4 py-3 font-mono text-xs text-blue-600 dark:text-blue-400">{o.order_number}</td>
            <td className="px-4 py-3 font-medium text-foreground">{o.supplier_name ?? "—"}</td>
            <td className="px-4 py-3 text-muted-foreground">{o.warehouse_name ?? "—"}</td>
            <td className="px-4 py-3"><StatusBadge domain="po" status={o.status} /></td>
            <td className="px-4 py-3 text-muted-foreground text-xs">{o.order_date}</td>
            <td className="px-4 py-3 text-right font-semibold text-foreground">
              {formatAmount(o.total_amount, canViewAmounts)}
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center justify-center gap-1">
                <button
                  onClick={() => setSelectedOrder(o)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  title={t("purchaseOrdersTab.tooltipDetail")}
                >
                  <Eye size={14} />
                </button>
                {canShowPurchaseOrderEdit(o) && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingOrder(o)
                      setShowForm(true)
                    }}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                    title={t("purchaseOrdersTab.tooltipEdit")}
                  >
                    <Pencil size={14} />
                  </button>
                )}
                {o.status === "DRAFT" && (
                  <button
                    onClick={() => void handleAction("submit", o.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                    title={t("purchaseOrdersTab.tooltipSubmitApprove")}
                  >
                    <Send size={14} />
                  </button>
                )}
                {o.status === "PENDING" && canApprovePurchaseOrder && (
                  <button
                    onClick={() => void handleAction("approve", o.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                    title={t("purchaseOrdersTab.tooltipApprove")}
                  >
                    <CheckCircle size={14} />
                  </button>
                )}
                {o.status === "APPROVED" && canPlacePurchaseOrder && (
                  <button
                    onClick={() => void handleAction("mark_ordered", o.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    title={t("purchaseOrdersTab.tooltipMarkOrdered")}
                  >
                    <ShoppingCart size={14} />
                  </button>
                )}
                {!["RECEIVED", "CANCELLED"].includes(o.status) && (
                  <button
                    onClick={() => void handleAction("cancel", o.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title={t("purchaseOrdersTab.tooltipCancel")}
                  >
                    <XCircle size={14} />
                  </button>
                )}
                {["DRAFT", "CANCELLED"].includes(o.status) && (
                  <button
                    onClick={() => void handleAction("delete", o.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title={t("purchaseOrdersTab.tooltipDelete")}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </td>
          </>
        )}
      />

      <Suspense fallback={null}>
        <PurchaseOrderFormModal
          open={showForm}
          key={editingOrder?.id ?? "new-po"}
            branchId={branchId}
            initialOrder={editingOrder}
            onSave={async (data) => {
              try {
                if (editingOrder) {
                  await updateMut.mutateAsync({ id: editingOrder.id, data })
                  toast.success(t("purchaseOrdersTab.toastUpdated"))
                } else {
                  await createMut.mutateAsync(data)
                  toast.success(t("purchaseOrdersTab.toastCreated"))
                }
                setShowForm(false)
                setEditingOrder(null)
              } catch (err: unknown) {
                const ax = err as { response?: { data?: { error?: string } } }
                toast.error(ax.response?.data?.error ?? t("purchaseOrdersTab.toastActionFailed"))
              }
            }}
            onClose={() => {
              setShowForm(false)
              setEditingOrder(null)
            }}
          isLoading={editingOrder ? updateMut.isPending : createMut.isPending}
        />
      </Suspense>

      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent layout="scroll" size="2xl" className="max-h-[85vh]">
          {selectedOrder ? (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle>{selectedOrder.order_number}</DialogTitle>
                    <DialogDescription>
                      {selectedOrder.supplier_name} • {selectedOrder.warehouse_name}
                    </DialogDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge domain="po" status={selectedOrder.status} />
                    {canShowPurchaseOrderEdit(selectedOrder) && (
                      <button
                        type="button"
                        title={t("purchaseOrdersTab.tooltipEdit")}
                        onClick={() => {
                          const o = selectedOrder
                          setSelectedOrder(null)
                          setEditingOrder(o)
                          setShowForm(true)
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                      >
                        <Pencil size={12} />
                        {t("purchaseOrdersTab.editButton")}
                      </button>
                    )}
                    <AsyncPdfExportButton
                      reportSlug="purchase-order-pdf"
                      params={{ purchase_order_id: selectedOrder.id }}
                      filename={`${selectedOrder.order_number.replace(/[/\\]/g, "-")}.pdf`}
                      size="sm"
                      className="h-7 px-2 py-1 text-xs"
                    />
                    {selectedOrder.status === "PARTIALLY_RECEIVED" && (
                      <button
                        type="button"
                        title={t("purchaseOrdersTab.recalcTooltip")}
                        disabled={recalcMut.isPending}
                        onClick={async () => {
                          try {
                            const { data } = await recalcMut.mutateAsync(selectedOrder.id)
                            setSelectedOrder(data)
                            toast.success(t("purchaseOrdersTab.recalcToastOk"))
                          } catch {
                            toast.error(t("purchaseOrdersTab.recalcToastFail"))
                          }
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw size={12} className={recalcMut.isPending ? "animate-spin" : ""} />
                        {t("purchaseOrdersTab.recalcButton")}
                      </button>
                    )}
                  </div>
                </div>
              </DialogHeader>
              <DialogBody className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">{t("purchaseOrdersTab.labelOrderDate")}</span> <span className="ml-2 font-medium">{selectedOrder.order_date}</span></div>
                  <div><span className="text-muted-foreground">{t("purchaseOrdersTab.labelExpected")}</span> <span className="ml-2 font-medium">{selectedOrder.expected_date ?? "—"}</span></div>
                  <div><span className="text-muted-foreground">{t("purchaseOrdersTab.labelCreator")}</span> <span className="ml-2 font-medium">{selectedOrder.created_by_name ?? "—"}</span></div>
                  <div><span className="text-muted-foreground">{t("purchaseOrdersTab.labelApprover")}</span> <span className="ml-2 font-medium">{selectedOrder.approved_by_name ?? "—"}</span></div>
                </div>
                {selectedOrder.notes && (
                  <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                    <FileText size={14} className="inline mr-2" />
                    {selectedOrder.notes}
                  </div>
                )}
                <table className="w-full text-sm mt-4">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-muted-foreground font-medium">{t("purchaseOrdersTab.lineColProduct")}</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">{t("purchaseOrdersTab.lineColQty")}</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">{t("purchaseOrdersTab.lineColUnitPrice")}</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">{t("purchaseOrdersTab.lineColTotal")}</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">{t("purchaseOrdersTab.lineColReceived")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedOrder.items?.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2 text-foreground">{item.stock_item_name}</td>
                        <td className="py-2 text-right">{formatQuantityWithUnit(item.quantity, item.unit)}</td>
                        <td className="py-2 text-right">
                          {formatAmount(item.unit_price, canViewAmounts)}
                        </td>
                        <td className="py-2 text-right font-medium">
                          {formatAmount(item.line_total, canViewAmounts)}
                        </td>
                        <td className="py-2 text-right">{formatQuantityWithUnit(item.received_quantity, item.unit)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border">
                      <td colSpan={3} className="py-2 text-right font-semibold">{t("purchaseOrdersTab.footerTotal")}</td>
                      <td className="py-2 text-right font-bold text-lg text-blue-600">
                        {formatAmount(selectedOrder.total_amount, canViewAmounts)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </DialogBody>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={!!confirmCancel}
        onOpenChange={(open) => !open && setConfirmCancel(null)}
        onConfirm={confirmCancelAction}
        title={t("purchaseOrdersTab.cancelConfirmTitle")}
        description={t("purchaseOrdersTab.cancelConfirmDesc")}
        confirmText={t("purchaseOrdersTab.cancelConfirmButton")}
        variant="destructive"
      />
 
      <ConfirmActionDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        onConfirm={confirmDeleteAction}
        title={t("purchaseOrdersTab.deleteConfirmTitle")}
        description={t("purchaseOrdersTab.deleteConfirmDesc")}
        confirmText={t("purchaseOrdersTab.deleteConfirmButton")}
        variant="destructive"
      />

      {/* ── Otomatik PO Önerisi Modal ── */}
      <Dialog open={suggestOpen} onOpenChange={(open) => !open && closeSuggestModal()}>
        <DialogContent layout="scroll" size={suggestStep === "resolve" ? "2xl" : "lg"} className="max-h-[85vh]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {suggestStep === "resolve" && (
                <button
                  type="button"
                  onClick={() => { setSuggestStep("form"); setSuggestPreview(null); setPreferredSuppliers({}) }}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight size={16} className="rotate-180" />
                </button>
              )}
              <div>
                <DialogTitle>{t("purchaseOrdersTab.suggestTitle")}</DialogTitle>
                <DialogDescription>
                  {suggestStep === "form" && t("purchaseOrdersTab.suggestSubtitleForm")}
                  {suggestStep === "resolve" && t("purchaseOrdersTab.suggestSubtitleResolve")}
                  {suggestStep === "result" && t("purchaseOrdersTab.suggestSubtitleResult")}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {suggestStep === "form" && (
            <>
              <DialogBody className="space-y-3">
                <select
                  value={suggestWarehouseId}
                  onChange={(e) => setSuggestWarehouseId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
                >
                  <option value="">{t("purchaseOrdersTab.suggestSelectWarehouse")}</option>
                  {branchWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                  ))}
                </select>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeSuggestModal}>{t("warehouseForm.cancel")}</Button>
                <Button
                  type="button"
                  disabled={!suggestWarehouseId || previewMut.isPending}
                  onClick={async () => {
                    try {
                      const res = await previewMut.mutateAsync({ warehouse_id: suggestWarehouseId })
                      const preview: SuggestPreview = res?.data
                      setSuggestPreview(preview)
                      if (!preview.suggestions.length && !preview.skipped_items.length) {
                        setSuggestResult({ created_count: 0, skipped_items: [] })
                        setSuggestStep("result")
                      } else if (preview.has_conflicts) {
                        setSuggestStep("resolve")
                      } else {
                        const createRes = await suggestMut.mutateAsync({ warehouse_id: suggestWarehouseId })
                        const created: number = createRes?.data?.created_count ?? 0
                        const skippedItems: SkippedItem[] = createRes?.data?.skipped_items ?? []
                        setSuggestResult({ created_count: created, skipped_items: skippedItems })
                        setSuggestStep("result")
                      }
                    } catch { /* hata useMutation tarafından yönetilir */ }
                  }}
                >
                  {previewMut.isPending
                    ? t("purchaseOrdersTab.suggestAnalyzing")
                    : suggestMut.isPending
                      ? t("purchaseOrdersTab.suggestMutating")
                      : t("purchaseOrdersTab.suggestReview")}
                </Button>
              </DialogFooter>
            </>
          )}

          {suggestStep === "resolve" && suggestPreview && (
            <>
              <DialogBody className="space-y-4">
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <span>{t("purchaseOrdersTab.suggestConflictBanner")}</span>
                </div>

                <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                  {suggestPreview.suggestions.map((sug) => {
                    const selected = preferredSuppliers[sug.stock_item_id] ?? sug.suppliers[0]?.id
                    return (
                      <div key={sug.stock_item_id} className={`space-y-2 rounded-lg border p-3 ${sug.has_conflict ? "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-900/10" : "border-border bg-muted/40"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground">{sug.stock_item_name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {t("purchaseOrdersTab.suggestOrderQtyHint", { needed: sug.needed, unit: sug.unit })}
                          </span>
                        </div>
                        {sug.has_conflict ? (
                          <div className="flex flex-wrap gap-2">
                            {sug.suppliers.map((sup) => (
                              <button
                                key={sup.id}
                                type="button"
                                onClick={() => setPreferredSuppliers((prev) => ({ ...prev, [sug.stock_item_id]: sup.id }))}
                                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                  selected === sup.id
                                    ? "border-blue-600 bg-blue-600 text-white"
                                    : "border-border bg-background text-muted-foreground hover:border-blue-400"
                                }`}
                              >
                                {selected === sup.id && <CheckCircle size={11} className="shrink-0" />}
                                {sup.name}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {t("purchaseOrdersTab.suggestSupplierPrefix")} <strong>{sug.suppliers[0]?.name}</strong>
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>

                {suggestPreview.skipped_items.length > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t("purchaseOrdersTab.suggestSkippedNotice", { count: suggestPreview.skipped_items.length })}
                  </p>
                )}
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setSuggestStep("form"); setSuggestPreview(null); setPreferredSuppliers({}) }}>{t("purchaseOrdersTab.suggestBack")}</Button>
                <Button
                  type="button"
                  disabled={suggestMut.isPending}
                  onClick={async () => {
                    try {
                      const res = await suggestMut.mutateAsync({ warehouse_id: suggestWarehouseId, preferred_suppliers: preferredSuppliers })
                      const created: number = res?.data?.created_count ?? 0
                      const skippedItems: SkippedItem[] = res?.data?.skipped_items ?? []
                      setSuggestResult({ created_count: created, skipped_items: skippedItems })
                      setSuggestStep("result")
                    } catch { /* hata useMutation tarafından yönetilir */ }
                  }}
                >
                  {suggestMut.isPending ? t("purchaseOrdersTab.suggestMutating") : t("purchaseOrdersTab.suggestCreateOrders")}
                </Button>
              </DialogFooter>
            </>
          )}

          {suggestStep === "result" && suggestResult && (
            <>
              <DialogBody className="space-y-4">
                <div className="flex flex-col gap-2">
                  {suggestResult.created_count > 0 && (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
                      <CheckCircle size={15} className="shrink-0" />
                      <span>{t("purchaseOrdersTab.suggestResultCreated", { count: suggestResult.created_count })}</span>
                    </div>
                  )}
                  {suggestResult.created_count === 0 && suggestResult.skipped_items.length === 0 && (
                    <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                      {t("purchaseOrdersTab.suggestResultNoItems")}
                    </div>
                  )}
                </div>

                {suggestResult.skipped_items.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                      {t("purchaseOrdersTab.suggestSkippedListTitle", { count: suggestResult.skipped_items.length })}
                    </p>
                    <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/10">
                      <div className="max-h-52 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 z-10">
                            <tr className="border-b border-amber-200 bg-amber-100 dark:border-amber-800 dark:bg-amber-900/40">
                              <th className="px-3 py-2 text-left font-semibold text-amber-800 dark:text-amber-300">{t("purchaseOrdersTab.suggestSkippedColProduct")}</th>
                              <th className="px-3 py-2 text-right font-semibold text-amber-800 dark:text-amber-300">{t("purchaseOrdersTab.suggestSkippedColCurrent")}</th>
                              <th className="px-3 py-2 text-right font-semibold text-amber-800 dark:text-amber-300">{t("purchaseOrdersTab.suggestSkippedColMin")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-amber-100 dark:divide-amber-900/40">
                            {suggestResult.skipped_items.map((item) => (
                              <tr key={item.id}>
                                <td className="px-3 py-1.5 font-medium text-foreground">{item.name}</td>
                                <td className="px-3 py-1.5 text-right text-muted-foreground">{formatQuantityWithUnit(item.quantity, item.unit)}</td>
                                <td className="px-3 py-1.5 text-right text-muted-foreground">{formatQuantityWithUnit(item.minimum_quantity, item.unit)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("purchaseOrdersTab.suggestInventoryHint")}
                    </p>
                  </div>
                )}
              </DialogBody>
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => {
                    const count = suggestResult.created_count
                    closeSuggestModal()
                    if (count > 0) toast.success(t("purchaseOrdersTab.suggestToastCreated", { count }))
                  }}
                >
                  {t("purchaseOrdersTab.suggestOk")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
