"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Plus, Edit, Trash2, Printer as PrinterIcon, Wifi, Usb, AlertCircle, Play, Loader2 } from "lucide-react"
import { adminApi, type Printer, type PrinterForm, type KitchenStation, type ReceiptTemplate } from "../../services/adminApi"
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

const EMPTY_FORM: PrinterForm = {
  branch: "",
  name: "",
  connection_type: "NETWORK",
  ip_address: "",
  port: 9100,
  device_path: "",
  printer_type: "GENERIC",
  usage_type: "POS",
  kitchen_station: null,
  receipt_template_slug: null,
  is_active: true,
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

export function PrintersTab({ branches, canManage }: Props) {
  const t = useTranslations("admin")
  const [printers, setPrinters] = useState<Printer[]>([])
  const [stations, setStations] = useState<KitchenStation[]>([])
  const [receiptTemplates, setReceiptTemplates] = useState<ReceiptTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterBranch, setFilterBranch] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Printer | null>(null)
  const [form, setForm] = useState<PrinterForm>(EMPTY_FORM)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [formError, setFormError] = useState("")
  const [deleting, setDeleting] = useState<Printer | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const PRINTER_MODELS = [
    { value: "EPSON", label: "Epson" },
    { value: "STAR", label: "Star" },
    { value: "BIXOLON", label: "Bixolon" },
    { value: "GENERIC", label: "Jenerik ESC/POS" },
  ]

  const fetchPrinters = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await adminApi.getPrinters(filterBranch ? { branch_id: filterBranch } : {})
      setPrinters("results" in data ? (data.results as Printer[]) : (data as unknown as Printer[]))
    } catch {
      setError(t('printers.errors.loadFailed'))
    } finally {
      setIsLoading(false)
    }
  }, [filterBranch, t])

  useEffect(() => {
    void fetchPrinters()
  }, [fetchPrinters])

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError("")
  }

  const openCreate = () => {
    const initialForm = {
      ...EMPTY_FORM,
      branch: filterBranch || (branches[0]?.id ?? ""),
    }
    setForm(initialForm)
    setEditing(null)
    setFormError("")
    setShowForm(true)
    void loadKitchenFormOptions(initialForm.branch)
  }

  const loadKitchenFormOptions = useCallback(async (branchId: string) => {
    if (!branchId) {
      setStations([])
      setReceiptTemplates([])
      return
    }
    try {
      const [stationsData, templatesData] = await Promise.all([
        adminApi.getStations({ branch_id: branchId }),
        adminApi.getReceiptTemplates({ category: "KITCHEN_TICKET" }),
      ])
      setStations(stationsData)
      setReceiptTemplates(Array.isArray(templatesData) ? templatesData : (templatesData as { results?: ReceiptTemplate[] }).results ?? [])
    } catch {
      setStations([])
      setReceiptTemplates([])
    }
  }, [])

  const openEdit = (p: Printer) => {
    setEditing(p)
    setForm({
      branch: p.branch,
      name: p.name,
      connection_type: p.connection_type,
      ip_address: p.ip_address || "",
      port: p.port,
      device_path: p.device_path || "",
      printer_type: p.printer_type,
      usage_type: p.usage_type,
      kitchen_station: p.kitchen_station,
      receipt_template_slug: p.receipt_template_slug,
      is_active: p.is_active,
    })
    setFormError("")
    setShowForm(true)
    void loadKitchenFormOptions(p.branch)
  }

  const handleSubmit = async () => {
    if (!form.branch || !form.name) {
      setFormError(t('printers.errors.requiredFields'))
      return
    }

    // Bağlantı tipine göre veri temizliği
    const submissionData = { ...form }
    if (form.connection_type === "USB") {
      submissionData.ip_address = undefined
      submissionData.port = 9100
      if (!form.device_path) {
        setFormError(t('printers.errors.requiredUsbPath'))
        return
      }
    } else {
      submissionData.device_path = undefined
      if (!form.ip_address) {
        setFormError(t('printers.errors.requiredIp'))
        return
      }
    }

    if (form.usage_type === "KITCHEN") {
      if (!form.kitchen_station) {
        setFormError(t('printers.errors.requiredStation'))
        return
      }
      if (!form.receipt_template_slug) {
        setFormError(t('printers.errors.requiredTemplate'))
        return
      }
    } else {
      submissionData.kitchen_station = null
      submissionData.receipt_template_slug = null
    }

    setIsSubmitting(true)
    setFormError("")
    try {
      if (editing) {
        await adminApi.updatePrinter(editing.id, submissionData)
        toast.success(t('printers.messages.updateSuccess'))
      } else {
        await adminApi.createPrinter(submissionData as PrinterForm)
        toast.success(t('printers.messages.createSuccess'))
      }
      setShowForm(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      void fetchPrinters()
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorVal = err as any
      const msg = errorVal.response?.data?.detail || errorVal.response?.data?.ip_address?.[0] || t('printers.errors.saveFailed')
      setFormError(msg === "This field may not be blank." ? t('printers.errors.ipNotEmpty') : msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = (p: Printer) => {
    setDeleting(p)
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setIsDeleting(true)
    try {
      await adminApi.deletePrinter(deleting.id)
      toast.success(t('printers.messages.deleteSuccess'))
      setDeleting(null)
      void fetchPrinters()
    } catch {
      toast.error(t('printers.errors.deleteFailed'))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleTestPrint = async (p: Printer) => {
    const toastId = "test-print"
    try {
      toast.loading(t('printers.messages.testSending'), { id: toastId })
      await adminApi.testPrint(p.id)
      toast.success(t('printers.messages.testSuccess'), { id: toastId })
    } catch {
      toast.error(t('printers.messages.testFailed'), { id: toastId })
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('printers.title')}</h2>
          <p className="text-sm text-muted-foreground mt-0.5 dark:text-muted-foreground">
            {t('printers.description')}
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}
            className="gap-2">
            <Plus size={15} /> {t('printers.addNew')}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={filterBranch}
          onChange={e => setFilterBranch(e.target.value)}
          className="px-3 py-1.5 text-sm border border-border rounded-md bg-card border-input text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
          <option value="">{t('stations.allBranches')}</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-400">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden bg-card border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted border-border">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground tracking-widerdark:text-muted-foreground">{t('printers.printer')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground tracking-widerdark:text-muted-foreground">{t('printers.usage')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground tracking-widerdark:text-muted-foreground">{t('printers.station')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground tracking-widerdark:text-muted-foreground">{t('printers.connection')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground tracking-widerdark:text-muted-foreground">{t('printers.address')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground tracking-widerdark:text-muted-foreground">{t('printers.model')}</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground tracking-widerdark:text-muted-foreground">{t('common.status')}</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground tracking-widerdark:text-muted-foreground">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</td></tr>
            ) : printers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center">
                  <PrinterIcon size={32} className="mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{t('printers.empty')}</p>
                </td>
              </tr>
            ) : (
              printers.map(p => (
                <tr key={p.id} className="border-b hover:/50 border-border dark:hover:/50">
                  <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-2xs px-1.5 py-0.5 rounded font-bold uppercase ${p.usage_type === "KITCHEN" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                      {p.usage_type_display}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {p.usage_type === "KITCHEN"
                      ? (p.kitchen_station_name || t('printers.noStation'))
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      {p.connection_type === "NETWORK" ? <Wifi size={14} className="text-blue-500" /> : <Usb size={14} className="text-amber-500" />}
                      <span className="text-xs">{p.connection_type_display}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                    {p.connection_type === "NETWORK" ? `${p.ip_address}:${p.port}` : p.device_path}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{p.printer_type_display}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${p.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : " text-muted-foreground bg-muted"}`}>
                      {p.is_active ? t('common.active') : t('common.passive')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleTestPrint(p)} className="p-1.5 rounded-md hover:bg-blue-50 text-muted-foreground hover:text-blue-600 transition dark:hover:bg-blue-900/20" title={t('printers.testPrint')}>
                        <Play size={14} />
                      </button>
                      {canManage && (
                        <>
                          <button onClick={() => openEdit(p)} className="p-1.5 rounded-md hover: text-muted-foreground hover:text-indigo-600 transition dark:hover:" title={t('common.edit')}>
                            <Edit size={14} />
                          </button>
                          <button onClick={() => handleDelete(p)} className="p-1.5 rounded-md hover:bg-rose-50 text-muted-foreground hover:text-rose-600 transition dark:hover:bg-rose-900/20" title={t('common.delete')}>
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
            <DialogTitle>{editing ? t('common.edit') : t('printers.addNew')}</DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <FormField label={`${t('stations.branch')} *`}>
              <select
                value={form.branch}
                onChange={e => {
                  const branchId = e.target.value
                  setForm({
                    ...form,
                    branch: branchId,
                    kitchen_station: null,
                    receipt_template_slug: null,
                  })
                  void loadKitchenFormOptions(branchId)
                }}
                className={selectClass}
              >
                <option value="">{t('stations.selectBranch')}</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </FormField>

            <FormField label={`${t('printers.fields.name')} *`}>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder={t('printers.fields.name')}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label={`${t('printers.connection')} *`}>
                <select
                  value={form.connection_type}
                  onChange={e => setForm({ ...form, connection_type: e.target.value as "NETWORK" | "USB" })}
                  className={selectClass}
                >
                  <option value="NETWORK">{t('printers.connectionTypes.network')}</option>
                  <option value="USB">{t('printers.connectionTypes.usb')}</option>
                </select>
              </FormField>
              <FormField label={`${t('printers.fields.printerType')} *`}>
                <select
                  value={form.printer_type}
                  onChange={e => setForm({ ...form, printer_type: e.target.value })}
                  className={selectClass}
                >
                  {PRINTER_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </FormField>
            </div>

            <FormField label={`${t('printers.usage')} *`}>
              <div className="flex items-center gap-4 rounded-md bg-muted/50 p-2">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="usage_type"
                    checked={form.usage_type === "POS"}
                    onChange={() => setForm({
                      ...form,
                      usage_type: "POS",
                      kitchen_station: null,
                      receipt_template_slug: null,
                    })}
                    className="text-primary focus:ring-ring"
                  />
                  <span className="text-sm font-medium">{t('printers.usageTypes.pos')}</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="usage_type"
                    checked={form.usage_type === "KITCHEN"}
                    onChange={() => setForm({ ...form, usage_type: "KITCHEN" })}
                    className="text-primary focus:ring-ring"
                  />
                  <span className="text-sm font-medium">{t('printers.usageTypes.kitchen')}</span>
                </label>
              </div>
            </FormField>

            {form.usage_type === "KITCHEN" && (
              <div className="grid grid-cols-1 gap-3">
                <FormField label={`${t('printers.fields.kitchenStation')} *`}>
                  <select
                    value={form.kitchen_station ?? ""}
                    onChange={e => setForm({ ...form, kitchen_station: e.target.value || null })}
                    className={selectClass}
                    disabled={!form.branch}
                  >
                    <option value="">{t('printers.selectStation')}</option>
                    {stations.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label={`${t('printers.fields.receiptTemplate')} *`}>
                  <select
                    value={form.receipt_template_slug ?? ""}
                    onChange={e => setForm({ ...form, receipt_template_slug: e.target.value || null })}
                    className={selectClass}
                  >
                    <option value="">{t('printers.selectTemplate')}</option>
                    {receiptTemplates.map(temp => (
                      <option key={temp.slug} value={temp.slug}>{temp.name}</option>
                    ))}
                  </select>
                </FormField>
              </div>
            )}

            {form.connection_type === "NETWORK" ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <FormField label={`${t('printers.fields.ipAddress')} *`}>
                    <Input
                      value={form.ip_address}
                      onChange={e => setForm({ ...form, ip_address: e.target.value })}
                      className="font-mono"
                      placeholder="192.168.1.100"
                    />
                  </FormField>
                </div>
                <FormField label={t('printers.fields.port')}>
                  <Input
                    type="number"
                    value={form.port}
                    onChange={e => setForm({ ...form, port: parseInt(e.target.value) || 9100 })}
                    className="font-mono"
                    placeholder="9100"
                  />
                </FormField>
              </div>
            ) : (
              <FormField label={`${t('printers.fields.devicePath')} *`}>
                <Input
                  value={form.device_path}
                  onChange={e => setForm({ ...form, device_path: e.target.value })}
                  className="font-mono"
                  placeholder="/dev/usb/lp0"
                />
              </FormField>
            )}

            <div className="flex items-center gap-2">
              <Checkbox
                id="is_active"
                checked={form.is_active}
                onCheckedChange={(val) => setForm({ ...form, is_active: !!val })}
              />
              <label htmlFor="is_active" className="cursor-pointer text-sm font-medium">
                {t('common.active')}
              </label>
            </div>

            {formError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertCircle size={14} /> {formError}
              </div>
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
            <AlertDialogTitle>{t('printers.modals.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('printers.modals.deleteDesc', { name: deleting?.name ?? "" })}
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
