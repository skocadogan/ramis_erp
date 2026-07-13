"use client"

import { useCallback, useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import api, { skipInterceptorToast } from "@/lib/api"
import { toastApiError } from "@/lib/operationalToast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
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
import { Loader2 } from "lucide-react"
import type { Branch } from "@/types/user.types"
import {
  type PosTerminal,
  readFiscalSettingNumber,
  readFiscalSettingString,
} from "./types"
import { broadcastPosTerminalsUpdatedSignal } from "@/features/pos/constants/posTerminalsQuery"
import { FiscalSettingsPanel, FiscalTypeSelect } from "./FiscalSettingsForm"
import { cn } from "@/lib/utils"

const selectClass =
  "mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"

interface PosTerminalsPanelProps {
  branchId: string
  branchList: Branch[]
  setBranchOverride: (id: string) => void
  canManage: boolean
  onUpdated?: () => void
}

export function PosTerminalsPanel({ branchId, branchList, setBranchOverride, canManage, onUpdated }: PosTerminalsPanelProps) {
  const queryClient = useQueryClient()
  const t = useTranslations("pos")

  const invalidateTerminalQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["pos-terminals"] })
    broadcastPosTerminalsUpdatedSignal()
  }, [queryClient])
  const [terminals, setTerminals] = useState<PosTerminal[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PosTerminal | null>(null)
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [sortOrder, setSortOrder] = useState(0)
  const [modalBranchId, setModalBranchId] = useState("")
  const [fiscalType, setFiscalType] = useState("NONE")
  
  // MOCK Ayar State'leri
  const [mockDelay, setMockDelay] = useState(1)
  const [mockTriggerError, setMockTriggerError] = useState(false)
  const [mockSimulateOffline, setMockSimulateOffline] = useState(false)

  // ÖKC Genel Ayar State'leri
  const [connectionType, setConnectionType] = useState("IP")
  const [ipAddress, setIpAddress] = useState("")
  const [port, setPort] = useState("")
  const [serialPort, setSerialPort] = useState("")
  const [baudRate, setBaudRate] = useState("115200")
  const [apiKey, setApiKey] = useState("")
  const [serialNumber, setSerialNumber] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [apiUrl, setApiUrl] = useState("")
  const [authUrl, setAuthUrl] = useState("")

  // e-Arşiv Ayar State'leri
  const [integratorUser, setIntegratorUser] = useState("")
  const [integratorPassword, setIntegratorPassword] = useState("")
  const [integratorEndpoint, setIntegratorEndpoint] = useState("")

  const [saving, setSaving] = useState(false)
  const [deletingTerm, setDeletingTerm] = useState<PosTerminal | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const load = useCallback(async (listBranchId?: string) => {
    const bid = listBranchId ?? branchId
    if (!bid) return
    setLoading(true)
    try {
      const { data } = await api.get<PosTerminal[] | { results: PosTerminal[] }>("/pos-display/terminals/", {
        params: { branch_id: bid },
      })
      const list = Array.isArray(data) ? data : data.results ?? []
      setTerminals(list)
    } catch {
      toast.error(t('admin_settings.terminals.loadError'))
    } finally {
      setLoading(false)
    }
  }, [branchId, t])

  useEffect(() => {
    void load()
  }, [load])

  const openNew = () => {
    setEditing(null)
    setName("")
    setCode("")
    setSortOrder(terminals.length)
    setModalBranchId(branchId)
    setFiscalType("NONE")
    
    // MOCK defaults
    setMockDelay(1)
    setMockTriggerError(false)
    setMockSimulateOffline(false)
    
    // OKC defaults
    setConnectionType("IP")
    setIpAddress("")
    setPort("")
    setSerialPort("")
    setBaudRate("115200")
    setApiKey("")
    setSerialNumber("")
    setClientSecret("")
    setApiUrl("")
    setAuthUrl("")
    
    // e-Arşiv defaults
    setIntegratorUser("")
    setIntegratorPassword("")
    setIntegratorEndpoint("")
    
    setModalOpen(true)
  }

  const openEdit = (term: PosTerminal) => {
    setEditing(term)
    setName(term.name)
    setCode(term.code)
    setSortOrder(term.sort_order)
    setModalBranchId(term.branch)
    setFiscalType(term.fiscal_type || "NONE")
    
    const settings = term.fiscal_settings ?? {}
    
    // MOCK
    setMockDelay(readFiscalSettingNumber(settings, "simulated_delay", 1))
    setMockTriggerError(!!settings.trigger_error)
    setMockSimulateOffline(!!settings.simulate_offline)
    
    // OKC
    setConnectionType(readFiscalSettingString(settings, "connection_type", "IP"))
    setIpAddress(readFiscalSettingString(settings, "ip_address"))
    setPort(readFiscalSettingString(settings, "port"))
    setSerialPort(readFiscalSettingString(settings, "serial_port"))
    setBaudRate(readFiscalSettingString(settings, "baud_rate", "115200"))
    setApiKey(
      readFiscalSettingString(settings, "api_key") ||
        readFiscalSettingString(settings, "client_id"),
    )
    setSerialNumber(readFiscalSettingString(settings, "serial_number"))
    setClientSecret(readFiscalSettingString(settings, "client_secret"))
    setApiUrl(readFiscalSettingString(settings, "api_url"))
    setAuthUrl(readFiscalSettingString(settings, "auth_url"))
    
    // e-Arşiv
    setIntegratorUser(readFiscalSettingString(settings, "integrator_user"))
    setIntegratorPassword(readFiscalSettingString(settings, "integrator_password"))
    setIntegratorEndpoint(readFiscalSettingString(settings, "integrator_endpoint"))
    
    setModalOpen(true)
  }

  const save = async () => {
    const targetBranch = modalBranchId || branchId
    if (!targetBranch || !name.trim() || !code.trim()) {
      toast.error(t('admin_settings.terminals.validationError'))
      return
    }

    // Seçilen tipe göre JSON ayar nesnesini otomatik oluşturuyoruz
    let parsedSettings: Record<string, string | number | boolean> = {}
    if (fiscalType === "MOCK") {
      parsedSettings = {
        simulated_delay: Number(mockDelay),
        trigger_error: mockTriggerError,
        simulate_offline: mockSimulateOffline,
      }
    } else if (fiscalType === "BEKO_GMP3" || fiscalType === "HUGIN_GMP3") {
      if (connectionType === "CLOUD") {
        parsedSettings = {
          connection_type: connectionType,
          serial_number: serialNumber.trim(),
          client_id: apiKey.trim(),
          client_secret: clientSecret.trim(),
          api_url: apiUrl.trim(),
          auth_url: authUrl.trim(),
        }
      } else {
        parsedSettings = {
          connection_type: connectionType,
          serial_number: serialNumber.trim(),
          api_key: apiKey.trim(),
          ...(connectionType === "IP" ? {
            ip_address: ipAddress.trim(),
            port: port.trim(),
          } : {
            serial_port: serialPort.trim(),
            baud_rate: baudRate.trim(),
          })
        }
      }
    } else if (fiscalType === "EARSIV_UYUMSOFT") {
      parsedSettings = {
        integrator_user: integratorUser.trim(),
        integrator_password: integratorPassword.trim(),
        integrator_endpoint: integratorEndpoint.trim(),
      }
    }

    setSaving(true)
    try {
      if (editing) {
        const { data } = await api.patch<PosTerminal>(`/pos-display/terminals/${editing.id}/`, {
          branch: targetBranch,
          name: name.trim(),
          code: code.trim(),
          sort_order: sortOrder,
          fiscal_type: fiscalType,
          fiscal_settings: parsedSettings,
        }, { ...skipInterceptorToast })
        if (data.branch !== branchId) {
          setTerminals(prev => prev.filter(x => x.id !== editing.id))
          setBranchOverride(data.branch)
          void load(data.branch)
        } else {
          setTerminals(prev => prev.map(x => (x.id === editing.id ? data : x)))
        }
        toast.success(t('admin_settings.terminals.updateSuccess'))
        invalidateTerminalQueries()
        onUpdated?.()
      } else {
        const { data } = await api.post<PosTerminal>("/pos-display/terminals/", {
          branch: targetBranch,
          name: name.trim(),
          code: code.trim(),
          sort_order: sortOrder,
          fiscal_type: fiscalType,
          fiscal_settings: parsedSettings,
          is_active: true,
        }, { ...skipInterceptorToast })
        setBranchOverride(data.branch)
        toast.success(t('admin_settings.terminals.createSuccess'))
        void load(data.branch)
        invalidateTerminalQueries()
        onUpdated?.()
      }
      setModalOpen(false)
    } catch (e) {
      toastApiError(e, t('admin_settings.terminals.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (term: PosTerminal) => {
    if (!canManage) return
    try {
      const { data } = await api.patch<PosTerminal>(
        `/pos-display/terminals/${term.id}/`,
        { is_active: !term.is_active },
        { ...skipInterceptorToast },
      )
      setTerminals(prev => prev.map(x => (x.id === term.id ? data : x)))
      toast.success(data.is_active ? t('admin_settings.terminals.activated') : t('admin_settings.terminals.deactivated'))
      invalidateTerminalQueries()
      onUpdated?.()
    } catch (e) {
      toastApiError(e, t('admin_settings.terminals.updateError'))
    }
  }

  const remove = (term: PosTerminal) => {
    setDeletingTerm(term)
  }

  const confirmRemove = async () => {
    if (!canManage || !deletingTerm) return
    setIsDeleting(true)
    try {
      await api.delete(`/pos-display/terminals/${deletingTerm.id}/`, { ...skipInterceptorToast })
      setTerminals(prev => prev.filter(x => x.id !== deletingTerm.id))
      toast.success(t('admin_settings.terminals.deleteSuccess'))
      invalidateTerminalQueries()
      onUpdated?.()
      setDeletingTerm(null)
    } catch (e) {
      toastApiError(e, t('admin_settings.terminals.deleteError'))
    } finally {
      setIsDeleting(false)
    }
  }

  if (!branchId) {
    return null
  }

  return (
    <Card className="p-0 gap-0 border-border bg-card border-border overflow-hidden">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 p-4 border-b border-border bg-muted/40 border-border shrink-0">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            {t('admin_settings.terminals.title')}
          </CardTitle>
          <CardDescription className="text-xs">
            {t('admin_settings.terminals.description')}
          </CardDescription>
        </div>
        {canManage && (
          <Button type="button" onClick={openNew} size="sm" className="bg-blue-600 hover:bg-blue-700 h-8">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> {t('admin_settings.terminals.addNew')}
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-4">
        <div className="rounded-xl border border-border overflow-x-auto">
          <Table>
            <TableHeader className="/50 bg-card/50">
              <TableRow>
                <TableHead>{t('admin_settings.terminals.tableCode')}</TableHead>
                <TableHead>{t('admin_settings.terminals.tableName')}</TableHead>
                <TableHead className="text-center">{t('admin_settings.terminals.tableOrder')}</TableHead>
                <TableHead className="text-center">{t('admin_settings.terminals.tableActive')}</TableHead>
                {canManage && <TableHead className="text-right">{t('admin_settings.terminals.tableAction')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    {t('admin_settings.terminals.loading')}
                  </TableCell>
                </TableRow>
              ) : terminals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground italic">
                    {t('admin_settings.terminals.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                terminals.map(term => (
                  <TableRow key={term.id}>
                    <TableCell className="font-mono text-sm">{term.code}</TableCell>
                    <TableCell className="font-medium">{term.name}</TableCell>
                    <TableCell className="text-center">{term.sort_order}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={term.is_active}
                        onCheckedChange={() => void toggleActive(term)}
                        disabled={!canManage}
                        aria-label={t("admin_settings.terminals.switchActiveAria", { name: term.name })}
                      />
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right space-x-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(term)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="text-rose-600" onClick={() => void remove(term)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent layout="scroll" size={fiscalType !== "NONE" ? "3xl" : "md"}>
          <DialogHeader>
            <DialogTitle>{editing ? t('admin_settings.terminals.editTitle') : t('admin_settings.terminals.addNew')}</DialogTitle>
          </DialogHeader>
          <DialogBody>
          <div
            className={cn(
              fiscalType !== "NONE" ? "grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:items-start" : "space-y-3"
            )}
          >
            <div className="space-y-3">
              <div>
                <Label>{t('admin_settings.terminals.branchLabel')}</Label>
                <select
                  value={modalBranchId}
                  onChange={e => setModalBranchId(e.target.value)}
                  disabled={!branchList.length}
                  className={selectClass}
                >
                  {branchList.length === 0 ? (
                    <option value="">{t('admin_settings.terminals.noBranches')}</option>
                  ) : (
                    branchList.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))
                  )}
                </select>
                <p className="text-2xs text-muted-foreground mt-1">{t('admin_settings.terminals.branchHint')}</p>
              </div>
              <div>
                <Label>{t('admin_settings.terminals.nameLabel')}</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('admin_settings.terminals.namePlaceholder')} className="mt-1" />
              </div>
              <div>
                <Label>{t('admin_settings.terminals.codeLabel')}</Label>
                <Input
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\s/g, ""))}
                  placeholder={t('admin_settings.terminals.codePlaceholder')}
                  disabled={Boolean(editing)}
                  className="mt-1 font-mono"
                />
                <p className="text-2xs text-muted-foreground mt-1">{t('admin_settings.terminals.codeHint')}</p>
              </div>
              <div>
                <Label>{t('admin_settings.terminals.orderLabel')}</Label>
                <Input type="number" value={sortOrder} onChange={e => setSortOrder(parseInt(e.target.value, 10) || 0)} className="mt-1" />
              </div>
              <FiscalTypeSelect fiscalType={fiscalType} setFiscalType={setFiscalType} />
            </div>
            {fiscalType !== "NONE" && (
              <div className="max-h-[min(70vh,560px)] overflow-y-auto sm:border-l sm:border-border sm:pl-6">
                <FiscalSettingsPanel
                  fiscalWebhookUrl={editing?.fiscal_webhook_url ?? null}
                  fiscalType={fiscalType}
                  mockDelay={mockDelay}
                  setMockDelay={setMockDelay}
                  mockTriggerError={mockTriggerError}
                  setMockTriggerError={setMockTriggerError}
                  mockSimulateOffline={mockSimulateOffline}
                  setMockSimulateOffline={setMockSimulateOffline}
                  connectionType={connectionType}
                  setConnectionType={setConnectionType}
                  ipAddress={ipAddress}
                  setIpAddress={setIpAddress}
                  port={port}
                  setPort={setPort}
                  serialPort={serialPort}
                  setSerialPort={setSerialPort}
                  baudRate={baudRate}
                  setBaudRate={setBaudRate}
                  apiKey={apiKey}
                  setApiKey={setApiKey}
                  serialNumber={serialNumber}
                  setSerialNumber={setSerialNumber}
                  clientSecret={clientSecret}
                  setClientSecret={setClientSecret}
                  apiUrl={apiUrl}
                  setApiUrl={setApiUrl}
                  authUrl={authUrl}
                  setAuthUrl={setAuthUrl}
                  integratorUser={integratorUser}
                  setIntegratorUser={setIntegratorUser}
                  integratorPassword={integratorPassword}
                  setIntegratorPassword={setIntegratorPassword}
                  integratorEndpoint={integratorEndpoint}
                  setIntegratorEndpoint={setIntegratorEndpoint}
                />
              </div>
            )}
          </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              {t('admin_settings.terminals.cancel')}
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? t('admin_settings.terminals.saving') : t('admin_settings.terminals.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingTerm} onOpenChange={(open) => !open && setDeletingTerm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin_settings.terminals.deleteTitle') || t('common.confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin_settings.terminals.deleteConfirm', { name: deletingTerm?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmRemove()
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
    </Card>
  )
}
