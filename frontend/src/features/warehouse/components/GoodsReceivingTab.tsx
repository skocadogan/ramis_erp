"use client"

import { useState } from "react"
import { Plus, Search, Eye, PackageCheck, Trash2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { AsyncPdfExportButton } from "@/components/AsyncPdfExportButton"
import { useGoodsReceivingsInfinite, useWarehouses } from "@/features/warehouse/hooks/useWarehouse"
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table"
import { useCreateGoodsReceiving, useCompleteGoodsReceiving, useDeleteGoodsReceiving } from "@/features/warehouse/hooks/useWarehouseActions"
import { ConfirmActionDialog } from "./ConfirmActionDialog"
import { StatusBadge } from "./StatusBadge"
import type { GoodsReceiving } from "@/features/warehouse/types"
import { GoodsReceivingFormModal } from "./GoodsReceivingFormModal"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatQuantity, formatAmount } from "@/lib/formatters"
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts"
import { useTranslations } from "next-intl"

export function GoodsReceivingTab({ branchId }: { branchId?: string }) {
  const tw = useTranslations("warehouse")
  const canViewAmounts = useCanViewAmounts()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const { data: branchWarehouses = [] } = useWarehouses(branchId)
  const allowedWarehouseIds = new Set(branchWarehouses.map((w) => w.id))
  const {
    rows: receivings,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useGoodsReceivingsInfinite({ status: statusFilter || undefined, branch_id: branchId })
  const [showForm, setShowForm] = useState(false)
  const [selectedItem, setSelectedItem] = useState<GoodsReceiving | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<GoodsReceiving | null>(null)

  const createMut = useCreateGoodsReceiving()
  const completeMut = useCompleteGoodsReceiving()
  const deleteMut = useDeleteGoodsReceiving()

  const confirmDeleteAction = async () => {
    if (!confirmDelete) return
    try {
      await deleteMut.mutateAsync(confirmDelete.id)
      toast.success(tw("goodsReceiving.deleteSuccess"))
      if (selectedItem?.id === confirmDelete.id) setSelectedItem(null)
      setConfirmDelete(null)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? tw("goodsReceiving.deleteErrorFallback"))
    }
  }

  const filtered = receivings
    .filter((r) => !branchId || allowedWarehouseIds.has(r.warehouse))
    .filter(
      (r) =>
        r.receiving_number.toLowerCase().includes(search.toLowerCase()) ||
        (r.supplier_name ?? "").toLowerCase().includes(search.toLowerCase())
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            placeholder={tw("goodsReceiving.searchPlaceholder")} value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-card text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm outline-none">
          <option value="">{tw("goodsReceiving.filterAllStatus")}</option>
          <option value="PENDING">{tw("status.gr.PENDING")}</option>
          <option value="INSPECTED">{tw("status.gr.INSPECTED")}</option>
          <option value="ACCEPTED">{tw("status.gr.ACCEPTED")}</option>
          <option value="PARTIALLY_ACCEPTED">{tw("status.gr.PARTIALLY_ACCEPTED")}</option>
          <option value="REJECTED">{tw("status.gr.REJECTED")}</option>
        </select>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm ml-auto">
          <Plus size={16} /><span>{tw("goodsReceiving.newReceiving")}</span>
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
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{tw("goodsReceiving.colReceivingNo")}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{tw("goodsReceiving.colOrderNo")}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{tw("goodsReceiving.colSupplier")}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{tw("goodsReceiving.colWarehouse")}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{tw("goodsReceiving.colStatus")}</th>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{tw("goodsReceiving.colDate")}</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">{tw("goodsReceiving.colAmount")}</th>
              <th className="text-center px-4 py-3 font-semibold text-muted-foreground">{tw("goodsReceiving.colActions")}</th>
            </tr>
          </thead>
        }
        emptyState={
          isLoading ? (
            <div className="text-center py-12 text-muted-foreground">{tw("goodsReceiving.loading")}</div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">{tw("goodsReceiving.empty")}</div>
          )
        }
        loadingMore={
          <tr>
            <td colSpan={8} className="text-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600 mx-auto" />
            </td>
          </tr>
        }
        renderRow={(r) => (
          <>
            <td className="px-4 py-3 font-mono text-xs text-emerald-600 dark:text-emerald-400">{r.receiving_number}</td>
            <td className="px-4 py-3 text-xs text-muted-foreground">{r.purchase_order_number ?? "—"}</td>
            <td className="px-4 py-3 font-medium text-foreground">{r.supplier_name ?? "—"}</td>
            <td className="px-4 py-3 text-muted-foreground">{r.warehouse_name ?? "—"}</td>
            <td className="px-4 py-3"><StatusBadge domain="gr" status={r.status} /></td>
            <td className="px-4 py-3 text-muted-foreground text-xs">{r.received_date}</td>
            <td className="px-4 py-3 text-right font-semibold text-foreground">
              {formatAmount(r.total_amount, canViewAmounts)}
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center justify-center gap-1">
                <button onClick={() => setSelectedItem(r)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title={tw("goodsReceiving.tooltipDetail")}>
                  <Eye size={14} />
                </button>
                {r.status === "PENDING" && (
                  <button onClick={async () => { await completeMut.mutateAsync(r.id) }}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors" title={tw("goodsReceiving.tooltipComplete")}>
                    <PackageCheck size={14} />
                  </button>
                )}
                {r.status === "PENDING" && (
                  <button
                    onClick={() => setConfirmDelete(r)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                    title={tw("goodsReceiving.tooltipDelete")}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </td>
          </>
        )}
      />

      <GoodsReceivingFormModal
          open={showForm}
          onSave={async (data) => {
            const { data: created } = await createMut.mutateAsync(data)
            try {
              await completeMut.mutateAsync(created.id)
              toast.success(tw("goodsReceiving.completeSuccess"))
            } catch (err: unknown) {
              const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
              toast.error(msg ?? tw("goodsReceiving.completeErrorFallback"))
            }
            setShowForm(false)
          }}
          onClose={() => setShowForm(false)}
          isLoading={createMut.isPending || completeMut.isPending}
        />

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent layout="scroll" size="2xl" className="max-h-[85vh]">
          {selectedItem ? (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle>{selectedItem.receiving_number}</DialogTitle>
                    <DialogDescription>
                      {selectedItem.supplier_name} • {selectedItem.warehouse_name}
                    </DialogDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge domain="gr" status={selectedItem.status} />
                    <AsyncPdfExportButton
                      reportSlug="goods-receiving-pdf"
                      params={{ goods_receiving_id: selectedItem.id }}
                      filename={`${selectedItem.receiving_number.replace(/[/\\]/g, "-")}.pdf`}
                      size="sm"
                      className="h-7 px-2 py-1 text-xs"
                    />
                  </div>
                </div>
              </DialogHeader>
              <DialogBody>
                <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                  <div><span className="text-muted-foreground">{tw("goodsReceiving.invoiceLabel")}</span> <span className="ml-2 font-medium">{selectedItem.invoice_number ?? "—"}</span></div>
                  <div><span className="text-muted-foreground">{tw("goodsReceiving.waybillLabel")}</span> <span className="ml-2 font-medium">{selectedItem.waybill_number ?? "—"}</span></div>
                  <div><span className="text-muted-foreground">{tw("goodsReceiving.receivedByLabel")}</span> <span className="ml-2 font-medium">{selectedItem.received_by_name ?? "—"}</span></div>
                  <div><span className="text-muted-foreground">{tw("goodsReceiving.inspectedByLabel")}</span> <span className="ml-2 font-medium">{selectedItem.inspected_by_name ?? "—"}</span></div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-muted-foreground font-medium">{tw("goodsReceiving.colProduct")}</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">{tw("goodsReceiving.colExpected")}</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">{tw("goodsReceiving.colReceived")}</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">{tw("goodsReceiving.colRejected")}</th>
                      <th className="text-right py-2 text-muted-foreground font-medium">{tw("goodsReceiving.colUnitPrice")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedItem.items?.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2 text-foreground">{item.stock_item_name}</td>
                        <td className="py-2 text-right">{formatQuantity(item.expected_quantity)}</td>
                        <td className="py-2 text-right text-emerald-600">{formatQuantity(item.received_quantity)}</td>
                        <td className="py-2 text-right text-red-500">{formatQuantity(item.rejected_quantity)}</td>
                        <td className="py-2 text-right">
                          {formatAmount(item.unit_price, canViewAmounts)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DialogBody>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        onConfirm={confirmDeleteAction}
        title={tw("goodsReceiving.deleteConfirmTitle")}
        description={tw("goodsReceiving.deleteConfirmDesc")}
        confirmText={tw("goodsReceiving.deleteConfirmButton")}
        variant="destructive"
      />
    </div>
  )
}
