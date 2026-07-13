"use client"

import { useCallback, useMemo, useState } from "react"
import { Sparkles, Search, AlertTriangle, Info } from "lucide-react"
import { toast } from "sonner"
import { useLocale, useTranslations } from "next-intl"
import { format, parseISO } from "date-fns"
import { useQuery } from "@tanstack/react-query"

import {
  usePurchaseRecommendations,
  useWarehouses,
} from "@/features/warehouse/hooks/useWarehouse"
import { useCommitPurchaseRecommendations } from "@/features/warehouse/hooks/useWarehouseActions"
import { PurchaseRecommendationsTable } from "./PurchaseRecommendationsTable"
import { ConfirmActionDialog } from "./ConfirmActionDialog"
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
import { CategorySelectTree } from "@/features/inventory/components/CategorySelectTree"
import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import { queryKeys } from "@/lib/queryKeys"
import { useModulePermissions } from "@/hooks/useModulePermissions"
import { PERMISSION_WAREHOUSE_COMMIT_PURCHASE_RECOMMENDATION } from "@/lib/constants"
import type { PurchaseRecommendation } from "@/features/warehouse/types"

type OverrideMap = Record<string, string>
type SelectedMap = Record<string, boolean>

export function PurchaseRecommendationsTab({ branchId }: { branchId?: string }) {
  const locale = useLocale()
  const t = useTranslations("warehouse")
  const { canManage } = useModulePermissions()
  const canCommit = canManage(PERMISSION_WAREHOUSE_COMMIT_PURCHASE_RECOMMENDATION)

  const { data: warehouses = [] } = useWarehouses(branchId)
  const { data: categories = [] } = useQuery({
    queryKey: queryKeys.categoriesBase,
    queryFn: () => inventoryApi.getCategories(),
  })

  const [warehouseId, setWarehouseId] = useState("")
  const [weeks, setWeeks] = useState<4 | 8>(4)
  const [horizonDays, setHorizonDays] = useState<3 | 7 | 14>(7)
  const [categoryId, setCategoryId] = useState("")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<SelectedMap>({})
  const [overrides, setOverrides] = useState<OverrideMap>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [preferredSuppliers, setPreferredSuppliers] = useState<Record<string, string>>({})

  const filters = useMemo(
    () => ({
      warehouse_id: warehouseId || undefined,
      weeks,
      horizon_days: horizonDays,
      branch_id: branchId,
      category_id: categoryId || undefined,
      search: search.trim() || undefined,
      only_positive: true,
    }),
    [warehouseId, weeks, horizonDays, branchId, categoryId, search],
  )

  const {
    rows,
    meta,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePurchaseRecommendations(filters)

  const commitMut = useCommitPurchaseRecommendations()

  const selectedRows = useMemo(
    () => rows.filter((r) => selected[r.stock_item_id]),
    [rows, selected],
  )

  const getOrderQty = useCallback(
    (row: PurchaseRecommendation) => {
      const raw = overrides[row.stock_item_id] ?? row.recommended_quantity
      const n = Number.parseFloat(raw)
      return Number.isFinite(n) ? n : 0
    },
    [overrides],
  )

  const conflictRows = useMemo(
    () =>
      selectedRows.filter(
        (r) => r.has_supplier_conflict && !preferredSuppliers[r.stock_item_id],
      ),
    [selectedRows, preferredSuppliers],
  )

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelected({})
      return
    }
    const next: SelectedMap = {}
    for (const row of rows) next[row.stock_item_id] = true
    setSelected(next)
  }

  const handleCommitRequest = () => {
    if (!warehouseId || selectedRows.length === 0) return
    if (selectedRows.some((r) => r.suppliers.length === 0)) {
      toast.error(t("purchaseRecommendationsTab.noSupplierSelected"))
      return
    }
    if (conflictRows.length > 0) {
      setResolveOpen(true)
      return
    }
    setConfirmOpen(true)
  }

  const handleCommit = async () => {
    if (!warehouseId || selectedRows.length === 0) return
    const items = selectedRows
      .map((row) => ({
        stock_item_id: row.stock_item_id,
        quantity: String(getOrderQty(row)),
        recommended_quantity: row.recommended_quantity,
      }))
      .filter((item) => Number.parseFloat(item.quantity) > 0)

    if (items.length === 0) {
      toast.error(t("purchaseRecommendationsTab.invalidQuantities"))
      return
    }

    try {
      const res = await commitMut.mutateAsync({
        warehouse_id: warehouseId,
        items,
        preferred_suppliers: preferredSuppliers,
      })
      const created = res.data?.created_count ?? 0
      const skipped = res.data?.skipped_items?.length ?? 0
      setSelected({})
      setOverrides({})
      setPreferredSuppliers({})
      if (created > 0) {
        toast.success(t("purchaseRecommendationsTab.commitSuccess", { count: created }))
      }
      if (skipped > 0) {
        toast.warning(t("purchaseRecommendationsTab.commitSkipped", { count: skipped }))
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        t("purchaseRecommendationsTab.commitError")
      toast.error(msg)
    }
  }

  const allSelected = rows.length > 0 && rows.every((r) => selected[r.stock_item_id])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-foreground">
          <Sparkles size={18} className="text-amber-500" />
          <span className="text-sm font-semibold">{t("purchaseRecommendationsTab.title")}</span>
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-amber-600 focus:outline-none focus:ring-2 focus:ring-ring/40"
            aria-label={t("purchaseRecommendationsTab.info.aria")}
          >
            <Info size={14} />
          </button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={warehouseId}
            onChange={(e) => {
              setWarehouseId(e.target.value)
              setSelected({})
            }}
            className="min-w-[180px] px-3 py-2 rounded-lg border border-border bg-card text-sm outline-none"
          >
            <option value="">{t("purchaseRecommendationsTab.selectWarehouse")}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>

          <select
            value={horizonDays}
            onChange={(e) => {
              const v = Number(e.target.value)
              setHorizonDays(v === 3 || v === 14 ? v : 7)
            }}
            className="px-3 py-2 rounded-lg border border-border bg-card text-sm outline-none"
          >
            <option value={3}>{t("purchaseRecommendationsTab.horizon3")}</option>
            <option value={7}>{t("purchaseRecommendationsTab.horizon7")}</option>
            <option value={14}>{t("purchaseRecommendationsTab.horizon14")}</option>
          </select>

          <select
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value) === 8 ? 8 : 4)}
            className="px-3 py-2 rounded-lg border border-border bg-card text-sm outline-none"
          >
            <option value={4}>{t("purchaseRecommendationsTab.weeks4")}</option>
            <option value={8}>{t("purchaseRecommendationsTab.weeks8")}</option>
          </select>

          <CategorySelectTree
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            placeholder={t("purchaseRecommendationsTab.allCategories")}
            className="w-44"
          />

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("purchaseRecommendationsTab.searchPlaceholder")}
              className="pl-9 pr-3 py-2 w-44 rounded-lg border border-border bg-card text-sm outline-none"
            />
          </div>
        </div>
      </div>

      {meta?.since ? (
        <p className="shrink-0 text-xs text-muted-foreground">
          {t("purchaseRecommendationsTab.meta", {
            since: format(
              parseISO(meta.since),
              locale === "tr" ? "MM.dd.yyyy" : "yyyy.MM.dd",
            ),
            weeks: meta.weeks,
            safety: meta.safety_factor,
            horizon: meta.horizon_days ?? horizonDays,
          })}
          {meta.count > 0 ? (
            <span className="ml-2">
              {t("purchaseRecommendationsTab.loadedOfTotal", {
                loaded: rows.length,
                total: meta.count,
              })}
            </span>
          ) : null}
        </p>
      ) : null}

      {canCommit ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={!warehouseId || selectedRows.length === 0 || commitMut.isPending}
            onClick={handleCommitRequest}
            className="inline-flex items-center gap-2"
          >
            <Sparkles size={16} />
            {commitMut.isPending
              ? t("purchaseRecommendationsTab.committing")
              : t("purchaseRecommendationsTab.commitSelected", { count: selectedRows.length })}
          </Button>
        </div>
      ) : null}

      {/* Purchase Recommendations Table */}
      <PurchaseRecommendationsTable
        rows={rows}
        canCommit={canCommit}
        warehouseSelected={!!warehouseId}
        selected={selected}
        overrides={overrides}
        onToggleSelect={(id, checked) =>
          setSelected((prev) => ({ ...prev, [id]: checked }))
        }
        onToggleAll={toggleAll}
        onOverrideChange={(id, value) =>
          setOverrides((prev) => ({ ...prev, [id]: value }))
        }
        allSelected={allSelected}
        fetchNextPage={() => void fetchNextPage()}
        hasNextPage={!!hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        isLoading={isLoading}
      />

      {/* Resolve Conflict Dialog */}
      <Dialog open={resolveOpen} onOpenChange={(open) => !open && setResolveOpen(false)}>
        <DialogContent layout="scroll" size="2xl">
          <DialogHeader>
            <DialogTitle>{t("purchaseRecommendationsTab.resolveTitle")}</DialogTitle>
            <DialogDescription>{t("purchaseRecommendationsTab.resolveSubtitle")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 max-h-[50vh] overflow-y-auto">
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{t("purchaseRecommendationsTab.resolveBanner")}</span>
            </div>
            {conflictRows.map((row) => (
              <div key={row.stock_item_id} className="rounded-lg border border-border p-3">
                <div className="font-medium text-sm mb-2">{row.stock_item_name}</div>
                <select
                  value={preferredSuppliers[row.stock_item_id] ?? ""}
                  onChange={(e) =>
                    setPreferredSuppliers((prev) => ({
                      ...prev,
                      [row.stock_item_id]: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                >
                  <option value="">{t("purchaseRecommendationsTab.pickSupplier")}</option>
                  {row.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResolveOpen(false)}>
              {t("warehouseForm.cancel")}
            </Button>
            <Button
              type="button"
              disabled={conflictRows.some((r) => !preferredSuppliers[r.stock_item_id])}
              onClick={() => {
                setResolveOpen(false)
                setConfirmOpen(true)
              }}
            >
              {t("purchaseRecommendationsTab.continueCommit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Action Dialog */}
      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => void handleCommit()}
        title={t("purchaseRecommendationsTab.confirmTitle")}
        description={t("purchaseRecommendationsTab.confirmDescription", {
          count: selectedRows.length,
        })}
        confirmText={t("purchaseRecommendationsTab.confirmAction")}
      />

        {/* Info Dialog */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent layout="scroll" size="4xl" className="max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>{t("purchaseRecommendationsTab.info.title")}</DialogTitle>
            <DialogDescription>{t("purchaseRecommendationsTab.info.subtitle")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 text-sm text-muted-foreground">
            {(
              [
                "overview",
                "filters",
                "window",
                "calculation",
                "safety",
                "columns",
                "status",
                "urgency",
                "commit",
              ] as const
            ).map((section) => (
              <section key={section}>
                <h4 className="mb-1 font-semibold text-foreground">
                  {t(`purchaseRecommendationsTab.info.${section}Title`)}
                </h4>
                <p>{t(`purchaseRecommendationsTab.info.${section}Body`)}</p>
              </section>
            ))}
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => setInfoOpen(false)}>
              {t("purchaseRecommendationsTab.info.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
