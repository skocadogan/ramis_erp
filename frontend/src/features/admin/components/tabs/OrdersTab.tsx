"use client"

import { useState, useMemo } from "react"
import { useTranslations } from "next-intl"
import { ShoppingBag, Search, PowerOff, Trash2, Loader2 } from "lucide-react"
import Link from "next/link"
import { useAuthStore } from "@/store/useAuthStore"
import { hasModuleAccess } from "@/lib/constants"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { AMOUNT_DISPLAY_MASK, formatCurrency, formatDate, formatAmount } from "@/lib/formatters"
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts"
import { toast } from "sonner"
import api, { skipInterceptorToast } from "@/lib/api"
import { toastApiError } from "@/lib/operationalToast"
import { Button } from "@/components/ui/button"
import { CancellationReasonModal } from "../modals/CancellationReasonModal"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table"

interface OrderItemModifier {
  id: string
  modifier_name: string
  price: number
}

interface AdminOrderItem {
  id: string
  product_name: string
  variant_name?: string | null
  quantity: number
  unit_price: number
  total_price: number
  status: string
  notes?: string | null
  station_name?: string | null
  modifiers?: OrderItemModifier[]
}

export interface AdminOrderRow {
  id: string
  branch?: string
  branch_name?: string
  table?: string | null
  table_name?: string
  user?: string | null
  user_name?: string | null
  status: string
  total_amount: number
  notes?: string | null
  items?: AdminOrderItem[]
  created_at: string
  updated_at?: string
}

function orderStatusBadgeClass(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
    case "PENDING":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
    case "PREPARING":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
    case "READY":
      return "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
    case "DELIVERED":
      return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
    case "CANCELLED":
      return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
    default:
      return "bg-slate-100 text-slate-600 bg-muted text-muted-foreground"
  }
}

interface OrdersTabProps {
  orders: AdminOrderRow[]
  isLoading?: boolean
  fetchNextPage: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
  searchTerm: string
  setSearchTerm: (s: string) => void
  onRefresh?: () => void
}

export function OrdersTab({
  orders,
  isLoading = false,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  searchTerm,
  setSearchTerm,
  onRefresh,
}: OrdersTabProps) {
  const t = useTranslations("admin")
  const [detailOrder, setDetailOrder] = useState<AdminOrderRow | null>(null)
  const canViewAmounts = useCanViewAmounts()
  const user = useAuthStore((s) => s.user)
  const canOpenPos = hasModuleAccess(user?.permissions, user?.is_superuser, "pos")
  const [isClosing, setIsClosing] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showForceCloseConfirm, setShowForceCloseConfirm] = useState(false)

  const handleCancelOrder = async (reasonCode: string, reasonText: string) => {
    if (!detailOrder) return
    setIsClosing(true)
    try {
      await api.post(`/orders/main/${detailOrder.id}/cancel/`, {
        reason_code: reasonCode,
        reason_text: reasonText
      }, { ...skipInterceptorToast })
      toast.success(t('orders.actions.cancelSuccess'))
      onRefresh?.()
      setDetailOrder(null)
    } catch (err) {
      toastApiError(err, t('orders.errors.cancelFailed'))
    } finally {
      setIsClosing(false)
    }
  }

  const handleForceClose = async () => {
    if (!detailOrder) return
    setIsClosing(true)
    try {
      await api.post(`/orders/main/${detailOrder.id}/force_close/`, undefined, { ...skipInterceptorToast })
      toast.success(t('orders.actions.forceCloseSuccess'))
      onRefresh?.()
      setDetailOrder(null)
      setShowForceCloseConfirm(false)
    } catch (err) {
      toastApiError(err, t('orders.errors.forceCloseFailed'))
    } finally {
      setIsClosing(false)
    }
  }

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim()
    const base = !q
      ? orders
      : orders.filter(o => {
          const hay = [
            o.id,
            o.status,
            o.table_name,
            o.user_name,
            o.branch_name,
            o.notes ?? "",
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
          return hay.includes(q)
        })
    return base
  }, [orders, searchTerm])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t('orders.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('orders.description')}</p>
        </div>
        {canOpenPos && (
        <Link
          href="/pos"
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 shadow-sm dark:bg-blue-600 dark:hover:bg-blue-500 transition-colors"
        >
          <ShoppingBag size={16} />
          {t('orders.goToPage')}
        </Link>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground" />
          <input
            type="text"
            placeholder={t('orders.searchPlaceholder')}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 w-full border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:focus:border-blue-500 bg-background"
          />
        </div>
      </div>

      <VirtualTable
        rows={filtered}
        rowHeight={48}
        overscan={8}
        fetchMore={fetchNextPage}
        hasMore={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        className="max-h-[calc(100vh-14rem)] bg-card rounded-2xl border border-border shadow-sm bg-card border-border"
        tableClassName="w-full text-sm"
        header={
          <thead className={virtualTableStickyHeadClass}>
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-600 text-muted-foreground">{t('orders.fields.id')}</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-600 text-muted-foreground">{t('orders.fields.date')}</th>
              <th className="text-center px-4 py-3 font-semibold text-slate-600 text-muted-foreground">{t('orders.fields.status')}</th>
              <th className="text-right px-4 py-3 font-semibold text-slate-600 text-muted-foreground">{t('orders.fields.total')}</th>
            </tr>
          </thead>
        }
        emptyState={
          isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-10">{t('common.noMatch')}</p>
          )
        }
        loadingMore={
          <tr>
            <td colSpan={4} className="text-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600 mx-auto" />
            </td>
          </tr>
        }
        renderRow={(o) => (
          <>
            <td
              className="px-4 py-3 cursor-pointer"
              onClick={() => setDetailOrder(o)}
            >
              <button
                type="button"
                className="font-mono text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline text-left"
                onClick={e => {
                  e.stopPropagation()
                  setDetailOrder(o)
                }}
              >
                #{o.id.slice(0, 8)}…
              </button>
            </td>
            <td
              className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap dark:text-muted-foreground cursor-pointer"
              onClick={() => setDetailOrder(o)}
            >
              {formatDate(o.created_at)}
            </td>
            <td
              className="px-4 py-3 text-center cursor-pointer"
              onClick={() => setDetailOrder(o)}
            >
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${orderStatusBadgeClass(o.status)}`}
              >
                {t(`orders.status.${o.status}`)}
              </span>
            </td>
            <td
              className="px-4 py-3 text-right font-bold text-foreground cursor-pointer"
              onClick={() => setDetailOrder(o)}
            >
              {formatAmount(o.total_amount, canViewAmounts)}
            </td>
          </>
        )}
      />

      <Dialog open={!!detailOrder} onOpenChange={open => !open && setDetailOrder(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[min(90vh,640px)] overflow-y-auto gap-4 bg-card" showCloseButton>
          {detailOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="text-foreground">{t('orders.details')}</DialogTitle>
                <DialogDescription className="font-mono text-xs break-all text-muted-foreground">
                  {detailOrder.id}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 text-sm">
                <DetailRow label={t('orders.fields.status')}>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${orderStatusBadgeClass(detailOrder.status)}`}>
                    {t(`orders.status.${detailOrder.status}`)}
                  </span>
                </DetailRow>
                <DetailRow label={t('orders.fields.createdAt')}>
                  {formatDate(detailOrder.created_at)}
                </DetailRow>
                {detailOrder.updated_at && (
                  <DetailRow label={t('orders.fields.updatedAt')}>
                    {formatDate(detailOrder.updated_at)}
                  </DetailRow>
                )}
                <DetailRow label={t('orders.fields.branch')}>{detailOrder.branch_name ?? "—"}</DetailRow>
                <DetailRow label={t('orders.fields.table')}>{detailOrder.table_name?.trim() ? detailOrder.table_name : t('orders.fields.takeaway')}</DetailRow>
                <DetailRow label={t('orders.fields.user')}>{detailOrder.user_name?.trim() ? detailOrder.user_name : "—"}</DetailRow>
                <DetailRow label={t('orders.fields.notes')}>
                  {detailOrder.notes?.trim() ? detailOrder.notes : "—"}
                </DetailRow>
                <DetailRow label={t('orders.fields.total')} emphasized>
                  {formatAmount(detailOrder.total_amount, canViewAmounts)}
                </DetailRow>
              </div>

              <div className="border-t border-border pt-4 border-border">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {t('orders.items', { count: detailOrder.items?.length ?? 0 })}
                </h4>
                {!detailOrder.items?.length ? (
                  <p className="text-sm text-muted-foreground">{t('orders.itemsEmpty')}</p>
                ) : (
                  <ul className="space-y-3">
                    {detailOrder.items.map(item => (
                      <li
                        key={item.id}
                        className="rounded-lg border border-border bg-slate-50/80 bg-muted/40 border-border px-3 py-2"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-medium text-foreground">
                            {item.quantity}× {item.product_name}
                            {item.variant_name ? (
                              <span className="text-muted-foreground font-normal"> ({item.variant_name})</span>
                            ) : null}
                          </span>
                          <span className="text-xs font-semibold text-foreground">
                            {formatAmount(item.total_price, canViewAmounts)}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sub text-muted-foreground">
                          <span>
                            {t('orders.fields.unitPrice')}:{" "}
                            {formatAmount(item.unit_price, canViewAmounts)}
                          </span>
                          {item.station_name ? <span>{t('orders.fields.station')}: {item.station_name}</span> : null}
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-semibold ${orderStatusBadgeClass(item.status)}`}
                          >
                            {t(`orders.status.${item.status}`)}
                          </span>
                        </div>
                        {item.notes?.trim() ? (
                          <p className="mt-1 text-xs text-amber-800 dark:text-amber-200/90">{t('orders.fields.itemNote')}: {item.notes}</p>
                        ) : null}
                        {item.modifiers && item.modifiers.length > 0 ? (
                          <ul className="mt-1.5 text-sub text-slate-600 text-muted-foreground list-disc pl-4">
                            {item.modifiers.map(m => (
                              <li key={m.id}>
                                {m.modifier_name}
                                {m.price && Number(m.price) !== 0 ? (
                                  <span className="text-muted-foreground">
                                    {" "}
                                    {canViewAmounts
                                      ? `(+${formatCurrency(m.price)})`
                                      : `(+${AMOUNT_DISPLAY_MASK})`}
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="border-t border-border pt-4 flex justify-end gap-3 border-border">
                {detailOrder.status !== "COMPLETED" && detailOrder.status !== "CANCELLED" && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-amber-600 border-amber-200 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:border-amber-900/50 dark:hover:bg-amber-900/20"
                      onClick={handleForceClose}
                      disabled={isClosing}
                    >
                      <PowerOff className="mr-2 h-4 w-4" />
                      {t('orders.actions.forceClose')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-900/50 dark:hover:bg-red-900/20"
                      onClick={() => setShowCancelModal(true)}
                      disabled={isClosing}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('orders.actions.cancel')}
                    </Button>
                  </div>
                )}
                <Button variant="secondary" size="sm" onClick={() => setDetailOrder(null)} className="bg-muted text-foreground dark:hover:bg-slate-700">
                  {t('common.cancel')}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <CancellationReasonModal 
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleCancelOrder}
      />

      <AlertDialog open={showForceCloseConfirm} onOpenChange={setShowForceCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('orders.actions.forceClose')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('orders.actions.forceCloseConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClosing}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleForceClose()
              }}
              disabled={isClosing}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isClosing && <Loader2 size={14} className="animate-spin mr-1.5" />}
              {t('orders.actions.forceClose')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function DetailRow({
  label,
  children,
  emphasized,
}: {
  label: string
  children: React.ReactNode
  emphasized?: boolean
}) {
  return (
    <div className={`grid grid-cols-[120px_1fr] gap-2 ${emphasized ? "text-base font-semibold" : ""}`}>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <div className="text-foreground min-w-0 break-words text-foreground">{children}</div>
    </div>
  )
}
