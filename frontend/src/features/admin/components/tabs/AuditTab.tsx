"use client"

import { useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { format } from "date-fns"
import { tr, enUS } from "date-fns/locale"
import {
  ShieldAlert,
  Search,
  Download,
  Eye,
  FileJson,
  User,
  MapPin,
  Clock,
  Activity,
  ArrowRight,
  Building2,
  ListFilter,
  Calendar,
  Loader2,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AsyncStatePanel } from "@/components/ui/async-state"
import { VirtualTable, virtualTableStickyHeadClass } from "@/components/ui/virtual-table"
import { adminApi } from "@/features/admin/services/adminApi"
import { toastApiError, toastApiSuccess } from "@/lib/operationalToast"
import type { Branch } from "@/types/user.types"

type AuditJsonSnapshot = Record<string, unknown> | null

export interface AuditLog {
  id: string
  created_at: string
  actor_details: {
    first_name: string
    last_name: string
    username: string
  } | null
  actor_ip: string | null
  user_agent: string | null
  branch_details: Branch | null
  action: string
  target_type: string
  target_id: string
  before_json: AuditJsonSnapshot
  after_json: AuditJsonSnapshot
  metadata: AuditJsonSnapshot
}

function auditMetadataText(metadata: AuditJsonSnapshot, key: string): string {
  if (!metadata) return ""
  const value = metadata[key]
  return typeof value === "string" ? value : ""
}

interface AuditTabProps {
  auditLogs: AuditLog[]
  isLoading?: boolean
  isError?: boolean
  onRetry?: () => void
  canExport?: boolean
  branches: { id: string; name: string }[]
  selectedBranchId: string
  onBranchChange: (branchId: string) => void
  actions: string[]
  selectedAction: string
  onActionChange: (action: string) => void
  startDate: string
  endDate: string
  onStartDateChange: (date: string) => void
  onEndDateChange: (date: string) => void
  fetchNextPage: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
}

const AUDIT_ROW_ESTIMATE_PX = 64

export function AuditTab({
  auditLogs,
  isLoading = false,
  isError = false,
  onRetry,
  canExport = false,
  branches,
  selectedBranchId,
  onBranchChange,
  actions,
  selectedAction,
  onActionChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: AuditTabProps) {
  const t = useTranslations("admin")
  const locale = useLocale()
  const dateLocale = locale === "tr" ? tr : enUS

  const [searchTerm, setSearchTerm] = useState("")
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const filteredLogs = auditLogs.filter(log => {
    if (!searchTerm.trim()) return true
    const searchStr = `${log.action} ${log.target_type} ${log.actor_details?.username || ""} ${auditMetadataText(log.metadata, "reason_text")}`.toLowerCase()
    return searchStr.includes(searchTerm.toLowerCase())
  })

  const getActionColor = (action: string) => {
    if (action.includes('cancelled')) return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200'
    if (action.includes('discount')) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200'
    if (action.includes('receive')) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200'
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200'
  }

  const getActionLabel = (action: string) => {
    const key = `audit.actions.${action}` as const
    try {
      const label = t(key)
      if (label !== key && !label.startsWith("audit.actions.")) {
        return label
      }
    } catch {
      /* missing translation */
    }
    return action
  }

  const exportToCSV = async () => {
    if (!canExport || isExporting) return
    setIsExporting(true)
    try {
      const trimmed = searchTerm.trim()
      const blob = await adminApi.exportAuditLogsCsv(
        trimmed ? { search: trimmed } : undefined,
      )
      const url = window.URL.createObjectURL(new Blob([blob], { type: "text/csv;charset=utf-8" }))
      const link = document.createElement("a")
      link.href = url
      link.download = `audit_logs_${format(new Date(), "yyyy-MM-dd")}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      toastApiSuccess(t("audit.exportSuccess"))
    } catch (err) {
      toastApiError(err, t("audit.exportFailed"))
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold dark:text-white flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-blue-600" />
            {t('audit.title')}
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            {t('audit.description')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {branches.length > 1 && (
            <Select value={selectedBranchId || "all"} onValueChange={(val) => onBranchChange(!val || val === "all" ? "" : val)}>
              <SelectTrigger className="w-[200px] border-border text-sm h-9 bg-card border-border text-foreground">
                <Building2 className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <SelectValue placeholder={t('audit.allBranches')}>
                  {selectedBranchId
                    ? branches.find(b => b.id === selectedBranchId)?.name
                    : t('audit.allBranches')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-sm font-semibold text-muted-foreground">
                  {t('audit.allBranches')}
                </SelectItem>
                {branches.map(b => (
                  <SelectItem key={b.id} value={b.id} className="text-sm">
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={selectedAction || "all"} onValueChange={(val) => onActionChange(!val || val === "all" ? "" : val)}>
            <SelectTrigger className="w-[200px] border-border text-sm h-9 bg-card border-border text-foreground">
              <ListFilter className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <SelectValue placeholder={t('audit.allActions')}>
                {selectedAction
                  ? getActionLabel(selectedAction)
                  : t('audit.allActions')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-sm font-semibold text-muted-foreground">
                {t('audit.allActions')}
              </SelectItem>
              {actions.map(a => (
                <SelectItem key={a} value={a} className="text-sm">
                  {getActionLabel(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canExport ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportToCSV()}
              loading={isExporting}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              {isExporting ? t("audit.exporting") : t("audit.export")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 overflow-hidden border-border bg-white/95 bg-card/95 flex flex-col min-h-[420px] max-h-[calc(100vh-10rem)]">
          <div className="p-4 border-b border-border flex flex-col sm:flex-row items-start sm:items-center gap-3 border-border">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('audit.searchPlaceholder')}
                className="pl-9 bg-card border-border border-border"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                className="w-[140px] bg-card border-border border-border text-sm h-9"
                placeholder={t('audit.startDate')}
              />
              <span className="text-muted-foreground text-sm">—</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                className="w-[140px] bg-card border-border border-border text-sm h-9"
                placeholder={t('audit.endDate')}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : isError ? (
            <div className="flex-1">
              <AsyncStatePanel variant="error" onRetry={onRetry} className="border-0 bg-transparent py-12" />
            </div>
          ) : (
            <div className="flex-1 min-h-0">
              <VirtualTable
                rows={filteredLogs}
                rowHeight={AUDIT_ROW_ESTIMATE_PX}
                overscan={5}
                fetchMore={fetchNextPage}
                hasMore={searchTerm.trim() ? false : hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                className="h-full"
                tableClassName="border-collapse"
                header={
                  <thead className={virtualTableStickyHeadClass}>
                    <tr className="text-sub font-semibold text-muted-foreground uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">{t('audit.table.dateActor')}</th>
                      <th className="px-4 py-3 text-left">{t('audit.table.action')}</th>
                      <th className="px-4 py-3 text-left">{t('audit.table.target')}</th>
                      <th className="px-4 py-3 text-right">{t('audit.table.detail')}</th>
                    </tr>
                  </thead>
                }
                emptyState={
                  <div className="p-12 text-center">
                    <ShieldAlert className="h-12 w-12 mx-auto mb-3" />
                    <p className="text-muted-foreground">{t('common.noMatch')}</p>
                  </div>
                }
                loadingMore={
                  <tr>
                    <td colSpan={4} className="text-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-600 mx-auto" />
                    </td>
                  </tr>
                }
                renderRow={(log) => {
                  const reasonText = auditMetadataText(log.metadata, "reason_text")
                  return (
                    <>
                      <td
                        className="px-4 py-3 cursor-pointer"
                        onClick={() => setSelectedLog(log)}
                      >
                        <div className="flex flex-col">
                          <span className="text-sub font-medium text-foreground">
                            {format(new Date(log.created_at), "d MMM, HH:mm", { locale: dateLocale })}
                          </span>
                          <div className="flex items-center gap-1 text-sub text-muted-foreground">
                            <User className="h-3 w-3" />
                            {log.actor_details ? `${log.actor_details.first_name} ${log.actor_details.last_name}` : t('audit.system')}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => setSelectedLog(log)}>
                        <Badge variant="outline" className={`text-sub px-1.5 py-0 font-medium border ${getActionColor(log.action)}`}>
                          {getActionLabel(log.action)}
                        </Badge>
                        {reasonText ? (
                          <p className="text-sub text-muted-foreground mt-0.5 truncate max-w-[120px]">
                            {reasonText}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => setSelectedLog(log)}>
                        <div className="flex flex-col">
                          <span className="text-sub font-mono text-muted-foreground">
                            {log.target_type}
                          </span>
                          <span className="text-2xs text-muted-foreground">
                            ID: ...{log.target_id.slice(-8)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right cursor-pointer" onClick={() => setSelectedLog(log)}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Eye className="h-4 w-4 text-blue-600" />
                        </Button>
                      </td>
                    </>
                  )
                }}
              />
            </div>
          )}
        </Card>

        <div className="space-y-6">
          {selectedLog ? (
            <Card className="border-border bg-card overflow-hidden sticky top-6 border-border">
              <div className="p-4 border-b border-border /50 bg-muted/50 flex items-center justify-between border-border">
                <h3 className="font-semibold dark:text-white flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-600" />
                  {t('audit.details.title')}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setSelectedLog(null)} className="h-8 text-muted-foreground">{t('common.cancel')}</Button>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sub text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {t('audit.details.date')}
                    </p>
                    <p className="text-ui-sm text-foreground text-foreground">
                      {format(new Date(selectedLog.created_at), "d MMMM yyyy, HH:mm:ss", { locale: dateLocale })}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sub text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {t('audit.details.branch')}
                    </p>
                    <p className="text-ui-sm text-foreground text-foreground">
                      {selectedLog.branch_details?.name || t('audit.details.global')}
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <p className="text-sub text-muted-foreground mb-2 uppercase font-bold tracking-tight">{t('audit.details.context')}</p>
                  <div className="space-y-2 text-ui-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('audit.details.ip')}:</span>
                      <span className="font-mono text-foreground text-foreground">{selectedLog.actor_ip || "N/A"}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground">{t('audit.details.ua')}:</span>
                      <span className="text-sub text-muted-foreground break-all leading-relaxed bg-white/50 bg-card/50 p-1.5 rounded">
                        {selectedLog.user_agent || "N/A"}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sub text-muted-foreground uppercase font-bold">{t('audit.details.metadata')}</p>
                    <div className="p-2 rounded bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30">
                      <pre className="text-sub text-amber-800 dark:text-amber-400 whitespace-pre-wrap font-mono">
                        {JSON.stringify(selectedLog.metadata, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {(selectedLog.before_json || selectedLog.after_json) && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <p className="text-sub text-muted-foreground uppercase font-bold flex items-center gap-1">
                      <FileJson className="h-3 w-3" /> {t('audit.details.dataChange')}
                    </p>
                    <div className="flex items-center gap-2 text-sub">
                      <div className="flex-1 p-2 rounded bg-rose-50/50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/20">
                        <span className="block text-rose-600 dark:text-rose-400 font-bold mb-1">{t('audit.details.before')}</span>
                        <pre className="font-mono text-2xs overflow-auto max-h-[100px] text-muted-foreground">
                          {JSON.stringify(selectedLog.before_json, null, 2)}
                        </pre>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0" />
                      <div className="flex-1 p-2 rounded bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/20">
                        <span className="block text-emerald-600 dark:text-emerald-400 font-bold mb-1">{t('audit.details.after')}</span>
                        <pre className="font-mono text-2xs overflow-auto max-h-[100px] text-muted-foreground">
                          {JSON.stringify(selectedLog.after_json, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card className="border-dashed border-border /30 bg-card/30 border-border h-[400px] flex items-center justify-center text-center p-6">
              <div className="space-y-3">
                <div className="h-12 w-12 bg-card rounded-full flex items-center justify-center mx-auto shadow-sm">
                  <Activity className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-foreground">{t('audit.details.noSelection')}</h4>
                  <p className="text-xs text-muted-foreground max-w-[200px] mt-1">
                    {t('audit.details.selectionDesc')}
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
