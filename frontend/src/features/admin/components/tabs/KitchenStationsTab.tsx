"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Plus, Edit, Trash2, ChefHat, ExternalLink, AlertCircle, Loader2 } from "lucide-react"
import { adminApi, type KitchenStation, type KitchenStationForm } from "../../services/adminApi"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { cn } from "@/lib/utils"

const COLORS = [
  "#6366f1", "#f97316", "#22c55e", "#06b6d4", "#eab308",
  "#f43f5e", "#8b5cf6", "#d946ef", "#ef4444", "#3b82f6",
]

const EMPTY_FORM: KitchenStationForm = {
  branch: "", name: "", code: "", color: "#6366f1", description: "", is_active: true,
  warehouse: "",
}

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

interface Props {
  branches: { id: string; name: string }[]
  canManage: boolean
}

export function KitchenStationsTab({ branches, canManage }: Props) {
  const t = useTranslations("admin")
  const [stations, setStations] = useState<KitchenStation[]>([])
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; warehouse_type?: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterBranch, setFilterBranch] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<KitchenStation | null>(null)
  const [form, setForm] = useState<KitchenStationForm>(EMPTY_FORM)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleting, setDeleting] = useState<KitchenStation | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState("")

  const fetchStations = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await adminApi.getStations({ branch_id: filterBranch || undefined })
      setStations(data)
    } catch {
      setError(t('stations.errors.loadFailed'))
    } finally {
      setIsLoading(false)
    }
  }, [filterBranch, t])

  const fetchWarehouses = useCallback(async (branchId?: string) => {
    try {
      const data = await adminApi.getWarehouses(branchId)
      setWarehouses(data as { id: string; name: string; warehouse_type?: string }[])
    } catch {
      console.error(t('stations.errors.warehousesLoadFailed'))
    }
  }, [t])

  useEffect(() => {
    void fetchStations()
  }, [fetchStations])

  useEffect(() => {
    if (showForm) {
      void fetchWarehouses(form.branch)
    }
  }, [showForm, form.branch, fetchWarehouses])

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
    setForm(EMPTY_FORM)
    setError("")
  }

  const openCreate = () => {
    setError("")
    setForm({ ...EMPTY_FORM, branch: filterBranch || (branches[0]?.id ?? "") })
    setEditing(null)
    setShowForm(true)
  }

  const openEdit = (s: KitchenStation) => {
    setError("")
    setEditing(s)
    setForm({
      branch: s.branch, name: s.name, code: s.code,
      color: s.color, description: s.description, is_active: s.is_active,
      warehouse: s.warehouse || "",
    })
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!form.branch || !form.name || !form.code) {
      setError(t('stations.errors.requiredFields'))
      return
    }
    setIsSubmitting(true)
    setError("")
    try {
      if (editing) {
        await adminApi.updateStation(editing.id, form)
      } else {
        await adminApi.createStation(form)
      }
      setShowForm(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      setError("")
      void fetchStations()
    } catch {
      setError(t('stations.errors.saveFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = (s: KitchenStation) => {
    setDeleting(s)
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setIsDeleting(true)
    try {
      await adminApi.deleteStation(deleting.id)
      setDeleting(null)
      void fetchStations()
    } catch {
      toast.error(t('stations.errors.deleteFailed'))
    } finally {
      setIsDeleting(false)
    }
  }

  const filtered = filterBranch
    ? stations.filter(s => s.branch === filterBranch)
    : stations

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('stations.title')}</h2>
          <p className="text-sm text-muted-foreground mt-0.5 dark:text-muted-foreground">
            {t('stations.subtitle')}
          </p>
        </div>
        {canManage && (
          <button onClick={openCreate}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-all">
            <Plus size={15} /> {t('stations.addNew')}
          </button>
        )}
      </div>

      {/* Branch filter */}
      <div className="flex items-center gap-3">
        <select
          value={filterBranch}
          onChange={e => setFilterBranch(e.target.value)}
          className="px-3 py-1.5 text-sm border border-border rounded-md bg-card border-input text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
          <option value="">{t('stations.allBranches')}</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">{t('stations.count', { count: filtered.length })}</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-400">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden bg-card border-border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-border bg-muted border-border">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('tabs.stations')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('stations.branch')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('stations.warehouse')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('stations.code')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('stations.categories')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('common.status')}</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center">
                  <ChefHat size={32} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm text-muted-foreground">{t('stations.empty.title')}</p>
                  {canManage && (
                    <button onClick={openCreate} className="mt-3 text-xs font-medium text-indigo-600 hover:underline">
                      {t('stations.empty.action')}
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map(s => (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/50 border-border dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-lg flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="font-medium text-foreground">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{s.branch_name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground">
                      {s.warehouse_name || <span className="text-rose-400 italic">{t('stations.noWarehouse')}</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono text-slate-600 text-muted-foreground">{s.code}</code>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.categories_count} {t('stations.categories').toLowerCase()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${s.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-muted-foreground bg-muted"}`}>
                      {s.is_active ? t('common.active') : t('common.passive')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* KDS Link */}
                      <a
                        href={`/kds?station_id=${s.id}&station_name=${encodeURIComponent(s.name)}&station_color=${encodeURIComponent(s.color)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t('stations.openKds')}
                        className="p-1.5 rounded-md hover:bg-indigo-50 text-muted-foreground hover:text-indigo-600 transition dark:hover:bg-indigo-900/20"
                      >
                        <ExternalLink size={14} />
                      </a>
                      {canManage && (
                        <>
                          <button onClick={() => openEdit(s)} className="p-1.5 rounded-md hover:bg-slate-100 text-muted-foreground hover:text-blue-600 transition dark:hover:bg-slate-800" title={t('common.edit')}>
                            <Edit size={14} />
                          </button>
                          <button onClick={() => handleDelete(s)} className="p-1.5 rounded-md hover:bg-rose-50 text-muted-foreground hover:text-rose-600 transition dark:hover:bg-rose-900/20" title={t('common.delete')}>
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) closeForm() }}>
        <DialogContent layout="scroll" size="lg">
          <DialogHeader>
            <DialogTitle>{editing ? t('common.edit') : t('stations.addNew')}</DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <FormField label={`${t('stations.branch')} *`}>
              <select
                value={form.branch}
                onChange={e => setForm({ ...form, branch: e.target.value })}
                className={selectClass}
              >
                <option value="">{t('stations.selectBranch')}</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </FormField>

            <FormField label={t('stations.warehouse')}>
              <select
                value={form.warehouse}
                onChange={e => setForm({ ...form, warehouse: e.target.value })}
                className={selectClass}
              >
                <option value="">{t('stations.selectWarehouse')}</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name}{w.warehouse_type != null ? ` (${w.warehouse_type})` : ""}
                  </option>
                ))}
              </select>
              <p className="text-2xs text-muted-foreground">{t('stations.warehouseNote')}</p>
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label={`${t('stations.stationName')} *`}>
                <Input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder={t('stations.placeholderName')}
                />
              </FormField>
              <FormField label={`${t('stations.code')} *`}>
                <Input
                  value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
                  className="font-mono"
                  placeholder={t('stations.placeholderCode')}
                />
              </FormField>
            </div>

            <FormField label={t('stations.descriptionLabel')}>
              <Input
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder={t('stations.placeholderDesc')}
              />
            </FormField>

            <FormField label={t('stations.color')}>
              <div className="flex flex-wrap gap-2">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className={cn(
                      "h-7 w-7 shrink-0 rounded-full border-2 transition-all",
                      form.color === c
                        ? "scale-110 border-foreground shadow-sm"
                        : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={t("stations.colorAria", { code: c })}
                  />
                ))}
              </div>
            </FormField>

            <div className="flex items-center gap-2">
              <Checkbox
                id="station-form-active"
                checked={form.is_active}
                onCheckedChange={checked => setForm({ ...form, is_active: !!checked })}
              />
              <label htmlFor="station-form-active" className="cursor-pointer text-sm font-medium">
                {t('common.active')}
              </label>
            </div>

            {error && showForm && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeForm} disabled={isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting}>
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              {isSubmitting ? t('common.saving') : (editing ? t('common.update') : t('common.create'))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.name} {t('common.deleteConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 size={14} className="animate-spin mr-1.5" />}
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
