"use client"

import { useMemo, useState } from "react"
import { Clock } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

import {
  useExpiryActionHistory,
  useExpiryActionTypes,
  useExpiryWarnings,
  useWarehouses,
} from "@/features/warehouse/hooks/useWarehouse"
import {
  useCommitExpiryAction,
  useAutoReturnCancelExpiredLot,
  useExecuteExpiryAction,
  usePreviewExpiryAction,
} from "@/features/warehouse/hooks/useWarehouseActions"
import { ExpiringLotsTable } from "./ExpiringLotsTable"
import { ExpiryActionDialog } from "./ExpiryActionDialog"
import { ConfirmActionDialog } from "./ConfirmActionDialog"
import { useModulePermissions } from "@/hooks/useModulePermissions"
import { PERMISSION_INVENTORY_MANAGE_EXPIRY_ACTION, PERMISSION_INVENTORY_MANAGE_RETURN_CANCEL } from "@/lib/constants"
import { cn } from "@/lib/utils"
import type { ExpiringLot, ExpiryActionPreviewSummary, ExpiryActionType } from "@/features/warehouse/types"

export function ExpiringLotsTab({ branchId }: { branchId?: string }) {
  const t = useTranslations("warehouse")
  const { canManage } = useModulePermissions()
  const canManageActions = canManage(PERMISSION_INVENTORY_MANAGE_EXPIRY_ACTION)
  const canManageReturnCancel = canManage(PERMISSION_INVENTORY_MANAGE_RETURN_CANCEL)

  const { data: warehouses = [] } = useWarehouses(branchId)
  const { data: actionTypesData } = useExpiryActionTypes()
  const automationEnabled = actionTypesData?.automation_enabled ?? false

  const [warehouseId, setWarehouseId] = useState<string>("")
  const [daysAhead, setDaysAhead] = useState<3 | 7>(3)
  const [selectedLot, setSelectedLot] = useState<ExpiringLot | null>(null)
  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<{ lot: ExpiringLot; actionType: ExpiryActionType } | null>(null)
  const [actionPreview, setActionPreview] = useState<ExpiryActionPreviewSummary | null>(null)
  const [autoReturnCancelLot, setAutoReturnCancelLot] = useState<ExpiringLot | null>(null)

  const filters = useMemo(
    () => ({ warehouse_id: warehouseId || undefined, days_ahead: daysAhead }),
    [warehouseId, daysAhead],
  )

  const {
    rows,
    totalCount,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useExpiryWarnings(filters)

  const historyParams = useMemo(
    () => ({
      warehouse_id: warehouseId || undefined,
      lot_id: selectedLot?.id,
      limit: 30,
    }),
    [warehouseId, selectedLot?.id],
  )

  const { data: history = [], isLoading: historyLoading } = useExpiryActionHistory(historyParams)
  const commitMut = useCommitExpiryAction()
  const previewMut = usePreviewExpiryAction()
  const executeMut = useExecuteExpiryAction()
  const autoReturnCancelMut = useAutoReturnCancelExpiredLot()

  const openActionDialog = (lot: ExpiringLot, actionType: ExpiryActionType) => {
    setActionPreview(null)
    setPendingAction({ lot, actionType })
    setActionDialogOpen(true)
  }

  const handleLegacyConfirm = async (notes: string) => {
    if (!pendingAction) return
    try {
      await commitMut.mutateAsync({
        lot_id: pendingAction.lot.id,
        action_type: pendingAction.actionType,
        notes,
      })
      toast.success(t("expiryActions.success"))
      setActionDialogOpen(false)
      setPendingAction(null)
    } catch {
      toast.error(t("expiryActions.error"))
    }
  }

  const handlePreview = async (payload: { notes: string; target_warehouse_id?: string }) => {
    if (!pendingAction) throw new Error("missing action")
    try {
      const preview = await previewMut.mutateAsync({
        lot_id: pendingAction.lot.id,
        action_type: pendingAction.actionType,
        notes: payload.notes,
        target_warehouse_id: payload.target_warehouse_id,
      })
      setActionPreview(preview)
      return preview
    } catch {
      toast.error(t("expiryActions.error"))
      throw new Error("preview failed")
    }
  }

  const handleExecute = async (payload: { notes: string; target_warehouse_id?: string }) => {
    if (!pendingAction) return
    try {
      const result = await executeMut.mutateAsync({
        lot_id: pendingAction.lot.id,
        action_type: pendingAction.actionType,
        notes: payload.notes,
        target_warehouse_id: payload.target_warehouse_id,
      })
      toast.success(t("expiryActions.executeSuccess"))
      if (result.linked_transfer_number) {
        toast.info(t("expiryActions.transferDraftCreated", { number: result.linked_transfer_number }))
      }
      setActionDialogOpen(false)
      setPendingAction(null)
      setActionPreview(null)
    } catch {
      toast.error(t("expiryActions.error"))
    }
  }

  const handleConfirmAutoReturnCancel = async () => {
    if (!autoReturnCancelLot) return
    const lotId = autoReturnCancelLot.id
    try {
      await autoReturnCancelMut.mutateAsync({ lot_id: lotId })
      toast.success(t("expiryActions.autoReturnCancelSuccess"))
      if (selectedLot?.id === lotId) {
        setSelectedLot(null)
      }
    } catch {
      toast.error(t("expiryActions.autoReturnCancelError"))
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <div className="flex items-center gap-2 text-foreground">
          <Clock size={18} />
          <span className="text-sm font-ui-semibold">{t("expiringLots.title")}</span>
          {totalCount > 0 ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-ui-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              {totalCount}
            </span>
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border bg-card p-0.5">
            {([3, 7] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDaysAhead(d)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-ui-medium transition-colors",
                  daysAhead === d
                    ? "bg-blue-600 text-white"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("expiringLots.daysPreset", { count: d })}
              </button>
            ))}
          </div>

          <select
            value={warehouseId}
            onChange={(e) => {
              setWarehouseId(e.target.value)
              setSelectedLot(null)
            }}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none"
          >
            <option value="">{t("expiringLots.filterAllWarehouses")}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:overflow-hidden">
        <ExpiringLotsTable
          rows={rows}
          canManage={canManageActions}
          canManageReturnCancel={canManageReturnCancel}
          isLoading={isLoading}
          selectedLotId={selectedLot?.id}
          onSelectLot={setSelectedLot}
          onAction={openActionDialog}
          onAutoReturnCancel={setAutoReturnCancelLot}
          fetchNextPage={() => fetchNextPage()}
          hasNextPage={!!hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
        />

        <aside className="flex w-full shrink-0 flex-col rounded-xl border border-border/80 bg-card/50 dark:border-slate-800 lg:w-80 lg:min-h-0">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-ui-semibold text-foreground">{t("expiryActions.historyTitle")}</h3>
            <p className="text-xs text-muted-foreground">
              {selectedLot
                ? t("expiryActions.historyFiltered", { name: selectedLot.stock_item_name })
                : t("expiryActions.historyAll")}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {historyLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("expiringLots.loading")}</p>
            ) : history.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("expiryActions.historyEmpty")}</p>
            ) : (
              <ul className="space-y-3">
                {history.map((item) => (
                  <li key={item.id} className="rounded-lg border border-border/60 bg-background/80 p-3 text-sm">
                    <div className="font-ui-medium text-foreground">{item.action_type_label}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.stock_item_name} · {item.warehouse_name}
                    </div>
                    {item.notes ? <p className="mt-1 text-xs text-foreground">{item.notes}</p> : null}
                    {item.linked_transfer_number ? (
                      <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                        {t("expiryActions.linkedTransfer", { number: item.linked_transfer_number })}
                      </p>
                    ) : null}
                    <div className="mt-2 text-2xs text-muted-foreground">
                      {item.created_by_name ?? "—"} · {new Date(item.created_at).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <ExpiryActionDialog
        open={actionDialogOpen}
        onOpenChange={(open) => {
          setActionDialogOpen(open)
          if (!open) {
            setPendingAction(null)
            setActionPreview(null)
          }
        }}
        lot={pendingAction?.lot ?? null}
        actionType={pendingAction?.actionType ?? null}
        automationEnabled={automationEnabled}
        warehouses={warehouses}
        onLegacyConfirm={(notes) => void handleLegacyConfirm(notes)}
        onPreview={handlePreview}
        onExecute={(payload) => void handleExecute(payload)}
        preview={actionPreview}
        isPreviewPending={previewMut.isPending}
        isExecutePending={executeMut.isPending}
      />

      <ConfirmActionDialog
        open={!!autoReturnCancelLot}
        onOpenChange={(open) => {
          if (!open) setAutoReturnCancelLot(null)
        }}
        title={t("expiryActions.autoReturnCancelTitle")}
        description={
          autoReturnCancelLot
            ? t("expiryActions.autoReturnCancelDescription", {
                product: autoReturnCancelLot.stock_item_name,
                lot: autoReturnCancelLot.lot_number || "—",
                quantity: String(autoReturnCancelLot.quantity),
              })
            : ""
        }
        confirmText={t("expiryActions.autoReturnCancelConfirm")}
        onConfirm={() => void handleConfirmAutoReturnCancel()}
      />
    </div>
  )
}
