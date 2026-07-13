"use client"

import React, { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Save, ShieldCheck, Zap, Settings2, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { BranchSelect } from "@/features/branches/components/BranchSelect"
import { useSettings, useUpdateSettings, useCreateSettings } from "../hooks/useProductionPlanning"
import { ProductionDaySettings, PosBlockMode } from "../types"
import { toast } from "sonner"
import { toastApiError } from "@/lib/operationalToast"

export function SettingsPanel() {
  const t = useTranslations("production.settingsPanel")
  const [selectedBranch, setSelectedBranch] = useState<string>("ALL")

  const branchParam = selectedBranch === "ALL" ? undefined : selectedBranch
  const { data: settingsData, isLoading } = useSettings(branchParam ? { branch_id: branchParam } : undefined)
  const { mutate: updateSettings, isPending: isUpdating } = useUpdateSettings()
  const { mutate: createSettings, isPending: isCreating } = useCreateSettings()

  const settingsList: ProductionDaySettings[] = settingsData?.results || settingsData || []
  const currentSettings = settingsList.length > 0 ? settingsList[0] : null

  const [formData, setFormData] = useState<Partial<ProductionDaySettings>>({
    pos_block_mode: "WARN",
    default_safety_factor: 1.0
  })

  useEffect(() => {
    if (currentSettings) {
      setFormData({
        pos_block_mode: currentSettings.pos_block_mode,
        default_safety_factor: currentSettings.default_safety_factor
      })
    } else {
      setFormData({
        pos_block_mode: "WARN",
        default_safety_factor: 1.0
      })
    }
  }, [currentSettings, selectedBranch])

  const handleSave = () => {
    if (currentSettings?.id) {
      updateSettings(
        { id: currentSettings.id, data: formData },
        {
          onSuccess: () => toast.success(t("toastUpdated")),
          onError: (err) => toastApiError(err, t("toastUpdateError"))
        }
      )
    } else {
      const payload: ProductionDaySettings = {
        pos_block_mode: formData.pos_block_mode ?? "WARN",
        default_safety_factor: formData.default_safety_factor ?? 1.0,
        branch: selectedBranch === "ALL" ? null : selectedBranch,
      }
      createSettings(
        payload,
        {
          onSuccess: () => toast.success(t("toastSaved")),
          onError: (err) => toastApiError(err, t("toastSaveError"))
        }
      )
    }
  }

  const isPending = isUpdating || isCreating

  return (
    <div className="space-y-6 p-6">
      {/* HEADER SECTION */}
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-3">
          <Settings2 className="text-blue-600" size={20} /> {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5 dark:text-muted-foreground">
          {t("subtitle")}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Label className="text-sm text-muted-foreground">
            {t("branch")}
          </Label>
          <div className="w-64">
            <BranchSelect
              value={selectedBranch}
              onChange={setSelectedBranch}
              includeAll
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="text-sm text-muted-foreground">{t("loading")}</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* POS KISIT MODU KARTI */}
          <Card className="p-0 gap-0 border-border bg-card border-border overflow-hidden">
            <CardHeader className="p-4 border-b border-border bg-muted/40 border-border">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0" /> {t("posCardTitle")}
              </CardTitle>
              <CardDescription className="text-xs">{t("posCardDesc")}</CardDescription>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">{t("workMode")}</Label>
                <Select
                  value={formData.pos_block_mode}
                  onValueChange={(val) => setFormData(prev => ({ ...prev, pos_block_mode: val as PosBlockMode }))}
                >
                  <SelectTrigger className="w-full h-10 bg-card border-border shadow-sm">
                    <SelectValue>
                      {formData.pos_block_mode === 'BLOCK' ? t("modeBlock") : 
                       formData.pos_block_mode === 'WARN' ? t("modeWarn") : 
                       formData.pos_block_mode === 'OFF' ? t("modeOff") : t("modePlaceholder")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BLOCK">{t("modeBlock")}</SelectItem>
                    <SelectItem value="WARN">{t("modeWarn")}</SelectItem>
                    <SelectItem value="OFF">{t("modeOff")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3 bg-muted/30 p-4 rounded-lg border border-slate-100 border-border">
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                  <p className="text-sub text-muted-foreground leading-relaxed">
                    <strong>{t("blockExplain")}</strong> {t("blockText")}
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <p className="text-sub text-muted-foreground leading-relaxed">
                    <strong>{t("warnExplain")}</strong> {t("warnText")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* PLANLAMA ALGORİTMASI KARTI */}
          <Card className="p-0 gap-0 border-border bg-card border-border overflow-hidden flex flex-col">
            <CardHeader className="p-4 border-b border-border bg-muted/40 border-border">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500 shrink-0" /> {t("algoCardTitle")}
              </CardTitle>
              <CardDescription className="text-xs">{t("algoCardDesc")}</CardDescription>
            </CardHeader>

            <CardContent className="p-6 space-y-6 flex-1 flex flex-col">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">{t("safetyFactor")}</Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    step="0.01"
                    min="1.0"
                    className="h-9 pl-9 pr-8 bg-card border-border"
                    value={formData.default_safety_factor || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, default_safety_factor: parseFloat(e.target.value) || 1.0 }))}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">x</span>
                </div>
                <p className="text-2xs text-muted-foreground italic">
                  {t("safetyHint")}
                </p>
              </div>

              <div className="mt-auto pt-6 flex justify-end">
                <Button
                  onClick={handleSave}
                  disabled={isPending}
                  className="gap-2 bg-blue-600 hover:bg-blue-700 h-9 px-6 shadow-sm font-semibold transition-all active:scale-[0.98]"
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {isPending ? t("saving") : t("save")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
