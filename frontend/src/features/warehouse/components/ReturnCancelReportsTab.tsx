"use client"

import React, { useMemo, useState } from "react"
import {
  FileSpreadsheet,
  Filter,
  Plus,
  Search,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { AsyncPdfExportButton } from "@/components/AsyncPdfExportButton"
import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import { ReturnCancelTable } from "@/features/warehouse/components/ReturnCancelTable"
import { ReturnCancelFormModal } from "@/features/warehouse/components/ReturnCancelFormModal"
import { ReturnCancelDetailModal } from "@/features/warehouse/components/ReturnCancelDetailModal"
import { ConfirmActionDialog } from "@/features/warehouse/components/ConfirmActionDialog"
import {
  defaultReturnCancelDateRange,
  summarizeReturnCancelRows,
  useDeleteReturnCancelMovement,
  useReturnCancelMovements,
  useReturnCancelReasonCodes,
} from "@/features/warehouse/hooks/useReturnCancelMovements"
import { useModulePermissions } from "@/hooks/useModulePermissions"
import { PERMISSION_INVENTORY_MANAGE_RETURN_CANCEL } from "@/lib/constants"
import type { StockMovement } from "@/features/inventory/types"
import { useQuery } from "@tanstack/react-query"

interface ReturnCancelReportsTabProps {
  branchId?: string
}

export function ReturnCancelReportsTab({ branchId }: ReturnCancelReportsTabProps) {
  const t = useTranslations("warehouse_return_cancel")
  const { canManage } = useModulePermissions()
  const canManageReturnCancel = canManage(PERMISSION_INVENTORY_MANAGE_RETURN_CANCEL)

  const defaults = defaultReturnCancelDateRange()
  const [startDate, setStartDate] = useState(defaults.startDate)
  const [endDate, setEndDate] = useState(defaults.endDate)
  const [movementType, setMovementType] = useState<"ALL" | "RETURN" | "CANCEL">("ALL")
  const [reasonCode, setReasonCode] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [search, setSearch] = useState("")
  const [isExportingExcel, setIsExportingExcel] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [detailTarget, setDetailTarget] = useState<StockMovement | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StockMovement | null>(null)

  const { data: reasonCodes = [] } = useReturnCancelReasonCodes()
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliersFilter"],
    queryFn: () => inventoryApi.getSuppliers(),
  })

  const filters = useMemo(
    () => ({
      branchId: branchId && branchId !== "ALL" ? branchId : undefined,
      startDate,
      endDate,
      movementType,
      reasonCode,
      supplierId,
      search,
    }),
    [branchId, startDate, endDate, movementType, reasonCode, supplierId, search],
  )

  const {
    movements,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useReturnCancelMovements(filters)

  const deleteMutation = useDeleteReturnCancelMovement()
  const { totalQty, totalAmount } = summarizeReturnCancelRows(movements)
  const currency = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" })

  const exportParams = {
    warehouse_id: filters.branchId,
    movement_types: "RETURN,CANCEL",
    start_date: startDate,
    end_date: endDate,
    movement_type: movementType !== "ALL" ? movementType : undefined,
    reason_code: reasonCode || undefined,
    supplier_id: supplierId || undefined,
    search: search.trim() || undefined,
  }

  const handleExportExcel = async () => {
    setIsExportingExcel(true)
    const toastId = toast.loading(t("reportPreparing"))
    try {
      const blob = await inventoryApi.exportReturnCancelExcel(exportParams)
      const url = window.URL.createObjectURL(new Blob([blob]))
      const link = document.createElement("a")
      link.href = url
      link.setAttribute("download", `Iptal_Iade_Raporu_${startDate}_${endDate}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success(t("downloadSuccess"), { id: toastId })
    } catch {
      toast.error(t("reportFailed"), { id: toastId })
    } finally {
      setIsExportingExcel(false)
    }
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t("deleteSuccess"))
        setDeleteTarget(null)
      },
      onError: () => {
        toast.error(t("deleteFailed"))
      },
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManageReturnCancel ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              {t("createButton")}
            </button>
          ) : null}
          <AsyncPdfExportButton
            reportSlug="stock-movement-list"
            params={exportParams}
            filename={`Iptal_Iade_Raporu_${startDate}_${endDate}.pdf`}
            size="sm"
            className="h-9"
          />
          <button
            type="button"
            onClick={() => void handleExportExcel()}
            disabled={isExportingExcel}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {t("exportExcel")}
          </button>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
        <Filter size={16} className="text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">{t("filterLabel")}</span>
        <div className="relative min-w-[160px] flex-1 max-w-xs">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={movementType}
          onChange={(e) => setMovementType(e.target.value as "ALL" | "RETURN" | "CANCEL")}
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="ALL">{t("movementTypeAll")}</option>
          <option value="RETURN">{t("movementTypeReturn")}</option>
          <option value="CANCEL">{t("movementTypeCancel")}</option>
        </select>
        <select
          value={reasonCode}
          onChange={(e) => setReasonCode(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="">{t("reasonAll")}</option>
          {reasonCodes.map((r) => (
            <option key={r.code} value={r.code}>{r.label}</option>
          ))}
        </select>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="h-9 max-w-[180px] rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="">{t("supplierAll")}</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-2 text-xs"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-2 text-xs"
        />
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border/80 bg-blue-50/80 p-4 dark:bg-blue-950/20">
          <p className="text-sub font-medium tracking-widertext-muted-foreground">{t("totalQuantity")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{totalQty.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-rose-50/80 p-4 dark:bg-rose-950/20">
          <p className="text-sub font-medium tracking-widertext-muted-foreground">{t("totalCostEstimate")}</p>
          <p className={cn("mt-1 text-2xl font-bold tabular-nums", totalAmount > 0 && "text-rose-600 dark:text-rose-400")}>
            {currency.format(totalAmount)}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">{t("loading")}</div>
      ) : (
        <ReturnCancelTable
          rows={movements}
          canManage={canManageReturnCancel}
          onSelect={setDetailTarget}
          onDelete={setDeleteTarget}
          infiniteControls={{
            hasNextPage,
            isFetchingNextPage,
            fetchNextPage: () => void fetchNextPage(),
          }}
        />
      )}

      <ReturnCancelFormModal
          open={showCreate}
          defaultWarehouseId={branchId && branchId !== "ALL" ? branchId : undefined}
          onClose={() => setShowCreate(false)}
        />

      <ReturnCancelDetailModal
          open={!!detailTarget}
          row={detailTarget}
          canManage={canManageReturnCancel}
          onClose={() => setDetailTarget(null)}
          onDelete={(row) => {
            setDetailTarget(null)
            setDeleteTarget(row)
          }}
        />

      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={t("deleteConfirmTitle")}
        description={t("deleteConfirmDescription")}
        confirmText={t("delete")}
        cancelText={t("formCancel")}
        variant="destructive"
      />
    </div>
  )
}
