"use client"

import { useState } from "react"
import { MapPin, Plus, Pencil, Trash2, Star, Search, Package } from "lucide-react"
import { useTranslations } from "next-intl"
import { useWarehouses } from "@/features/warehouse/hooks/useWarehouse"
import { useCreateWarehouse, useUpdateWarehouse, useDeleteWarehouse } from "@/features/warehouse/hooks/useWarehouseActions"
import { type Warehouse } from "@/features/warehouse/types"
import { WarehouseFormModal } from "./WarehouseFormModal"
import { ConfirmActionDialog } from "./ConfirmActionDialog"
import { WarehouseStockLevelsModal } from "./WarehouseStockLevelsModal"
import { WarehouseInventoryModal } from "./WarehouseInventoryModal"

export function WarehousesTab({ branchId }: { branchId?: string }) {
  const t = useTranslations("warehouse")
  const { data: warehouses = [], isLoading } = useWarehouses(branchId)
  const [search, setSearch] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Warehouse | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [levelsModal, setLevelsModal] = useState<{ id: string; name: string } | null>(null)
  const [inventoryModal, setInventoryModal] = useState<{ id: string; name: string } | null>(null)

  const createMut = useCreateWarehouse()
  const updateMut = useUpdateWarehouse()
  const deleteMut = useDeleteWarehouse()

  const filtered = warehouses.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.code.toLowerCase().includes(search.toLowerCase())
  )

  const handleSave = async (data: Record<string, unknown>) => {
    if (editItem) {
      await updateMut.mutateAsync({ id: editItem.id, data })
    } else {
      await createMut.mutateAsync(data)
    }
    setShowForm(false)
    setEditItem(null)
  }

  const handleDelete = async (id: string) => {
    setConfirmDelete(id)
  }

  const confirmDeleteAction = async () => {
    if (confirmDelete) {
      await deleteMut.mutateAsync(confirmDelete)
      setConfirmDelete(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input
            type="text"
            placeholder={t("warehousesTab.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-card text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
          />
        </div>
        <button
          onClick={() => { setEditItem(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={16} />
          <span>{t("warehousesTab.newWarehouse")}</span>
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/80 border-border overflow-hidden bg-card/50">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("warehousesTab.colCode")}</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("warehousesTab.name")}</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("warehousesTab.type")}</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("warehousesTab.branch")}</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t("warehousesTab.colManager")}</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">{t("warehousesTab.default")}</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">{t("warehousesTab.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">{t("warehousesTab.loading")}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">{t("warehousesTab.empty")}</td></tr>
              ) : (
                filtered.map((w) => (
                  <tr key={w.id} className="hover:/50 dark:hover:/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-blue-600 dark:text-blue-400">{w.code}</td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <MapPin size={14} className="text-muted-foreground shrink-0" />
                        {w.name}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-md text-sub font-medium bg-muted text-muted-foreground">
                        {t(`warehouseType.${w.warehouse_type}` as never)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {w.branch_names?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {w.branch_names.map((name) => (
                            <span key={name} className="inline-flex px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-2xs font-medium border border-blue-100 dark:border-blue-800">
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{w.manager_name ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      {w.is_default && <Star size={16} className="inline text-amber-400 fill-amber-400" />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setInventoryModal({ id: w.id, name: `${w.name} (${w.code})` })}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                          title={t("warehousesTab.tooltipHistory")}
                        >
                          <Package size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setLevelsModal({ id: w.id, name: `${w.name} (${w.code})` })}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                          title={t("warehousesTab.tooltipMin")}
                        >
                          <MapPin size={14} />
                        </button>
                        <button
                          onClick={() => { setEditItem(w); setShowForm(true) }}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                          title={t("warehousesTab.tooltipEdit")}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(w.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title={t("warehousesTab.tooltipDelete")}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <WarehouseFormModal
          open={showForm}
          key={editItem?.id ?? "new-warehouse"}
          warehouse={editItem}
          currentBranchId={branchId}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditItem(null) }}
          isLoading={createMut.isPending || updateMut.isPending}
        />

      <ConfirmActionDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        onConfirm={confirmDeleteAction}
        title={t("warehousesTab.deleteTitle")}
        description={t("warehousesTab.deleteConfirmDescription")}
        confirmText={t("warehousesTab.confirmDelete")}
        variant="destructive"
      />

      <WarehouseInventoryModal
          open={!!inventoryModal}
          warehouseId={inventoryModal?.id ?? ""}
          warehouseName={inventoryModal?.name ?? ""}
          onClose={() => setInventoryModal(null)}
        />

      <WarehouseStockLevelsModal
          open={!!levelsModal}
          warehouseId={levelsModal?.id ?? ""}
          warehouseName={levelsModal?.name ?? ""}
          onClose={() => setLevelsModal(null)}
        />
    </div>
  )
}
