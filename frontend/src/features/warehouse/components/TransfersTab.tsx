"use client"

import { useState } from "react"
import { isAxiosError } from "axios"
import { Plus, Search, Eye, CheckCircle, Truck, XCircle, Pencil, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { parseApiError } from "@/lib/parseApiError"
import { useTransfersInfinite, useWarehouses } from "@/features/warehouse/hooks/useWarehouse"
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table"
import {
  useCreateTransfer,
  useUpdateTransfer,
  useApproveTransfer,
  useCompleteTransfer,
  useCancelTransfer,
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
import type { WarehouseTransfer } from "@/features/warehouse/types"
import { TransferFormModal } from "./TransferFormModal"
import { ConfirmActionDialog } from "./ConfirmActionDialog"
import {
  TransferStockInsufficientDialog,
  type TransferInsufficientLine,
} from "./TransferStockInsufficientDialog"
import { formatQuantity } from "@/lib/formatters"
import { useModulePermissions } from "@/hooks/useModulePermissions"
import { PERMISSION_WAREHOUSE_APPROVE_TRANSFER } from "@/lib/constants"
import { useTranslations } from "next-intl"

function isTransferEditable(tf: WarehouseTransfer) {
  return tf.status !== "COMPLETED" && tf.status !== "CANCELLED"
}

type TransferFormMode = null | { mode: "create" } | { mode: "edit"; transfer: WarehouseTransfer }

export function TransfersTab({ branchId }: { branchId?: string }) {
  const tw = useTranslations("warehouse")
  const { canManage } = useModulePermissions()
  const canApproveTransfer = canManage(PERMISSION_WAREHOUSE_APPROVE_TRANSFER)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const { data: branchWarehouses = [] } = useWarehouses(branchId)
  const allowedWarehouseIds = new Set(branchWarehouses.map((w) => w.id))
  const {
    rows: transfers,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTransfersInfinite({ status: statusFilter || undefined, branch_id: branchId })
  const [formMode, setFormMode] = useState<TransferFormMode>(null)
  const [selectedItem, setSelectedItem] = useState<WarehouseTransfer | null>(null)
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)
  const [partialStock, setPartialStock] = useState<{
    payload: Record<string, unknown>
    insufficient: TransferInsufficientLine[]
    feasibleCount: number
    mode: "create" | "edit"
    transferId?: string
  } | null>(null)
  const [approveBlocked, setApproveBlocked] = useState<TransferInsufficientLine[] | null>(null)

  const createMut = useCreateTransfer()
  const updateMut = useUpdateTransfer()
  const approveMut = useApproveTransfer()
  const completeMut = useCompleteTransfer()
  const cancelMut = useCancelTransfer()

  const filtered = transfers
    .filter((tf) => !branchId || allowedWarehouseIds.has(tf.source_warehouse) || allowedWarehouseIds.has(tf.target_warehouse))
    .filter((tf) => tf.transfer_number.toLowerCase().includes(search.toLowerCase()))

  const handleAction = async (action: string, id: string) => {
    try {
      switch (action) {
        case "approve":
          try {
            await approveMut.mutateAsync(id)
            toast.success(tw("transfers.approved"))
          } catch (e) {
            if (isAxiosError(e) && e.response?.data && typeof e.response.data === "object") {
              const d = e.response.data as Record<string, unknown>
              if (d.code === "INSUFFICIENT_STOCK" && Array.isArray(d.insufficient_items)) {
                setApproveBlocked(d.insufficient_items as TransferInsufficientLine[])
                return
              }
            }
            toast.error(parseApiError(e))
          }
          break
        case "complete":
          await completeMut.mutateAsync(id)
          toast.success(tw("transfers.completed"))
          break
        case "cancel":
          setConfirmCancel(id)
          break
      }
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  const confirmCancelAction = async () => {
    if (!confirmCancel) return
    try {
      await cancelMut.mutateAsync(confirmCancel)
      setConfirmCancel(null)
      toast.success(tw("transfers.cancelled"))
    } catch (e) {
      toast.error(parseApiError(e))
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input type="text" placeholder={tw("transfers.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-card text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm outline-none">
          <option value="">{tw("transfers.filterAllStatus")}</option>
          <option value="DRAFT">{tw("status.transfer.DRAFT")}</option>
          <option value="PENDING">{tw("status.transfer.PENDING")}</option>
          <option value="IN_TRANSIT">{tw("status.transfer.IN_TRANSIT")}</option>
          <option value="COMPLETED">{tw("status.transfer.COMPLETED")}</option>
          <option value="CANCELLED">{tw("status.transfer.CANCELLED")}</option>
        </select>
        <button
          onClick={() => {
            toast.dismiss()
            setFormMode({ mode: "create" })
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm ml-auto"
        >
          <Plus size={16} /><span>{tw("transfers.newTransfer")}</span>
        </button>
      </div>

      <VirtualTable
        rows={filtered}
        rowHeight={52}
        overscan={8}
        fetchMore={() => void fetchNextPage()}
        hasMore={!!hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        className="min-h-0 flex-1 rounded-xl border border-border/80 dark:border-slate-800 bg-card/50"
        tableClassName="w-full text-sm"
        header={
          <thead className={virtualTableStickyHeadClass}>
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{tw("transfers.colTransferNo")}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{tw("transfers.colSourceWarehouse")}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{tw("transfers.colTargetWarehouse")}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{tw("transfers.colStatus")}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{tw("transfers.colDate")}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{tw("transfers.colRequestedBy")}</th>
              <th className="text-center px-4 py-3 font-semibold text-muted-foreground">{tw("transfers.colActions")}</th>
            </tr>
          </thead>
        }
        emptyState={
          isLoading ? (
            <div className="text-center py-12 text-muted-foreground">{tw("transfers.loading")}</div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">{tw("transfers.empty")}</div>
          )
        }
        loadingMore={
          <tr>
            <td colSpan={7} className="text-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600 mx-auto" />
            </td>
          </tr>
        }
        renderRow={(row) => (
          <>
            <td className="px-4 py-3 font-mono text-xs text-indigo-600 dark:text-indigo-400">{row.transfer_number}</td>
            <td className="px-4 py-3 text-foreground">{row.source_warehouse_name ?? "—"}</td>
            <td className="px-4 py-3 text-foreground">{row.target_warehouse_name ?? "—"}</td>
            <td className="px-4 py-3"><StatusBadge domain="transfer" status={row.status} /></td>
            <td className="px-4 py-3 text-muted-foreground text-xs">{row.transfer_date}</td>
            <td className="px-4 py-3 text-muted-foreground">{row.requested_by_name ?? "—"}</td>
            <td className="px-4 py-3">
              <div className="flex items-center justify-center gap-1">
                <button onClick={() => setSelectedItem(row)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title={tw("transfers.tooltipDetail")}>
                  <Eye size={14} />
                </button>
                {isTransferEditable(row) && (
                  <button
                    type="button"
                    onClick={() => {
                      toast.dismiss()
                      setFormMode({ mode: "edit", transfer: row })
                    }}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                    title={tw("transfers.tooltipEdit")}
                  >
                    <Pencil size={14} />
                  </button>
                )}
                {(row.status === "DRAFT" || row.status === "PENDING") && canApproveTransfer && (
                  <button onClick={() => void handleAction("approve", row.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors" title={tw("transfers.tooltipApproveAction")}>
                    <CheckCircle size={14} />
                  </button>
                )}
                {row.status === "IN_TRANSIT" && (
                  <button onClick={() => void handleAction("complete", row.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors" title={tw("transfers.tooltipCompleteAction")}>
                    <Truck size={14} />
                  </button>
                )}
                {!["COMPLETED", "CANCELLED"].includes(row.status) && (
                  <button onClick={() => void handleAction("cancel", row.id)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title={tw("transfers.tooltipCancelAction")}>
                    <XCircle size={14} />
                  </button>
                )}
              </div>
            </td>
          </>
        )}
      />

      <TransferFormModal
          open={!!formMode}
          key={formMode?.mode === "edit" ? formMode.transfer.id : "new-transfer"}
          initialTransfer={formMode?.mode === "edit" ? formMode.transfer : null}
          onSave={async (data) => {
            if (!formMode) return
            try {
              if (formMode.mode === "edit") {
                await updateMut.mutateAsync({ id: formMode.transfer.id, data })
                setFormMode(null)
                toast.success(tw("transfers.updated"))
              } else {
                await createMut.mutateAsync(data)
                setFormMode(null)
                toast.success(tw("transfers.created"))
              }
            } catch (e) {
              if (isAxiosError(e) && e.response?.data && typeof e.response.data === "object") {
                const d = e.response.data as Record<string, unknown>
                if (d.code === "INSUFFICIENT_STOCK") {
                  const feasible = d.feasible_items
                  if (Array.isArray(feasible) && feasible.length > 0 && Array.isArray(d.insufficient_items)) {
                    setPartialStock({
                      payload: { ...data, items: feasible, accept_partial: true },
                      insufficient: d.insufficient_items as TransferInsufficientLine[],
                      feasibleCount: feasible.length,
                      mode: formMode.mode === "edit" ? "edit" : "create",
                      transferId: formMode.mode === "edit" ? formMode.transfer.id : undefined,
                    })
                    return
                  }
                }
              }
              toast.error(parseApiError(e))
            }
          }}
          onClose={() => setFormMode(null)}
          isLoading={createMut.isPending || updateMut.isPending}
        />

      <TransferStockInsufficientDialog
        open={!!partialStock}
        onOpenChange={(open) => !open && setPartialStock(null)}
        title={tw("transfers.partialDialogTitle")}
        description={
          partialStock?.mode === "edit"
            ? tw("transfers.insufficientBodyEdit")
            : tw("transfers.insufficientBodyCreate")
        }
        insufficientItems={partialStock?.insufficient ?? []}
        variant="partial"
        feasibleCount={partialStock?.feasibleCount ?? 0}
        isLoading={createMut.isPending || updateMut.isPending}
        onConfirmPartial={async () => {
          if (!partialStock) return
          try {
            if (partialStock.mode === "edit" && partialStock.transferId) {
              await updateMut.mutateAsync({ id: partialStock.transferId, data: partialStock.payload })
              toast.success(tw("transfers.updatedPartial"))
            } else {
              await createMut.mutateAsync(partialStock.payload)
              toast.success(tw("transfers.createdPartial"))
            }
            setPartialStock(null)
            setFormMode(null)
          } catch (err) {
            toast.error(parseApiError(err))
          }
        }}
      />

      <TransferStockInsufficientDialog
        open={!!approveBlocked}
        onOpenChange={(open) => !open && setApproveBlocked(null)}
        title={tw("transfers.cannotApproveTitle")}
        description={tw("transfers.cannotApproveDescription")}
        insufficientItems={approveBlocked ?? []}
        variant="info"
      />

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent layout="scroll" size="2xl" className="max-h-[85vh]">
          {selectedItem ? (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle>{selectedItem.transfer_number}</DialogTitle>
                    <DialogDescription>
                      {selectedItem.source_warehouse_name} → {selectedItem.target_warehouse_name}
                    </DialogDescription>
                  </div>
                  <StatusBadge domain="transfer" status={selectedItem.status} />
                </div>
              </DialogHeader>
              <DialogBody>
                <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">{tw("transfers.colDate")}</span>
                    <span className="ml-2 font-medium">
                      {new Date(selectedItem.transfer_date).toLocaleDateString("tr-TR")}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{tw("transfers.colRequestedBy")}</span>
                    <span className="ml-2 font-medium">{selectedItem.requested_by_name ?? "—"}</span>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-muted-foreground font-medium">{tw("transfers.colProduct")}</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">{tw("transfers.detailColQty")}</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">{tw("transfers.detailColUnit")}</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">{tw("transfers.colReceived")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedItem.items?.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2 text-foreground">{item.stock_item_name}</td>
                        <td className="py-2 text-right tabular-nums">{formatQuantity(item.quantity)}</td>
                        <td className="py-2 text-right text-muted-foreground">{item.unit}</td>
                        <td className="py-2 text-right tabular-nums text-emerald-600">{formatQuantity(item.received_quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selectedItem.notes ? (
                  <p className="mt-4 rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
                    {selectedItem.notes}
                  </p>
                ) : null}
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setSelectedItem(null)}>
                  {tw("countingDetail.closeButton")}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={!!confirmCancel}
        onOpenChange={(open) => !open && setConfirmCancel(null)}
        onConfirm={confirmCancelAction}
        title={tw("transfers.cancelTitle")}
        description={tw("transfers.cancelDescription")}
        confirmText={tw("transfers.cancelConfirm")}
        variant="destructive"
      />
    </div>
  )
}
