"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import api from "@/lib/api"
import { toast } from "sonner"
import { useBranchContext } from "@/hooks/useBranchContext"
import { useModulePermissions } from "@/hooks/useModulePermissions"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import { SettingsForm } from "./pos-settings/SettingsForm"
import { SlideTable } from "./pos-settings/SlideTable"
import { PosTerminalsPanel } from "./pos-settings/PosTerminalsPanel"
import type { DisplaySettings, PromotionSlide, PosTerminal } from "./pos-settings/types"

function firstSettingsRow(res: { data?: { results?: DisplaySettings[] } }): DisplaySettings | undefined {
  const r = res.data?.results
  if (!Array.isArray(r) || r.length === 0) return undefined
  return r[0]
}

export function PosSettingsTab() {
  const t = useTranslations("admin")
  const { canManage } = useModulePermissions()
  const canManagePosDisplay = canManage("pos.manage_display")
  const {
    branchList,
    setBranchOverride,
    effectiveBranchId,
    branchName,
    showBranchPicker,
  } = useBranchContext({ queryKey: "pos-settings-branch" })

  const defaultSettingsTemplate = useMemo((): Omit<DisplaySettings, "branch"> => ({
    id: 0,
    idle_timeout: 30,
    transition_speed: 5,
    show_clock: true,
    welcome_title: t('posSettings.defaults.welcomeTitle'),
    welcome_subtitle: t('posSettings.defaults.welcomeSubtitle'),
    order_success_title: t('posSettings.defaults.orderSuccessTitle'),
    order_success_subtitle: t('posSettings.defaults.orderSuccessSubtitle'),
    payment_success_title: t('posSettings.defaults.paymentSuccessTitle'),
    payment_success_subtitle: t('posSettings.defaults.paymentSuccessSubtitle'),
    success_message_duration: 5,
    pos_terminal: null,
  }), [t])

  const [targetPosTerminalId, setTargetPosTerminalId] = useState<string | null>(null)
  const [terminals, setTerminals] = useState<PosTerminal[]>([])

  const [settings, setSettings] = useState<DisplaySettings | null>(null)
  const [slides, setSlides] = useState<PromotionSlide[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingSlide, setEditingSlide] = useState<PromotionSlide | null>(null)
  const [slideToDelete, setSlideToDelete] = useState<string | number | null>(null)

  useEffect(() => {
    setTargetPosTerminalId(null)
  }, [effectiveBranchId])

  const fetchTerminals = useCallback(() => {
    if (!effectiveBranchId) {
      setTerminals([])
      return
    }
    void api
      .get<{ results?: PosTerminal[] } | PosTerminal[]>("/pos-display/terminals/", {
        params: { branch_id: effectiveBranchId },
      })
      .then((res) => {
        const raw = res.data
        const list = Array.isArray(raw) ? raw : raw.results ?? []
        setTerminals(list.filter((x) => x.is_active))
      })
      .catch(() => setTerminals([]))
  }, [effectiveBranchId])

  useEffect(() => {
    fetchTerminals()
  }, [fetchTerminals])

  const fetchData = useCallback(async () => {
    if (!effectiveBranchId) return
    try {
      const baseParams = { branch_id: effectiveBranchId }
      const scopedParams = targetPosTerminalId
        ? { ...baseParams, pos_terminal_id: targetPosTerminalId }
        : baseParams

      const settingsPromise = api.get("/pos-display/settings/", { params: scopedParams })
      const slidesPromise = api.get("/pos-display/slides/", { params: scopedParams })
      const branchDefaultPromise = targetPosTerminalId
        ? api.get("/pos-display/settings/", { params: baseParams })
        : Promise.resolve({ data: { results: [] as DisplaySettings[] } })

      const [settingsRes, slidesRes, branchDefaultRes] = await Promise.all([
        settingsPromise,
        slidesPromise,
        branchDefaultPromise,
      ])

      let settingsData = firstSettingsRow(settingsRes as { data: { results?: DisplaySettings[] } })
      if (targetPosTerminalId) {
        if (!settingsData) {
          const branchDefault = firstSettingsRow(branchDefaultRes as { data: { results?: DisplaySettings[] } })
          settingsData = branchDefault
            ? {
                ...branchDefault,
                id: 0,
                pos_terminal: targetPosTerminalId,
                branch: effectiveBranchId,
              }
            : {
                ...defaultSettingsTemplate,
                branch: effectiveBranchId,
                pos_terminal: targetPosTerminalId,
              }
        } else {
          settingsData = { ...settingsData, branch: settingsData.branch ?? effectiveBranchId }
        }
      } else {
        if (!settingsData) {
          settingsData = { ...defaultSettingsTemplate, branch: effectiveBranchId, pos_terminal: null }
        } else {
          settingsData = { ...settingsData, branch: settingsData.branch ?? effectiveBranchId, pos_terminal: null }
        }
      }

      setSettings(settingsData)

      const sd = slidesRes.data as { results?: PromotionSlide[] } | PromotionSlide[]
      const slideList = Array.isArray(sd) ? sd : sd.results ?? []
      setSlides(slideList)
    } catch (error) {
      console.error("Failed to fetch POS settings:", error)
    }
  }, [effectiveBranchId, targetPosTerminalId, defaultSettingsTemplate])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!settings || !effectiveBranchId) return
    setIsSaving(true)
    try {
      const payload = {
        ...settings,
        branch: effectiveBranchId,
        pos_terminal: targetPosTerminalId ?? null,
      }
      const isNew = !settings.id || settings.id === 0
      const res = isNew
        ? await api.post("/pos-display/settings/", payload)
        : await api.patch(`/pos-display/settings/${settings.id}/`, payload)
      setSettings({ ...res.data, branch: res.data.branch ?? effectiveBranchId })
      toast.success(t('posSettings.messages.saveSuccess'))
    } catch {
      toast.error(t('posSettings.messages.saveError'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleApplyChanges = async () => {
    if (!effectiveBranchId) return
    setIsApplying(true)
    try {
      await api.post("/pos-display/settings/apply-changes/", {
        branch_id: effectiveBranchId,
        pos_terminal_id: targetPosTerminalId ?? null,
      })
      toast.success(t('posSettings.messages.applySuccess'))
    } catch {
      toast.error(t('posSettings.messages.applyError'))
    } finally {
      setIsApplying(false)
    }
  }

  const handleSaveSlide = async (formData: FormData) => {
    if (!effectiveBranchId) return
    formData.append("branch", effectiveBranchId)
    if (targetPosTerminalId) {
      formData.append("pos_terminal", targetPosTerminalId)
    }
    setIsSaving(true)
    try {
      const headers = { "Content-Type": "multipart/form-data" }
      const slideParams = { branch_id: effectiveBranchId }
      if (editingSlide) {
        const res = await api.patch(`/pos-display/slides/${editingSlide.id}/`, formData, {
          headers,
          params: slideParams,
        })
        setSlides(prev => prev.map(s => s.id === editingSlide.id ? res.data : s))
      } else {
        const res = await api.post("/pos-display/slides/", formData, {
          headers,
          params: slideParams,
        })
        setSlides(prev => [...prev, res.data])
      }
      setIsDialogOpen(false)
      setEditingSlide(null)
      toast.success(t('posSettings.messages.slideSaveSuccess'))
    } catch {
      toast.error(t('posSettings.messages.slideSaveError'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteSlide = async () => {
    if (!slideToDelete || !effectiveBranchId) return
    try {
      await api.delete(`/pos-display/slides/${slideToDelete}/`, {
        params: { branch_id: effectiveBranchId },
      })
      setSlides(prev => prev.filter(s => s.id !== slideToDelete))
      toast.success(t('posSettings.messages.slideDeleteSuccess'))
    } catch {
      toast.error(t('posSettings.messages.slideDeleteError'))
    } finally {
      setSlideToDelete(null)
    }
  }

  const handleToggleSlide = async (slide: PromotionSlide) => {
    try {
      const res = await api.patch(
        `/pos-display/slides/${slide.id}/`,
        { is_active: !slide.is_active },
        { params: { branch_id: effectiveBranchId! } },
      )
      setSlides(prev => prev.map(s => s.id === slide.id ? res.data : s))
      toast.success(t(slide.is_active ? 'posSettings.messages.slideDeactivated' : 'posSettings.messages.slideActivated'))
    } catch {
      toast.error(t('posSettings.messages.statusUpdateError'))
    }
  }

  const slideScopeLabel = useCallback(
    (slide: PromotionSlide) => {
      if (!slide.pos_terminal) return t('posSettings.slideScopeAll')
      const tm = terminals.find((x) => x.id === slide.pos_terminal)
      return tm ? `${tm.name} (${tm.code})` : slide.pos_terminal
    },
    [t, terminals],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-3">
           {t('posSettings.title')}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5 dark:text-muted-foreground">
            {t('posSettings.description')}
          </p>
        </div>
        {effectiveBranchId && (
          <button
            onClick={handleApplyChanges}
            disabled={isApplying}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors cursor-pointer self-start md:self-auto"
          >
            {isApplying ? (
              <>
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {t('posSettings.applyingChanges')}
              </>
            ) : (
              t('posSettings.applyChanges')
            )}
          </button>
        )}
      </div>

      <div>
        {(showBranchPicker || branchList.length > 1) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label htmlFor="pos-settings-branch" className="text-sm text-muted-foreground">
              {t('posSettings.branchLabel')}
            </label>
            <select
              id="pos-settings-branch"
              value={effectiveBranchId}
              onChange={e => setBranchOverride(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm border-border bg-card text-foreground"
            >
              {branchList.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {branchName && branchList.length <= 1 ? (
              <span className="text-xs text-muted-foreground">{branchName}</span>
            ) : null}
          </div>
        )}
        {effectiveBranchId ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label htmlFor="pos-display-scope" className="text-sm text-muted-foreground shrink-0">
              {t('posSettings.displayScopeLabel')}
            </label>
            <select
              id="pos-display-scope"
              value={targetPosTerminalId ?? ""}
              onChange={e => setTargetPosTerminalId(e.target.value.trim() ? e.target.value : null)}
              className="min-w-[220px] rounded-lg border border-border px-3 py-2 text-sm border-border bg-card text-foreground"
            >
              <option value="">{t('posSettings.branchDefaultScope')}</option>
              {terminals.map(tm => (
                <option key={tm.id} value={tm.id}>{tm.name} ({tm.code})</option>
              ))}
            </select>
            <p className="text-2xs text-muted-foreground max-w-xl">
              {targetPosTerminalId ? t('posSettings.displayScopeHintTerminal') : t('posSettings.displayScopeHintBranch')}
            </p>
          </div>
        ) : null}
      </div>

      {!effectiveBranchId ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">{t('posSettings.noBranchError')}</p>
      ) : (
        <>
          <PosTerminalsPanel
            branchId={effectiveBranchId}
            branchList={branchList}
            setBranchOverride={setBranchOverride}
            canManage={canManagePosDisplay}
            onUpdated={fetchTerminals}
          />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <div className="space-y-6">
              {settings && (
                <SettingsForm
                  settings={settings}
                  isSaving={isSaving}
                  onSubmit={handleUpdateSettings}
                  onChange={setSettings}
                />
              )}
            </div>

            <div className="xl:col-span-2 space-y-6">
              <SlideTable
                slides={slides}
                isDialogOpen={isDialogOpen}
                editingSlide={editingSlide}
                isSaving={isSaving}
                slideScopeLabel={slideScopeLabel}
                onDialogOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingSlide(null) }}
                onEditSlide={(slide) => { setEditingSlide(slide); setIsDialogOpen(true) }}
                onDeleteSlide={(id) => setSlideToDelete(id)}
                onToggleSlide={handleToggleSlide}
                onSaveSlide={handleSaveSlide}
              />
            </div>
          </div>
        </>
      )}

      <AlertDialog open={!!slideToDelete} onOpenChange={(open) => !open && setSlideToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('posSettings.modals.deleteSlideTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('posSettings.modals.deleteSlideDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDeleteSlide()
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
