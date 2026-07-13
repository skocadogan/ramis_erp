"use client"

import { useTranslations } from "next-intl"
import { Save, Clock, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import type { DisplaySettings } from "./types"

interface SettingsFormProps {
  settings: DisplaySettings
  isSaving: boolean
  onSubmit: (e: React.FormEvent) => void
  onChange: (updated: DisplaySettings) => void
}

export function SettingsForm({ settings, isSaving, onSubmit, onChange }: SettingsFormProps) {
  const t = useTranslations("pos")
  const set = (partial: Partial<DisplaySettings>) => onChange({ ...settings, ...partial })

  return (
    <Card className="p-0 gap-0 border-border bg-card border-border overflow-hidden">
      <CardHeader className="p-4 border-b border-border bg-muted/40 border-border">
        <CardTitle className="text-sm font-semibold flex items-center">
           {t('admin_settings.display.title')}
        </CardTitle>
        <CardDescription className="text-xs">{t('admin_settings.display.description')}</CardDescription>
      </CardHeader>
      <CardContent className="p-4">
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{t('admin_settings.display.idleLabel')}</Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="number"
                value={settings.idle_timeout}
                onChange={e => set({ idle_timeout: parseInt(e.target.value) })}
                className="pl-9 h-9"
                min={5}
              />
            </div>
            <p className="text-2xs text-muted-foreground">{t('admin_settings.display.idleHint')}</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">{t('admin_settings.display.transitionLabel')}</Label>
            <div className="relative">
              <Zap className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="number"
                value={settings.transition_speed}
                onChange={e => set({ transition_speed: parseInt(e.target.value) })}
                className="pl-9 h-9"
                min={1}
              />
            </div>
            <p className="text-2xs text-muted-foreground">{t('admin_settings.display.transitionHint')}</p>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30 border-border">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold text-foreground">{t('admin_settings.display.showClock')}</Label>
              <p className="text-2xs text-muted-foreground">{t('admin_settings.display.showClockHint')}</p>
            </div>
            <Switch checked={settings.show_clock} onCheckedChange={val => set({ show_clock: val })} />
          </div>

          <div className="space-y-3 pt-2 border-t border-border">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">{t('admin_settings.display.welcomeTitleLabel')}</Label>
              <Input value={settings.welcome_title} onChange={e => set({ welcome_title: e.target.value })} className="h-9" placeholder="RAMIS ERP" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">{t('admin_settings.display.welcomeSubtitleLabel')}</Label>
              <Input value={settings.welcome_subtitle} onChange={e => set({ welcome_subtitle: e.target.value })} className="h-9" placeholder="Şeffaf ve Profesyonel Hizmet" />
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-border">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-500" /> {t('admin_settings.display.successMessagesTitle')}
            </CardTitle>
            <div className="space-y-4 /50 bg-card/30 p-4 rounded-lg border border-border">
              <div className="space-y-2">
                <Label className="text-2xs font-bold uppercase text-primary">{t('admin_settings.display.orderSuccessTitleLabel')}</Label>
                <Input value={settings.order_success_title} onChange={e => set({ order_success_title: e.target.value })} className="h-9 text-sm" placeholder={t('admin_settings.display.titleLabel')} />
                <Input value={settings.order_success_subtitle} onChange={e => set({ order_success_subtitle: e.target.value })} className="h-9 text-xs" placeholder={t('admin_settings.display.subtitleLabel')} />
              </div>
              <div className="space-y-2 mt-4">
                <Label className="text-2xs font-bold uppercase text-emerald-500">{t('admin_settings.display.paymentSuccessTitleLabel')}</Label>
                <Input value={settings.payment_success_title} onChange={e => set({ payment_success_title: e.target.value })} className="h-9 text-sm" placeholder={t('admin_settings.display.titleLabel')} />
                <Input value={settings.payment_success_subtitle} onChange={e => set({ payment_success_subtitle: e.target.value })} className="h-9 text-xs" placeholder={t('admin_settings.display.subtitleLabel')} />
              </div>
              <div className="space-y-1.5 mt-4">
                <Label className="text-2xs font-bold uppercase text-muted-foreground">{t('admin_settings.display.durationLabel')}</Label>
                <Input type="number" value={settings.success_message_duration} onChange={e => set({ success_message_duration: parseInt(e.target.value) })} className="h-9 text-sm" min={1} />
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 h-9 text-sm-white" disabled={isSaving}>
            {isSaving ? t('admin_settings.display.saving') : <><Save className="mr-2 h-4 w-4" /> {t('admin_settings.display.saveSettings')}</>}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
